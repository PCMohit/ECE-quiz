let questions = Array.isArray(window.ECE_PUBLIC_QUESTIONS) ? window.ECE_PUBLIC_QUESTIONS : [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let startAtMs = 0;
let deadlineMs = 0;
let serverOffsetMs = 0;
let timerId = null;
let waitingTimerId = null;
let submitting = false;
let startRequestId = null;
let submissionRequestId = null;
let startedSuccessfully = false;

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

function getServerNowMs(){
  return Date.now() + serverOffsetMs;
}

function showWaiting(){
  clearInterval(waitingTimerId);
  if ($('waiting')) $('waiting').hidden = false;
  if ($('quiz')) $('quiz').hidden = true;
  if ($('registration')) $('registration').hidden = true;
  updateWaiting();
  waitingTimerId = setInterval(updateWaiting, 250);
}

function updateWaiting(){
  const left = Math.max(0, startAtMs - getServerNowMs());
  if ($('startCountdown')) $('startCountdown').textContent = fmtMs(left);
  if ($('deadlineLabel')) $('deadlineLabel').textContent = `Quiz deadline: ${new Date(deadlineMs).toLocaleString()}`;
  if (left <= 0){
    clearInterval(waitingTimerId);
    $('waiting').hidden = true;
    beginQuizNow();
  }
}

function beginQuizNow(){
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  $('participantLabel').textContent = $('participantLabel').textContent || '';
  render();
  startTimer();
  setStatus('Quiz started. All participants share the same server deadline.', 'success');
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
  if (!questions || questions.length !== QUESTION_COUNT || !questions.every((q, i) => Number(q.id) === i + 1 && Array.isArray(q.options) && q.options.length === 4)) {
    $('regError').textContent = 'The quiz question bank could not be loaded. Please refresh the page.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('regError').textContent = 'Please enter a valid email address.';
    return;
  }

  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Joining…';
  setStatus('Registering your attempt…', 'muted');
  startRequestId = makeRequestId('start');

  QuizAPI.call('startAttempt', {
    name,
    participantId,
    email,
    institution,
    startRequestId
  }, {
    timeoutMs: 10000,
    retries: 4,
    retryDelaysMs: [1500, 3000, 6000, 10000],
    onRetry: () => {
      $('startBtn').textContent = 'Retrying…';
      setStatus('Server is busy — retrying automatically…', 'warning');
    }
  }).then(d => {
    if (!d.attemptToken || !Number.isFinite(Number(d.startAtMs)) || !Number.isFinite(Number(d.deadlineMs)) || !Number.isFinite(Number(d.serverNowMs))) {
      throw new Error('The quiz server returned an invalid synchronized start response.');
    }

    attemptToken = d.attemptToken;
    startedSuccessfully = true;
    startAtMs = Number(d.startAtMs);
    deadlineMs = Number(d.deadlineMs);
    serverOffsetMs = Number(d.serverNowMs) - Date.now();
    answers = Object.create(null);
    submissionRequestId = null;
    current = 0;
    submitting = false;

    $('participantLabel').textContent = `${name} • ${participantId}`;
    if (typeof d.startAtMs === 'number' && d.startAtMs > d.serverNowMs) {
      setStatus('Registered. Waiting for the common organizer start time…', 'success');
      showWaiting();
    } else {
      beginQuizNow();
    }
  }).catch(e => {
    $('regError').textContent = e.message;
    startRequestId = null;
    startedSuccessfully = false;
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
  timerId = setInterval(updateTimer, 250);
}

function updateTimer(){
  const left = Math.max(0, deadlineMs - getServerNowMs());
  $('timer').textContent = fmtMs(left);

  if(left <= 0){
    clearInterval(timerId);
    submitQuiz(true);
  }
}

async function submitQuiz(auto = false){
  if(!attemptToken || submitting || !startedSuccessfully) return;

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
      timeoutMs: 10000,
      retries: 5,
      retryDelaysMs: [1000, 2000, 4000, 8000, 12000],
      onRetry: () => {
        $('submitBtn').textContent = 'Retrying submission…';
        setStatus('Server is busy — retrying your submission automatically…', 'warning');
      }
    });

    $('quiz').hidden = true;
    $('waiting').hidden = true;
    $('result').hidden = false;
    if(auto) $('result').querySelector('h2').textContent = 'Time expired — quiz submitted';
    attemptToken = null;
    startRequestId = null;
    submissionRequestId = null;
    startedSuccessfully = false;
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
  setStatus('Quiz ready. Click Start Quiz when instructed by the organizer.', 'success');
}

window.addEventListener('beforeunload', e => {
  if(attemptToken){
    e.preventDefault();
    e.returnValue = '';
  }
});
