const QUIZ_MINUTES = 30;
const QUESTION_COUNT = 50;
const SHEET_QUESTIONS = 'Questions';
const SHEET_ATTEMPTS = 'Attempts';
const SHEET_RESULTS = 'Results';
const ANSWER_LETTERS = ['A','B','C','D'];

function doGet(e) {
  return json_({
    ok: true,
    message: 'ECE Quiz API is running'
  });
}

function doPost(e) {
  try {
    const raw = e && e.parameter ? e.parameter.payload : '';
    const req = JSON.parse(raw || '{}');
    let out;

    switch (req.action) {
      case 'startAttempt':
        out = startAttempt_(req);
        break;
      case 'submitAttempt':
        out = submitAttempt_(req);
        break;
      case 'adminResults':
        checkAdmin_(req.adminPassword);
        out = { results: rankedResults_() };
        break;
      default:
        throw new Error('Unknown action.');
    }

    return json_(Object.assign({ok: true}, out));
  } catch (err) {
    return json_({ok: false, error: String(err.message || err)});
  }
}

function setupQuiz() {
  const ss = SpreadsheetApp.getActive();

  ensureSheet_(ss, SHEET_QUESTIONS, [
    'ID','Question','Option A','Option B','Option C','Option D','Correct Answer'
  ]);

  ensureSheet_(ss, SHEET_ATTEMPTS, [
    'Participant ID','Name','Email','Institution','Token Hash','Started At','Deadline At','Status'
  ]);

  const results = ensureSheet_(ss, SHEET_RESULTS, [
    'Participant ID','Name','Email','Institution','Score','Time Taken Seconds','Started At','Submitted At','Answered Count'
  ]);

  // Upgrade an older Results sheet without deleting existing submissions.
  if (results.getLastColumn() < 9) {
    results.getRange(1, 9).setValue('Answered Count');
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
}

function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    'Set organizer password',
    'Enter a strong organizer password. It will be stored in Script Properties, not in GitHub.',
    ui.ButtonSet.OK_CANCEL
  );

  if (r.getSelectedButton() === ui.Button.OK) {
    const p = r.getResponseText();
    if (p.length < 8) throw new Error('Use at least 8 characters.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD_HASH', hash_(p));
    ui.alert('Organizer password saved.');
  }
}

function importQuestionsFromJson() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    'Import questions',
    'Enter the exact Google Drive filename:',
    ui.ButtonSet.OK_CANCEL
  );

  if (r.getSelectedButton() !== ui.Button.OK) return;

  const fileName = r.getResponseText().trim();
  if (!fileName) throw new Error('Please enter a filename.');

  const files = DriveApp.getFilesByName(fileName);
  if (!files.hasNext()) throw new Error('File not found in Google Drive: ' + fileName);

  const file = files.next();
  const questions = JSON.parse(file.getBlob().getDataAsString('UTF-8'));

  validateQuestionJson_(questions);

  const sh = db_().getSheetByName(SHEET_QUESTIONS);
  sh.clearContents();
  sh.getRange(1, 1, 1, 7).setValues([[
    'ID','Question','Option A','Option B','Option C','Option D','Correct Answer'
  ]]);

  // IMPORTANT: store the answer key as A/B/C/D, not 0/1/2/3.
  // This makes the sheet human-auditable and eliminates null-to-zero coercion bugs.
  const rows = questions.map((q, i) => [
    i + 1,
    q.q,
    q.options[0],
    q.options[1],
    q.options[2],
    q.options[3],
    ANSWER_LETTERS[q.answer]
  ]);

  sh.getRange(2, 1, rows.length, 7).setValues(rows);
  ui.alert('Success', 'Imported ' + rows.length + ' questions. Correct Answer is stored as A/B/C/D.', ui.ButtonSet.OK);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ECE Quiz Setup')
    .addItem('1. Create/repair sheets', 'setupQuiz')
    .addItem('2. Set organizer password', 'setAdminPassword')
    .addItem('3. Import questions JSON', 'importQuestionsFromJson')
    .addToUi();
}

