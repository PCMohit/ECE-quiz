let questions = Array.isArray(window.ECE_PUBLIC_QUESTIONS) ? window.ECE_PUBLIC_QUESTIONS : [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let startAtMs = 0;
let deadlineMs = 0;
let serverOffsetMs = 0;
let timerId = null;
let waitingTimerId = null;
let recoveryRetryTimer = null;
let submitting = false;
let recoveryInProgress = false;
let autoSubmitBeaconSent = false;
let startRequestId = null;
let pendingStart = null;
let submissionRequestId = null;
let startedSuccessfully = false;

const QUESTION_COUNT = 50;
const ACTIVE_SESSION_KEYS = ['ECE_QUIZ_ACTIVE_SESSION_V4', 'ECE_QUIZ_ACTIVE_SESSION_V3'];
const PENDING_START_KEY = 'ECE_QUIZ_PENDING_START_V2';
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

function safeStorageGet(key){
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function safeStorageSet(key, value){
  try { localStorage.setItem(key, value); } catch (_) {}
}

function safeStorageRemove(key){
  try { localStorage.removeItem(key); } catch (_) {}
}

function readActiveSessionRaw(){
  for (const key of ACTIVE_SESSION_KEYS){
    const raw = safeStorageGet(key);
    if (raw) return { key, raw };
  }
  return null;
}

function clearActiveSession(){
  ACTIVE_SESSION_KEYS.forEach(safeStorageRemove);
}

function saveActiveSession(){
  if (!attemptToken) return;
  safeStorageSet(ACTIVE_SESSION_KEYS[0], JSON.stringify({
    version: 4,
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
  safeStorageRemove(ACTIVE_SESSION_KEYS[1]);
}

function savePendingStart(){
  if (!pendingStart) return;
  safeStorageSet(PENDING_START_KEY, JSON.stringify(pendingStart));
}

function clearPendingStart(){
  pendingStart = null;
  safeStorageRemove(PENDING_START_KEY);
}

function getPendingStart(){
  const raw = safeStorageGet(PENDING_START_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || !p.name || !p.participantId || !p.email || !p.startRequestId) {
      safeStorageRemove(PENDING_START_KEY);
      return null;
    }
    return p;
  } catch (_) {
    safeStorageRemove(PENDING_START_KEY);
    return null;
  }
}

function restoreActiveSession(session){
  if (!session || !session.attemptToken) return false;
  attemptToken = String(session.attemptToken);
  startAtMs = Number(session.startAtMs || 0);
  deadlineMs = Number(session.deadlineMs || 0);
  serverOffsetMs = Number(session.serverOffsetMs || 0);
  current = Math.max(0, Math.min(Number(session.current || 0), Math.max(0, questions.length - 1)));
  answers = Object.assign(Object.create(null), session.answers || {});
  submissionRequestId = session.submissionRequestId || null;
  startRequestId = session.startRequestId || null;
  startedSuccessfully = true;
  autoSubmitBeaconSent = false;
  submitting = false;
  if ($('participantLabel')) $('participantLabel').textContent = String(session.participantLabel || '');
  return Number.isFinite(startAtMs) && Number.isFinite(deadlineMs);
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
    if (getServerNowMs() >= deadlineMs) {
      beginExpiredSessionRecovery();
      return;
    }
    $('waiting').hidden = true;
    beginQuizNow();
  }
}

function beginQuizNow(){
  if (!attemptToken || !startedSuccessfully) return;
  clearInterval(waitingTimerId);
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  render();
  startTimer();
  saveActiveSession();
  setStatus('Quiz started. All participants share the same server deadline.', 'success');
}

function beginExpiredSessionRecovery(){
  clearInterval(timerId);
  clearInterval(waitingTimerId);
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  render();
  $('submitBtn').hidden = true;
  $('prevBtn').disabled = true;
  $('nextBtn').disabled = true;
  setStatus('The common quiz deadline has passed. Saving your attempt…', 'warning');
  recoverSubmitLoop();
}

function validateRegistration(){
  const name = $('name').value.trim();
  const participantId = $('roll').value.trim();
  const email = $('email').value.trim();
  const institution = $('institution').value.trim();
  $('regError').textContent = '';

  if (!name || !participantId || !email) {
    $('regError').textContent = 'Name, Participant ID, and Email are required.';
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('regError').textContent = 'Please enter a valid email address.';
    return null;
  }
  if (!questions || questions.length !== QUESTION_COUNT || !questions.every((q, i) =>
    Number(q.id) === i + 1 && Array.isArray(q.options) && q.options.length === 4)) {
    $('regError').textContent = 'The quiz question bank could not be loaded. Please refresh the page.';
    return null;
  }
  return { name, participantId, email, institution };
}

function applyStartResponse(d, participant){
  if (!d.attemptToken || !Number.isFinite(Number(d.startAtMs)) ||
      !Number.isFinite(Number(d.deadlineMs)) || !Number.isFinite(Number(d.serverNowMs))) {
    throw new Error('The quiz server returned an invalid synchronized start response.');
  }

  clearPendingStart();
  attemptToken = d.attemptToken;
  startedSuccessfully = true;
  startAtMs = Number(d.startAtMs);
  deadlineMs = Number(d.deadlineMs);
  serverOffsetMs = Number(d.serverNowMs) - Date.now();
  answers = Object.create(null);
  current = 0;
  submissionRequestId = null;
  autoSubmitBeaconSent = false;
  submitting = false;

  $('participantLabel').textContent = `${participant.name} • ${participant.participantId}`;
  saveActiveSession();

  if (startAtMs > d.serverNowMs) {
    setStatus('Registered. Waiting for the common organizer start time…', 'success');
    showWaiting();
  } else if (deadlineMs <= d.serverNowMs) {
    beginExpiredSessionRecovery();
  } else {
    beginQuizNow();
  }
}

function startQuiz(){
  const participant = validateRegistration();
  if (!participant) return;

  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Connecting…';
  setStatus('Connecting to quiz server…', 'muted');

  pendingStart = {
    ...participant,
    startRequestId: makeRequestId('start'),
    savedAtMs: Date.now()
  };
  startRequestId = pendingStart.startRequestId;
  savePendingStart();

  beginStartRequest(pendingStart);
}

function beginStartRequest(request){
  QuizAPI.call('startAttempt', request, {
    timeoutMs: 10000,
    retries: 3,
    retryDelaysMs: [500, 1200, 2500],
    onRetry: info => {
      $('startBtn').textContent = 'Connecting…';
      setStatus(`Connecting to quiz server… (${info.attempt}/${info.totalAttempts})`, 'warning');
    }
  }).then(d => {
    applyStartResponse(d, request);
  }).catch(e => {
    // Keep the pending Start data so a page refresh can resume the same request ID.
    $('regError').textContent = e.message;
    setStatus('Still connecting. Your registration is saved and will retry automatically.', 'warning');
    $('startBtn').disabled = false;
    $('startBtn').textContent = 'Retry Start';
    schedulePendingStartRetry();
  });
}

function schedulePendingStartRetry(){
  clearTimeout(recoveryRetryTimer);
  recoveryRetryTimer = setTimeout(() => {
    const p = getPendingStart();
    if (!p || attemptToken) return;
    $('startBtn').disabled = true;
    $('startBtn').textContent = 'Connecting…';
    beginStartRequest(p);
  }, 5000);
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
  if (left <= 0){
    clearInterval(timerId);
    submitQuiz(true);
  }
}

async function submitQuiz(auto = false){
  if (!attemptToken || submitting || !startedSuccessfully) return;
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
      timeoutMs: 10000,
      retries: 5,
      retryDelaysMs: [500, 1000, 2000, 4000, 7000],
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
    if (auto) scheduleRecoveryRetry();
    else alert(e.message);
  }
}

function finishClientSession(title){
  clearInterval(timerId);
  clearInterval(waitingTimerId);
  clearTimeout(recoveryRetryTimer);
  $('quiz').hidden = true;
  $('waiting').hidden = true;
  $('registration').hidden = true;
  $('result').hidden = false;
  $('result').querySelector('h2').textContent = title;
  attemptToken = null;
  startRequestId = null;
  submissionRequestId = null;
  startedSuccessfully = false;
  submitting = false;
  recoveryInProgress = false;
  clearActiveSession();
  clearPendingStart();
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

  const url = (window.QUIZ_CONFIG || {}).APPS_SCRIPT_URL;
  if (!url || url.includes('PASTE_')) return;

  autoSubmitBeaconSent = true;
  try {
    // Explicit form-encoded Blob makes the payload available to Apps Script as e.parameter.payload.
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const blob = new Blob([body], {type:'application/x-www-form-urlencoded;charset=UTF-8'});
    const queued = navigator.sendBeacon ? navigator.sendBeacon(url, blob) : false;
    if (queued) return;

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

async function checkServerAttemptStatus(){
  if (!attemptToken) return null;
  return QuizAPI.call('attemptStatus', {attemptToken}, {
    timeoutMs: 7000,
    retries: 1,
    retryDelaysMs: [700]
  });
}

async function recoverPreviousSession(){
  const rawInfo = readActiveSessionRaw();
  if (!rawInfo) return false;

  let session;
  try { session = JSON.parse(rawInfo.raw); } catch (_) {
    clearActiveSession();
    return false;
  }

  if (!restoreActiveSession(session)) {
    clearActiveSession();
    return false;
  }

  // Always ask the server what happened. This fixes the old stuck state where a beacon
  // had already submitted successfully but localStorage still looked pending.
  try {
    const status = await checkServerAttemptStatus();
    if (!status || status.exists === false) {
      clearActiveSession();
      attemptToken = null;
      startedSuccessfully = false;
      setStatus('The previous browser session could not be found on the server. You may start a new attempt.', 'warning');
      return false;
    }

    serverOffsetMs = Number(status.serverNowMs) - Date.now();
    startAtMs = Number(status.startAtMs);
    deadlineMs = Number(status.deadlineMs);

    const serverStatus = String(status.status || '').toUpperCase();
    if (serverStatus === 'SUBMITTED' || serverStatus === 'AUTO_SUBMITTED') {
      finishClientSession('Previous quiz attempt was already submitted');
      return true;
    }

    if (getServerNowMs() < startAtMs) {
      setStatus('Previous quiz session restored. Waiting for the common organizer start time…', 'success');
      showWaiting();
      return true;
    }

    recoveryInProgress = true;
    setStatus('Previous quiz session detected. Auto-submitting your saved answers…', 'warning');
    beginExpiredOrLiveRecoveryUI();
    await recoverSubmitLoop();
    return true;
  } catch (_) {
    showRecoveryScreen('The previous attempt is pending because the server could not be reached. We will retry automatically.');
    scheduleRecoveryRetry();
    return true;
  }
}

function beginExpiredOrLiveRecoveryUI(){
  $('registration').hidden = true;
  $('waiting').hidden = true;
  $('quiz').hidden = false;
  render();
  $('submitBtn').hidden = true;
  $('prevBtn').disabled = true;
  $('nextBtn').disabled = true;
}

function showRecoveryScreen(message){
  $('registration').hidden = false;
  $('waiting').hidden = true;
  $('quiz').hidden = true;
  $('result').hidden = true;
  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Previous Attempt Pending';
  $('regError').textContent = message;
  if ($('recoveryPanel')) $('recoveryPanel').hidden = false;
}

function hideRecoveryScreen(){
  if ($('recoveryPanel')) $('recoveryPanel').hidden = true;
}

function scheduleRecoveryRetry(){
  clearTimeout(recoveryRetryTimer);
  recoveryRetryTimer = setTimeout(() => {
    if (!attemptToken) return;
    recoverSubmitLoop().catch(() => {});
  }, 5000);
}

async function recoverSubmitLoop(){
  if (!attemptToken || !startedSuccessfully || recoveryInProgress && submitting) return;
  recoveryInProgress = true;

  try {
    const status = await checkServerAttemptStatus();
    if (status && status.exists === false) {
      clearActiveSession();
      attemptToken = null;
      startedSuccessfully = false;
      recoveryInProgress = false;
      hideRecoveryScreen();
      $('startBtn').disabled = false;
      $('startBtn').textContent = 'Start Quiz';
      setStatus('Previous attempt was not found. You can start again.', 'warning');
      return;
    }
    if (status) {
      serverOffsetMs = Number(status.serverNowMs) - Date.now();
      startAtMs = Number(status.startAtMs);
      deadlineMs = Number(status.deadlineMs);
      const s = String(status.status || '').toUpperCase();
      if (s === 'SUBMITTED' || s === 'AUTO_SUBMITTED') {
        recoveryInProgress = false;
        finishClientSession('Previous quiz attempt was already submitted');
        return;
      }
      if (getServerNowMs() < startAtMs) {
        recoveryInProgress = false;
        hideRecoveryScreen();
        setStatus('Previous quiz session restored. Waiting for the common organizer start time…', 'success');
        showWaiting();
        return;
      }
    }

    submitting = false;
    await submitQuiz(true);
    if (!attemptToken) return;
    recoveryInProgress = false;
    showRecoveryScreen('The previous attempt is still waiting for the network. Retry will continue automatically.');
    setStatus('Previous attempt is pending. We will retry automatically.', 'warning');
    scheduleRecoveryRetry();
  } catch (_) {
    recoveryInProgress = false;
    showRecoveryScreen('The previous attempt is still waiting for the network. Retry will continue automatically.');
    setStatus('Previous attempt is pending. We will retry automatically.', 'warning');
    scheduleRecoveryRetry();
  }
}

async function retryRecoveryNow(){
  clearTimeout(recoveryRetryTimer);
  if (!attemptToken) {
    const recovered = await recoverPreviousSession();
    if (!recovered) return;
  } else {
    await recoverSubmitLoop();
  }
}

async function resumePendingStart(){
  const p = getPendingStart();
  if (!p || attemptToken) return false;
  pendingStart = p;
  startRequestId = p.startRequestId;
  $('name').value = p.name;
  $('roll').value = p.participantId;
  $('email').value = p.email;
  $('institution').value = p.institution || '';
  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Connecting…';
  setStatus('Resuming your previous Start request…', 'warning');
  beginStartRequest(p);
  return true;
}

function fmtMs(ms){
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

$('startBtn').onclick = startQuiz;
$('prevBtn').onclick = () => { if(current){ current--; render(); saveActiveSession(); } };
$('nextBtn').onclick = () => { if(current < questions.length - 1){ current++; render(); saveActiveSession(); } };
$('submitBtn').onclick = () => submitQuiz(false);
if ($('retryRecoveryBtn')) $('retryRecoveryBtn').onclick = () => retryRecoveryNow().catch(() => {});

window.addEventListener('pagehide', sendAutoSubmitBeacon);
window.addEventListener('beforeunload', sendAutoSubmitBeacon);
window.addEventListener('online', () => {
  if (getPendingStart() && !attemptToken) {
    resumePendingStart().catch(() => {});
  } else if (attemptToken) {
    recoverSubmitLoop().catch(() => {});
  }
});

(async function init(){
  if (!questions.length) {
    setStatus('Question bank could not be loaded. Please refresh the page.', 'error');
    return;
  }

  hideRecoveryScreen();
  const recovered = await recoverPreviousSession();
  if (recovered) return;

  if (getPendingStart()) {
    await resumePendingStart();
    return;
  }

  clearActiveSession();
  setStatus('Quiz ready. Click Start Quiz when instructed by the organizer.', 'success');
})();
