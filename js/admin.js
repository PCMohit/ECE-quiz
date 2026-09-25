const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[c]));
const fmt = s => {
  const total = Math.max(0, Number(s) || 0);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
};

let password = '';
let results = [];
let control = null;

async function login(){
  password = $('password').value;
  $('loginError').textContent = '';
  try{
    $('loginBtn').disabled = true;
    await load();
    $('loginCard').hidden = true;
    $('dashboard').hidden = false;
    updateControlUI();
  }catch(e){
    $('loginError').textContent = e.message;
  }finally{
    $('loginBtn').disabled = false;
  }
}

async function load(){
  const d = await QuizAPI.call('adminResults', {adminPassword: password}, {
    timeoutMs: 15000,
    retries: 2,
    retryDelaysMs: [800, 1800],
    onRetry: info => $('dashError').textContent = `Connecting to organizer database… (${info.attempt}/${info.totalAttempts})`
  });

  results = d.results || [];
  control = d.control || null;
  $('dashError').textContent = '';
  $('summary').textContent = `${results.length} submitted participant(s)`;

  $('resultsBody').innerHTML = results.map(x => `
    <tr>
      <td>${x.rank}</td>
      <td>${esc(x.name)}</td>
      <td>${esc(x.participantId)}</td>
      <td>${esc(x.email)}</td>
      <td>${esc(x.institution)}</td>
      <td><strong>${x.score}/50</strong></td>
      <td>${x.answeredCount ?? ''}/50</td>
      <td>${fmt(x.timeTakenSeconds)}</td>
      <td>${new Date(x.submittedAt).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="9">No submissions yet.</td></tr>';

  updateControlUI();
}

function localInputValueFromMs(ms){
  const d = new Date(Number(ms));
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function selectedStartMs(){
  const value = $('startDateTime').value;
  if (!value) throw new Error('Select a start date and time first.');
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid start date and time.');
  return ms;
}

function updateControlUI(){
  if (!control) return;
  const phase = control.phase || 'NOT_SET';
  $('schedulePhase').textContent = phase === 'NOT_SET' ? 'Not set' : phase;

  if (control.configured) {
    $('scheduleText').textContent = `Start: ${new Date(control.startAtMs).toLocaleString()} • Deadline: ${new Date(control.deadlineMs).toLocaleString()}`;
    if (!$('startDateTime').value || phase === 'NOT_SET') {
      $('startDateTime').value = localInputValueFromMs(control.startAtMs);
    }
  } else {
    $('scheduleText').textContent = 'No schedule. The first participant will automatically create a shared start 10 seconds ahead.';
  }
}

async function setStartTime(){
  $('controlStatus').textContent = '';
  try{
    $('setStartBtn').disabled = true;
    const d = await QuizAPI.call('setQuizStart', {
      adminPassword: password,
      startAtMs: selectedStartMs()
    }, {timeoutMs:15000, retries:2, retryDelaysMs:[800,1800]});
    control = d.control;
    updateControlUI();
    $('controlStatus').textContent = 'Quiz start time saved successfully.';
    $('controlStatus').className = 'status success';
  }catch(e){
    $('controlStatus').textContent = e.message;
    $('controlStatus').className = 'status error';
  }finally{
    $('setStartBtn').disabled = false;
  }
}

async function startNow(){
  $('controlStatus').textContent = '';
  try{
    $('startNowBtn').disabled = true;
    const d = await QuizAPI.call('startQuizNow', {adminPassword: password}, {timeoutMs:15000, retries:2, retryDelaysMs:[800,1800]});
    control = d.control;
    updateControlUI();
    $('controlStatus').textContent = 'Quiz will start for everyone in 10 seconds.';
    $('controlStatus').className = 'status success';
  }catch(e){
    $('controlStatus').textContent = e.message;
    $('controlStatus').className = 'status error';
  }finally{
    $('startNowBtn').disabled = false;
  }
}

async function clearSchedule(){
  if (!confirm('Clear the quiz start schedule? Do this only before any participant has registered for the event.')) return;
  $('controlStatus').textContent = '';
  try{
    $('clearStartBtn').disabled = true;
    const d = await QuizAPI.call('clearQuizStart', {adminPassword: password}, {timeoutMs:15000, retries:2, retryDelaysMs:[800,1800]});
    control = d.control;
    $('startDateTime').value = '';
    updateControlUI();
    $('controlStatus').textContent = 'Quiz start schedule cleared.';
    $('controlStatus').className = 'status success';
  }catch(e){
    $('controlStatus').textContent = e.message;
    $('controlStatus').className = 'status error';
  }finally{
    $('clearStartBtn').disabled = false;
  }
}

function csv(){
  const rows = [
    ['Rank','Name','Participant ID','Email','Institution','Score','Answered','Time Taken (sec)','Submitted At'],
    ...results.map(x => [x.rank,x.name,x.participantId,x.email,x.institution,x.score,x.answeredCount,x.timeTakenSeconds,x.submittedAt])
  ];
  const text = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  a.download = 'ece-quiz-results.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('loginBtn').onclick = login;
$('refreshBtn').onclick = () => load().catch(e => $('dashError').textContent = e.message);
$('setStartBtn').onclick = setStartTime;
$('startNowBtn').onclick = startNow;
$('clearStartBtn').onclick = clearSchedule;
$('csvBtn').onclick = csv;
$('logoutBtn').onclick = () => location.reload();
