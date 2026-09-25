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
let recoveryInProgress = false;
let recoveryRetryTimer = null;
let autoSubmitBeaconSent = false;

const QUESTION_COUNT = 50;
const ACTIVE_SESSION_KEY = 'ECE_QUIZ_ACTIVE_SESSION_V3';
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

function safeStorageGet(){
  try { return localStorage.getItem(ACTIVE_SESSION_KEY); } catch (_) { return null; }
}

function safeStorageSet(value){
  try { localStorage.setItem(ACTIVE_SESSION_KEY, value); } catch (_) {}
}

function safeStorageRemove(){
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch (_) {}
}

function saveActiveSession(){
  if (!attemptToken) return;
  safeStorageSet(JSON.stringify({
    version: 3,
    attemptToken,
    startAtMs,
    deadlineMs,
    serverOffsetMs,
    current,
    answers: Object.assign({}, answers),
    participantLabel: $('participantLabel')?.textContent || '',
    submissionRequestId: submissionRequestId || '',
    startRequestId: startRequestId || '',
    savedAtMs: Date.now()
  }));
}

function restoreActiveSession(session){
  if (!session || !session.attemptToken) return false;
  attemptToken = String(session.attemptToken);
  startAtMs = Number(session.startAtMs || 0);
  deadlineMs = Number(session.deadlineMs || 0);
  serverOffsetMs = Number(session.serverOffsetMs || 0);
  current = Math.max(0, Math.min(Number(session.current || 0), Math.max(0, questions.length - 1)));
  answers = Object.assign(Object.create(null), session.answers || {});
  submissionRequestId = session.submissionRequestId || makeRequestId('submit-recovered');
  startRequestId = session.startRequestId || null;
  startedSuccessfully = true;
  submitting = false;
  autoSubmitBeaconSent = false;
  if ($('participantLabel')) $('participantLabel').textContent = String(session.participantLabel || '');
  return true;
}

function clearActiveSession(){
  safeStorageRemove();
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
  if (!attemptToken || !startedSuccessfully) return;
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  render();
  startTimer();
  saveActiveSession();
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
    timeoutMs: 15000,
    retries: 3,
    retryDelaysMs: [900, 1800, 3500],
    onRetry: info => {
      $('startBtn').textContent = 'Connecting…';
      setStatus(`Connecting to quiz server… (${info.attempt}/${info.totalAttempts})`, 'warning');
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
    autoSubmitBeaconSent = false;

    $('participantLabel').textContent = `${name} • ${participantId}`;
    saveActiveSession();

    if (startAtMs > d.serverNowMs) {
      setStatus('Registered. Waiting for the common organizer start time…', 'success');
      showWaiting();
    } else {
      beginQuizNow();
    }
  }).catch(e => {
    $('regError').textContent = e.message;
    startRequestId = null;
    startedSuccessfully = false;
    clearActiveSession();
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
    input.onchange = () => {
      answers[qid] = input.value;
      saveActiveSession();
    };
  });

  $('prevBtn').disabled = current === 0;
  $('nextBtn').hidden = current === questions.length - 1;
  $('submitBtn').hidden = current !== questions.length - 1;
  saveActiveSession();
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

  // Never auto-submit a registered-but-not-yet-started attempt.
  if (auto && getServerNowMs() < startAtMs) return;

  submitting = true;
  clearInterval(timerId);
  clearInterval(waitingTimerId);
  if (!submissionRequestId) submissionRequestId = makeRequestId('submit');
  saveActiveSession();

  $('submitBtn').disabled = true;
  $('submitBtn').textContent = auto ? 'Submitting automatically…' : 'Submitting…';
  setStatus(auto ? 'Saving your final answers…' : 'Saving your answers…', 'muted');

  try{
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      submissionRequestId,
      answers: Object.assign({}, answers),
      autoSubmit: auto,
      autoReason: auto ? 'timer' : 'manual'
    }, {
      timeoutMs: 15000,
      retries: 4,
      retryDelaysMs: [800, 1500, 3000, 5000],
      onRetry: info => {
        $('submitBtn').textContent = 'Saving…';
        setStatus(`Saving your submission… (${info.attempt}/${info.totalAttempts})`, 'warning');
      }
    });

    finishClientSession(auto ? 'Time expired — quiz submitted' : 'Quiz submitted successfully');
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

function finishClientSession(title){
  $('quiz').hidden = true;
  $('waiting').hidden = true;
  $('result').hidden = false;
  $('result').querySelector('h2').textContent = title;
  attemptToken = null;
  startRequestId = null;
  submissionRequestId = null;
  startedSuccessfully = false;
  submitting = false;
  clearActiveSession();
  setStatus('', 'muted');
}

