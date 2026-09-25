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

async function login(){
  password = $('password').value;
  $('loginError').textContent = '';
  try{
    $('loginBtn').disabled = true;
    await load();
    $('loginCard').hidden = true;
    $('dashboard').hidden = false;
  }catch(e){
    $('loginError').textContent = e.message;
  }finally{
    $('loginBtn').disabled = false;
  }
}

async function load(){
  const d = await QuizAPI.call('adminResults', {adminPassword: password}, {
    timeoutMs: 10000,
    retries: 4,
    onRetry: info => $('dashError').textContent = `Server busy — retrying (${info.attempt}/${info.totalAttempts})…`
  });

  results = d.results;
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
$('csvBtn').onclick = csv;
$('logoutBtn').onclick = () => location.reload();
