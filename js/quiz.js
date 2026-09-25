let questions = [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let deadlineMs = 0;
let timerId = null;
let submitting = false;
let startRequestId = null;
let submissionRequestId = null;
let loadingQuestionsPromise = null;

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

async function preloadQuestions(){
  if (questions.length === 50) return questions;
  if (loadingQuestionsPromise) return loadingQuestionsPromise;

  setStatus('Connecting to quiz server…', 'muted');

  loadingQuestionsPromise = QuizAPI.call('quizInfo', {}, {
    timeoutMs: 8000,
    retries: 6,
    onRetry: info => setStatus(
      `Server is busy — reconnecting (${info.attempt}/${info.totalAttempts})…`,
      'warning'
    )
  }).then(d => {
    if (!Array.isArray(d.questions) || d.questions.length !== 50) {
      throw new Error('The server returned an invalid 50-question quiz.');
    }
    questions = d.questions;
    setStatus('Quiz server ready.', 'success');
    return questions;
  }).catch(e => {
    setStatus('Quiz server connection could not be established. You can try again.', 'error');
    throw e;
  }).finally(() => {
    loadingQuestionsPromise = null;
  });

  return loadingQuestionsPromise;
}

async function startQuiz(){
  const name = $('name').value.trim();
  const participantId = $('roll').value.trim();
  const email = $('email').value.trim();
  const institution = $('institution').value.trim();

  $('regError').textContent = '';
  if(!name || !participantId){
    $('regError').textContent = 'Name and Participant ID are required.';
    return;
  }

  $('startBtn').disabled = true;
  $('startBtn').textContent = 'Connecting…';
  startRequestId = makeRequestId('start');

  try {
    await preloadQuestions();

    const d = await QuizAPI.call('startAttempt', {
      name,
      participantId,
      email,
      institution,
      startRequestId
    }, {
      timeoutMs: 8000,
      retries: 7,
      onRetry: info => {
        $('startBtn').textContent = `Retrying… ${info.attempt}/${info.totalAttempts}`;
        setStatus(`Server is busy — retrying Start Quiz (${info.attempt}/${info.totalAttempts})…`, 'warning');
      }
    });

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
  } catch(e) {
    $('regError').textContent = e.message;
    startRequestId = null;
    setStatus(e.message, 'error');
  } finally {
    if(!attemptToken){
      $('startBtn').disabled = false;
      $('startBtn').textContent = 'Start Quiz';
    }
  }
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
    };
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
  submissionRequestId = makeRequestId('submit');
  $('submitBtn').disabled = true;
  $('submitBtn').textContent = auto ? 'Submitting automatically…' : 'Submitting…';
  setStatus(auto ? 'Time is up. Submitting your answers…' : 'Submitting your answers…', 'muted');

  try{
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      submissionRequestId,
      answers: Object.assign({}, answers)
    }, {
      timeoutMs: 8000,
      retries: 7,
      onRetry: info => {
        $('submitBtn').textContent = `Retrying submission… ${info.attempt}/${info.totalAttempts}`;
        setStatus(`Server is busy — retrying submission (${info.attempt}/${info.totalAttempts})…`, 'warning');
      }
    });

    $('quiz').hidden = true;
    $('result').hidden = false;
    if(auto) $('result').querySelector('h2').textContent = 'Time expired — quiz submitted';
    attemptToken = null;
    submissionRequestId = null;
    setStatus('', 'muted');
  }catch(e){
    // Keep the attempt and request ID alive so a retry is safe and idempotent.
    submitting = false;
    $('submitBtn').disabled = false;
    $('submitBtn').textContent = 'Try Submission Again';
    setStatus(e.message, 'error');

    if(auto){
      // If the automatic submission exhausted its retries, give the participant a clear action.
      alert('The quiz time has ended, but the server could not confirm your submission. Please click "Try Submission Again" immediately.');
    } else {
      alert(e.message);
    }
  }
}

function fmtMs(ms){
  let s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

$('startBtn').onclick = startQuiz;
$('prevBtn').onclick = () => { if(current){ current--; render(); } };
$('nextBtn').onclick = () => { if(current < questions.length - 1){ current++; render(); } };
$('submitBtn').onclick = () => submitQuiz(false);

// Preload while the registration form is open.
preloadQuestions().catch(() => {});

window.addEventListener('online', () => {
  if (!attemptToken) preloadQuestions().catch(() => {});
});

window.addEventListener('beforeunload', e => {
  if(attemptToken){
    e.preventDefault();
    e.returnValue = '';
  }
});