function buildUnloadPayload(){
  if (!attemptToken || !startedSuccessfully || autoSubmitBeaconSent) return null;
  if (getServerNowMs() < startAtMs) return null;

  if (!submissionRequestId) submissionRequestId = makeRequestId('submit-exit');
  saveActiveSession();

  return {
    action: 'submitAttempt',
    attemptToken,
    submissionRequestId,
    answers: Object.assign({}, answers),
    autoSubmit: true,
    autoReason: 'page_exit'
  };
}

function sendAutoSubmitBeacon(){
  const payload = buildUnloadPayload();
  if (!payload) return;

  autoSubmitBeaconSent = true;
  const url = (window.QUIZ_CONFIG || {}).APPS_SCRIPT_URL;
  if (!url || url.includes('PASTE_')) return;

  try {
    const body = new URLSearchParams({ payload: JSON.stringify(payload) });
    const queued = navigator.sendBeacon ? navigator.sendBeacon(url, body) : false;
    if (queued) return;

    // Fallback for browsers/environments where sendBeacon is unavailable or rejects the request.
    fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body,
      redirect: 'follow',
      cache: 'no-store',
      keepalive: true
    }).catch(() => {});
  } catch (_) {}
}

async function recoverPreviousSession(){
  const raw = safeStorageGet();
  if (!raw) return false;

  let session;
  try { session = JSON.parse(raw); } catch (_) {
    clearActiveSession();
    return false;
  }

  if (!session || !session.attemptToken || !Number.isFinite(Number(session.startAtMs)) || !Number.isFinite(Number(session.deadlineMs))) {
    clearActiveSession();
    return false;
  }

  if (!restoreActiveSession(session)) return false;

  const serverNowEstimate = Date.now() + serverOffsetMs;

  // Refresh during the pre-start waiting room: restore the same registered session.
  if (serverNowEstimate < startAtMs) {
    $('participantLabel').textContent = session.participantLabel || '';
    setStatus('Restored your registered quiz session. Waiting for the common organizer start time…', 'success');
    showWaiting();
    return true;
  }

  // Refresh/exit/crash after the common start: automatically finalize the saved answers.
  recoveryInProgress = true;
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  $('participantLabel').textContent = session.participantLabel || '';
  render();
  $('submitBtn').hidden = true;
  $('prevBtn').disabled = true;
  $('nextBtn').disabled = true;
  setStatus('Previous quiz session detected. Auto-submitting your saved answers…', 'warning');

  await recoverSubmitLoop();
  return true;
}

async function recoverSubmitLoop(){
  if (!attemptToken) return;

  try {
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      submissionRequestId: submissionRequestId || (submissionRequestId = makeRequestId('submit-recovered')),
      answers: Object.assign({}, answers),
      autoSubmit: true,
      autoReason: 'page_recovery'
    }, {
      timeoutMs: 15000,
      retries: 4,
      retryDelaysMs: [800, 1500, 3000, 5000],
      onRetry: info => setStatus(`Previous session is being auto-submitted… (${info.attempt}/${info.totalAttempts})`, 'warning')
    });

    recoveryInProgress = false;
    finishClientSession('Previous session auto-submitted');
  } catch (e) {
    recoveryInProgress = false;
    setStatus('The previous attempt is still waiting for the network. It will be retried automatically.', 'warning');
    $('startBtn').disabled = true;
    $('startBtn').textContent = 'Previous Attempt Pending';
    $('registration').hidden = false;
    $('waiting').hidden = true;
    $('quiz').hidden = true;
    $('result').hidden = true;
    $('regError').textContent = 'Your previous quiz attempt is being auto-submitted. Please restore internet and keep this page open.';

    clearTimeout(recoveryRetryTimer);
    recoveryRetryTimer = setTimeout(() => recoverSubmitLoop(), 15000);
  }
}

function fmtMs(ms){
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

$('startBtn').onclick = startQuiz;
$('prevBtn').onclick = () => { if(current){ current--; render(); saveActiveSession(); } };
$('nextBtn').onclick = () => { if(current < questions.length - 1){ current++; render(); saveActiveSession(); } };
$('submitBtn').onclick = () => submitQuiz(false);

window.addEventListener('pagehide', sendAutoSubmitBeacon);
window.addEventListener('beforeunload', sendAutoSubmitBeacon);
window.addEventListener('online', () => {
  if (safeStorageGet() && !attemptToken && !recoveryInProgress) recoverPreviousSession().catch(() => {});
});

(async function init(){
  if (!questions.length) {
    setStatus('Question bank could not be loaded. Please refresh the page.', 'error');
    return;
  }

  const recovered = await recoverPreviousSession();
  if (!recovered) {
    setStatus('Quiz ready. Click Start Quiz when instructed by the organizer.', 'success');
  }
})();
