const QUIZ_MINUTES=30;
const SHEET_QUESTIONS='Questions', SHEET_ATTEMPTS='Attempts', SHEET_RESULTS='Results';

function doGet(e){
  return ContentService
    .createTextOutput(JSON.stringify({
      ok:true,
      message:'ECE Quiz API is running'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e){
  try{
    const req=JSON.parse((e.parameter&&e.parameter.payload)||'{}');
    let out;
    switch(req.action){
      case 'startAttempt':out=startAttempt_(req);break;
      case 'submitAttempt':out=submitAttempt_(req);break;
      case 'adminResults':
        checkAdmin_(req.adminPassword);
        out={results:rankedResults_()};
        break;
      default:
        throw new Error('Unknown action.');
    }
    return json_({ok:true,...out});
  }catch(err){
    return json_({ok:false,error:String(err.message||err)});
  }
}

function setupQuiz(){
  const ss=SpreadsheetApp.getActive();
  ensureSheet_(ss,SHEET_QUESTIONS,['ID','Question','Option A','Option B','Option C','Option D','Correct Answer']);
  ensureSheet_(ss,SHEET_ATTEMPTS,['Participant ID','Name','Email','Institution','Token Hash','Started At','Deadline At','Status']);
  ensureSheet_(ss,SHEET_RESULTS,['Participant ID','Name','Email','Institution','Score','Time Taken Seconds','Started At','Submitted At']);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID',ss.getId());
}

function setAdminPassword(){
  const ui=SpreadsheetApp.getUi();
  const r=ui.prompt('Set organizer password','Enter a strong organizer password. It will be stored in Script Properties, not in GitHub.',ui.ButtonSet.OK_CANCEL);
  if(r.getSelectedButton()===ui.Button.OK){
    const p=r.getResponseText();
    if(p.length<8)throw new Error('Use at least 8 characters.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD_HASH',hash_(p));
    ui.alert('Organizer password saved.');
  }
}

function importQuestionsFromJson(){
  const ui=SpreadsheetApp.getUi();
  const r=ui.prompt('Import questions','Enter the exact Google Drive filename:',ui.ButtonSet.OK_CANCEL);
  if(r.getSelectedButton()!==ui.Button.OK)return;

  const fileName=r.getResponseText().trim();
  if(!fileName)throw new Error('Please enter a filename.');

  const files=DriveApp.getFilesByName(fileName);
  if(!files.hasNext())throw new Error('File not found in Google Drive: '+fileName);

  const file=files.next();
  const text=file.getBlob().getDataAsString('UTF-8');
  const questions=JSON.parse(text);

  if(!Array.isArray(questions))throw new Error('The JSON file must contain an array of questions.');
  if(questions.length!==50)throw new Error('Expected exactly 50 questions, found '+questions.length);

  questions.forEach((q,i)=>{
    if(!q.q||!Array.isArray(q.options)||q.options.length!==4||typeof q.answer!=='number'||q.answer<0||q.answer>3){
      throw new Error('Invalid question format at question '+(i+1));
    }
  });

  const sh=db_().getSheetByName(SHEET_QUESTIONS);
  sh.clearContents();
  sh.appendRow(['ID','Question','Option A','Option B','Option C','Option D','Correct Answer']);

  const rows=questions.map((q,i)=>[
    i+1,q.q,q.options[0],q.options[1],q.options[2],q.options[3],q.answer
  ]);

  sh.getRange(2,1,rows.length,7).setValues(rows);
  ui.alert('Success','Imported '+rows.length+' questions from Google Drive.',ui.ButtonSet.OK);
}

function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('ECE Quiz Setup')
    .addItem('1. Create/repair sheets','setupQuiz')
    .addItem('2. Set organizer password','setAdminPassword')
    .addItem('3. Import questions JSON','importQuestionsFromJson')
    .addToUi();
}

function startAttempt_(r){
  const name=clean_(r.name,80),pid=clean_(r.participantId,40),email=clean_(r.email,120),inst=clean_(r.institution,120);
  if(!name||!pid)throw new Error('Name and Participant ID are required.');

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    const sh=db_().getSheetByName(SHEET_ATTEMPTS);
    const data=sh.getDataRange().getValues();

    if(data.slice(1).some(x=>String(x[0]).toLowerCase()===pid.toLowerCase())){
      throw new Error('This Participant ID has already started or submitted the quiz.');
    }

    const now=new Date();
    const deadline=new Date(now.getTime()+QUIZ_MINUTES*60000);
    const token=Utilities.getUuid()+Utilities.getUuid();

    sh.appendRow([pid,name,email,inst,hash_(token),now,deadline,'STARTED']);

    const q=getQuestions_().map(x=>({
      id:x.id,
      question:x.question,
      options:x.options
    }));

    return{
      attemptToken:token,
      deadlineMs:deadline.getTime(),
      questions:q
    };
  }finally{
    lock.releaseLock();
  }
}

function submitAttempt_(r){
  if(!r.attemptToken||!Array.isArray(r.answers))throw new Error('Invalid submission.');

  const tokenHash=hash_(r.attemptToken);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);

  try{
    const sh=db_().getSheetByName(SHEET_ATTEMPTS);
    const data=sh.getDataRange().getValues();
    let row=-1,a;

    for(let i=1;i<data.length;i++){
      if(data[i][4]===tokenHash){
        row=i+1;
        a=data[i];
        break;
      }
    }

    if(row<0)throw new Error('Attempt not found.');
    if(a[7]==='SUBMITTED')throw new Error('This attempt was already submitted.');

    const now=new Date();
    const started=new Date(a[5]);
    const deadline=new Date(a[6]);

    if(now.getTime()>deadline.getTime()+120000){
      throw new Error('Submission window has expired.');
    }

    const qs=getQuestions_();
    if(r.answers.length!==qs.length)throw new Error('Answer count does not match quiz.');

    // IMPORTANT: only explicitly selected answers are scored.
    // Unanswered questions are null/empty and must never be treated as option A (0).
    let score=0;
    qs.forEach((q,i)=>{
      const submitted=r.answers[i];
      if(submitted===null||submitted===undefined||submitted==='')return;
      if(Number(submitted)===Number(q.answer))score++;
    });

    const elapsed=Math.max(
      0,
      Math.min(
        Math.round((now-started)/1000),
        QUIZ_MINUTES*60
      )
    );

    db_().getSheetByName(SHEET_RESULTS).appendRow([
      a[0],a[1],a[2],a[3],score,elapsed,started,now
    ]);

    sh.getRange(row,8).setValue('SUBMITTED');

    // Score is retained for organizer results only; it is not displayed to participants.
    return{score,timeTakenSeconds:elapsed};
  }finally{
    lock.releaseLock();
  }
}

