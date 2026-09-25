let questions = Array.isArray(window.ECE_PUBLIC_QUESTIONS) ? window.ECE_PUBLIC_QUESTIONS : [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let deadlineMs = 0;
let timerId = null;
let submitting = false;
let startRequestId = null;
let submissionRequestId = null;

const QUESTION_COUNT = 50;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[c]));

function makeRequestId(prefix){
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function setStatus(message, type = 'muted'){
  const el = $('serverStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = `status ${type}`;
}

function startQuiz(){
  const name = $('name').value.trim();
  const participantId = $('roll').value.trim();
  const email = $('email').value.trim();
  const institution = $('institution').value.trim();

  $('regError').textContent = '';
  if (!name || !participantId || !email) {
    $('regError').textContent = 'Name, Participant ID, and Email are required.';
    return;
  }
  if (!questions || questions.length !== QUESTION_COUNT) {
    $('regError').textContent = 'The quiz question bank could not be loaded. Please refresh the page.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('regError').textContent = 'Please enter a valid email address.';
    return;
  }

  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Starting…';
  setStatus('Starting your quiz…', 'muted');
  startRequestId = makeRequestId('start');

  QuizAPI.call('startAttempt', {
    name,
    participantId,
    email,
    institution,
    startRequestId
  }, {
    timeoutMs: 5000,
    retries: 6,
    retryDelaysMs: [350, 700, 1200, 1800, 2500, 3000],
    onRetry: () => {
      $('startBtn').textContent = 'Retrying…';
      setStatus('Server is busy — retrying automatically…', 'warning');
    }
  }).then(d => {
    if (!d.attemptToken || !Number.isFinite(Number(d.deadlineMs))) {
      throw new Error('The quiz server returned an invalid attempt.');
    }

    attemptToken = d.attemptToken;
    deadlineMs = Number(d.deadlineMs);
    answers = Object.create(null);
    submissionRequestId = null;
    current = 0;
    submitting = false;

    $('registration').hidden = true;
    $('quiz').hidden = false;
    $('participantLabel').textContent = `${name} • ${participantId}`;
    render();
    startTimer();
  }).catch(e => {
    $('regError').textContent = e.message;
    startRequestId = null;
    setStatus(e.message, 'error');
    $('startBtn').disabled = false;
    $('startBtn').textContent = 'Start Quiz';
  });
}

function render(){
  const q = questions[current];
  const qid = String(q.id);

  $('progress').textContent = `Question ${current + 1} of ${questions.length}`;
  $('bar').style.width = `${(current + 1) * 100 / questions.length}%`;

  $('questionArea').innerHTML = `
    <div class="card question-card">
      <span class="eyebrow">Question ${current + 1}</span>
      <h2>${esc(q.question)}</h2>
      ${q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        return `<label class="option">
          <input type="radio" name="answer" value="${letter}" ${answers[qid] === letter ? 'checked' : ''}>
          <span><strong>${letter}.</strong> ${esc(o)}</span>
        </label>`;
      }).join('')}
    </div>`;

  document.querySelectorAll('input[name="answer"]').forEach(input => {
    input.onchange = () => { answers[qid] = input.value; };
  });

  $('prevBtn').disabled = current === 0;
  $('nextBtn').hidden = current === questions.length - 1;
  $('submitBtn').hidden = current !== questions.length - 1;
}

function startTimer(){
  clearInterval(timerId);
  updateTimer();
  timerId = setInterval(updateTimer, 500);
}

function updateTimer(){
  const left = Math.max(0, deadlineMs - Date.now());
  $('timer').textContent = fmtMs(left);

  if(left <= 0){
    clearInterval(timerId);
    submitQuiz(true);
  }
}

async function submitQuiz(auto = false){
  if(!attemptToken || submitting) return;

  submitting = true;
  clearInterval(timerId);
  if (!submissionRequestId) submissionRequestId = makeRequestId('submit');
  $('submitBtn').disabled = true;
  $('submitBtn').textContent = auto ? 'Submitting automatically…' : 'Submitting…';
  setStatus(auto ? 'Time is up. Saving your answers…' : 'Saving your answers…', 'muted');

  try{
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      submissionRequestId,
      answers: Object.assign({}, answers)
    }, {
      timeoutMs: 5000,
      retries: 8,
      retryDelaysMs: [300, 600, 1000, 1600, 2200, 2800, 3000, 3000],
      onRetry: () => {
        $('submitBtn').textContent = 'Retrying submission…';
        setStatus('Server is busy — retrying your submission automatically…', 'warning');
      }
    });

    $('quiz').hidden = true;
    $('result').hidden = false;
    if(auto) $('result').querySelector('h2').textContent = 'Time expired — quiz submitted';
    attemptToken = null;
    startRequestId = null;
    submissionRequestId = null;
    setStatus('', 'muted');
  }catch(e){
    submitting = false;
    $('submitBtn').disabled = false;
    $('submitBtn').textContent = 'Try Submission Again';
    setStatus(e.message, 'error');
    alert(auto
      ? 'The quiz time has ended, but the server has not confirmed your submission. Please click "Try Submission Again" immediately.'
      : e.message);
  }
}

function fmtMs(ms){
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

$('startBtn').onclick = startQuiz;
$('prevBtn').onclick = () => { if(current){ current--; render(); } };
$('nextBtn').onclick = () => { if(current < questions.length - 1){ current++; render(); } };
$('submitBtn').onclick = () => submitQuiz(false);

if (!questions.length) {
  setStatus('Question bank could not be loaded. Please refresh the page.', 'error');
} else {
  setStatus('Quiz ready.', 'success');
}

window.addEventListener('beforeunload', e => {
  if(attemptToken){
    e.preventDefault();
    e.returnValue = '';
  }
});