function startAttempt_(r) {
  const name = clean_(r.name, 80);
  const pid = clean_(r.participantId, 40);
  const email = clean_(r.email, 120);
  const inst = clean_(r.institution, 120);

  if (!name || !pid) throw new Error('Name and Participant ID are required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // Validate/load the exact 50-question bank BEFORE creating the attempt row.
    const qs = getQuestions_();
    const sh = db_().getSheetByName(SHEET_ATTEMPTS);
    const data = sh.getDataRange().getValues();

    if (data.slice(1).some(x => String(x[0]).trim().toLowerCase() === pid.toLowerCase())) {
      throw new Error('This Participant ID has already started or submitted the quiz.');
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + QUIZ_MINUTES * 60000);
    const token = Utilities.getUuid() + Utilities.getUuid();

    sh.appendRow([
      pid, name, email, inst, hash_(token), now, deadline, 'STARTED'
    ]);

    return {
      attemptToken: token,
      deadlineMs: deadline.getTime(),
      questions: qs.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options
      }))
    };
  } finally {
    lock.releaseLock();
  }
}

function submitAttempt_(r) {
  if (!r.attemptToken) throw new Error('Invalid submission: missing attempt token.');
  if (!r.answers || Array.isArray(r.answers) || typeof r.answers !== 'object') {
    throw new Error('Invalid submission: answers must be an object keyed by question ID.');
  }

  const tokenHash = hash_(r.attemptToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const attemptSheet = db_().getSheetByName(SHEET_ATTEMPTS);
    const attemptData = attemptSheet.getDataRange().getValues();
    let row = -1;
    let attempt;

    for (let i = 1; i < attemptData.length; i++) {
      if (String(attemptData[i][4]) === tokenHash) {
        row = i + 1;
        attempt = attemptData[i];
        break;
      }
    }

    if (row < 0) throw new Error('Attempt not found.');
    if (String(attempt[7]) === 'SUBMITTED') throw new Error('This attempt was already submitted.');

    const now = new Date();
    const started = new Date(attempt[5]);
    const deadline = new Date(attempt[6]);

    if (now.getTime() > deadline.getTime() + 120000) {
      throw new Error('Submission window has expired.');
    }

    const qs = getQuestions_();
    const validIds = Object.create(null);
    qs.forEach(q => { validIds[String(q.id)] = true; });

    const submittedIds = Object.keys(r.answers);
    if (submittedIds.length > QUESTION_COUNT) {
      throw new Error('Too many answers were submitted.');
    }

    // Reject IDs that are not part of this quiz.
    submittedIds.forEach(id => {
      if (!validIds[String(id)]) {
        throw new Error('Invalid question ID in submission: ' + id);
      }
    });

    let score = 0;
    let answeredCount = 0;

    // ACCURATE MARKING RULE:
    // - Only a question ID explicitly present in r.answers is considered answered.
    // - A missing question ID means unanswered => 0 marks.
    // - A submitted answer MUST be exactly A, B, C or D.
    // - There is NO Number(null), Number('') or undefined coercion.
    qs.forEach(q => {
      const id = String(q.id);

      if (!Object.prototype.hasOwnProperty.call(r.answers, id)) {
        return; // UNANSWERED: zero marks.
      }

      const submitted = normalizeSubmittedAnswer_(r.answers[id], id);
      answeredCount++;

      if (submitted === q.answer) {
        score++;
      }
    });

    // Safety invariant: score can never exceed number of answered questions.
    if (score < 0 || score > answeredCount || answeredCount > QUESTION_COUNT) {
      throw new Error('Internal scoring validation failed.');
    }

    const elapsed = Math.max(
      0,
      Math.min(
        Math.round((now.getTime() - started.getTime()) / 1000),
        QUIZ_MINUTES * 60
      )
    );

    const results = db_().getSheetByName(SHEET_RESULTS);
    // Score is written only to the private organizer sheet.
    results.appendRow([
      attempt[0],
      attempt[1],
      attempt[2],
      attempt[3],
      score,
      elapsed,
      started,
      now,
      answeredCount
    ]);

    attemptSheet.getRange(row, 8).setValue('SUBMITTED');

    // Participant never receives score or correct answers.
    return {
      timeTakenSeconds: elapsed,
      answeredCount: answeredCount
    };
  } finally {
    lock.releaseLock();
  }
}