function rankedResults_(){
  const sh=db_().getSheetByName(SHEET_RESULTS);
  const v=sh.getDataRange().getValues().slice(1).filter(r=>r[0]);

  v.sort((a,b)=>
    Number(b[4])-Number(a[4])||
    Number(a[5])-Number(b[5])||
    new Date(a[7])-new Date(b[7])
  );

  return v.map((r,i)=>({
    rank:i+1,
    name:r[1],
    participantId:r[0],
    email:r[2],
    institution:r[3],
    score:Number(r[4]),
    timeTakenSeconds:Number(r[5]),
    submittedAt:new Date(r[7]).toISOString()
  }));
}

function getQuestions_(){
  const v=db_().getSheetByName(SHEET_QUESTIONS)
    .getDataRange().getValues().slice(1).filter(r=>r[1]);

  if(v.length!==50)throw new Error('Organizer has not loaded exactly 50 questions yet.');

  return v.map(r=>({
    id:r[0],
    question:r[1],
    options:[r[2],r[3],r[4],r[5]],
    answer:Number(r[6])
  }));
}

function checkAdmin_(p){
  const saved=PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  if(!saved||!p||hash_(p)!==saved)throw new Error('Access denied.');
}

function db_(){
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id)throw new Error('Run setupQuiz() first.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss,n,h){
  let s=ss.getSheetByName(n)||ss.insertSheet(n);
  if(s.getLastRow()===0)s.appendRow(h);
  return s;
}

function hash_(s){
  const b=Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(s),
    Utilities.Charset.UTF_8
  );
  return b.map(x=>(x+256)%256)
    .map(x=>x.toString(16).padStart(2,'0'))
    .join('');
}

function clean_(s,n){
  return String(s||'').trim().replace(/[\r\n\t]/g,' ').slice(0,n);
}

function json_(o){
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