function rankedResults_() {
  const sh = db_().getSheetByName(SHEET_RESULTS);
  const v = sh.getDataRange().getValues().slice(1).filter(r => r[0]);

  v.sort((a, b) =>
    Number(b[4]) - Number(a[4]) ||
    Number(a[5]) - Number(b[5]) ||
    new Date(a[7]) - new Date(b[7])
  );

  return v.map((r, i) => ({
    rank: i + 1,
    name: r[1],
    participantId: r[0],
    email: r[2],
    institution: r[3],
    score: Number(r[4]),
    timeTakenSeconds: Number(r[5]),
    submittedAt: new Date(r[7]).toISOString(),
    answeredCount: r.length >= 9 && r[8] !== '' ? Number(r[8]) : null
  }));
}

function getQuestions_() {
  const sh = db_().getSheetByName(SHEET_QUESTIONS);
  if (!sh) throw new Error('Questions sheet not found.');

  const values = sh.getDataRange().getValues().slice(1).filter(r => String(r[1]).trim() !== '');
  if (values.length !== QUESTION_COUNT) {
    throw new Error('Organizer has not loaded exactly 50 questions yet.');
  }

  const seen = Object.create(null);
  const questions = values.map((r, index) => {
    const id = Number(r[0]);
    if (!Number.isInteger(id) || id < 1 || id > QUESTION_COUNT) {
      throw new Error('Invalid question ID at sheet row ' + (index + 2) + '.');
    }
    if (seen[String(id)]) {
      throw new Error('Duplicate question ID: ' + id);
    }
    seen[String(id)] = true;

    const options = [r[2], r[3], r[4], r[5]].map(x => String(x ?? '').trim());
    if (options.some(x => !x)) {
      throw new Error('Question ' + id + ' must have four non-empty options.');
    }

    const answer = normalizeCorrectAnswer_(r[6], id);

    return {
      id: id,
      question: String(r[1]),
      options: options,
      answer: answer
    };
  });

  for (let id = 1; id <= QUESTION_COUNT; id++) {
    if (!seen[String(id)]) throw new Error('Missing question ID: ' + id);
  }

  questions.sort((a, b) => a.id - b.id);
  return questions;
}

function validateQuestionJson_(questions) {
  if (!Array.isArray(questions) || questions.length !== QUESTION_COUNT) {
    throw new Error('Expected exactly 50 questions.');
  }

  questions.forEach((q, i) => {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) {
      throw new Error('Invalid question text at question ' + (i + 1) + '.');
    }
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim())) {
      throw new Error('Question ' + (i + 1) + ' must have four non-empty options.');
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      throw new Error('Question ' + (i + 1) + ' has an invalid answer index.');
    }
  });
}

function normalizeCorrectAnswer_(raw, id) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new Error('Question ' + id + ' has a blank correct answer.');
  }

  const s = String(raw).trim().toUpperCase();
  if (/^[ABCD]$/.test(s)) return s;
  if (/^[0-3]$/.test(s)) return ANSWER_LETTERS[Number(s)];

  throw new Error('Question ' + id + ' has an invalid correct answer. Use A/B/C/D.');
}

function normalizeSubmittedAnswer_(raw, id) {
  // Explicitly reject null/undefined/empty. Missing key means unanswered.
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new Error('Question ' + id + ' contains an empty submitted answer.');
  }

  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (/^[ABCD]$/.test(s)) return s;
    throw new Error('Invalid answer for question ' + id + '.');
  }

  // Temporary backward compatibility for an old frontend that sends 0/1/2/3.
  // This path still rejects null and any out-of-range value.
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 3) {
    return ANSWER_LETTERS[raw];
  }

  throw new Error('Invalid answer for question ' + id + '.');
}

function checkAdmin_(p) {
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  if (!saved || !p || hash_(p) !== saved) throw new Error('Access denied.');
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run setupQuiz() first.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function hash_(s) {
  const b = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(s),
    Utilities.Charset.UTF_8
  );
  return b.map(x => (x + 256) % 256)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function clean_(s, n) {
  return String(s || '').trim().replace(/[\r\n\t]/g, ' ').slice(0, n);
}

function json_(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
