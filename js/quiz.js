let questions = [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let deadlineMs = 0;
let timerId = null;
let submitting = false;
let loadingQuestionsPromise = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[c]));

// Preload the public question set while the participant fills in the registration form.
// This moves the 50-question payload away from the critical Start Quiz click.
async function preloadQuestions(){
  if (questions.length === 50) return questions;
  if (loadingQuestionsPromise) return loadingQuestionsPromise;

  loadingQuestionsPromise = QuizAPI.call('quizInfo', {}, {timeoutMs:20000})
    .then(d => {
      if (!Array.isArray(d.questions) || d.questions.length !== 50) {
        throw new Error('The server returned an invalid quiz.');
      }
      questions = d.questions;
      return questions;
    })
    .finally(() => {
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
  $('startBtn').textContent = 'Starting Quiz...';

  try {
    // Ensure questions are ready. Usually this has already completed in the background.
    await preloadQuestions();

    const d = await QuizAPI.call('startAttempt', {
      name,
      participantId,
      email,
      institution
    }, {timeoutMs:25000});

    if(d.questions && Array.isArray(d.questions) && d.questions.length === 50){
      // Keep server-supplied public questions as the authoritative set for this attempt.
      questions = d.questions;
    }

    if(questions.length !== 50) {
      throw new Error('The server returned an invalid quiz.');
    }

    answers = Object.create(null);
    attemptToken = d.attemptToken;
    deadlineMs = Number(d.deadlineMs);
    current = 0;
    submitting = false;

    $('registration').hidden = true;
    $('quiz').hidden = false;
    $('participantLabel').textContent = `${name} • ${participantId}`;
    render();
    startTimer();
  } catch(e) {
    $('regError').textContent = e.message;
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
    <div class="card">
      <span class="eyebrow">Q${current + 1}</span>
      <h2>${esc(q.question)}</h2>
      ${q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        return `<label class="option">
          <input type="radio" name="answer" value="${letter}" ${answers[qid] === letter ? 'checked' : ''}>
          <span>${esc(o)}</span>
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
  $('submitBtn').disabled = true;
  $('submitBtn').textContent = 'Submitting...';

  try{
    // Only explicitly answered question IDs are sent.
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      answers: Object.assign({}, answers)
    }, {timeoutMs:25000});

    $('quiz').hidden = true;
    $('result').hidden = false;
    if(auto) $('result').querySelector('h2').textContent = 'Time expired — quiz submitted';
    attemptToken = null;
  }catch(e){
    alert(e.message);
    submitting = false;
    $('submitBtn').disabled = false;
    $('submitBtn').textContent = 'Submit Quiz';
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

// Start loading question data immediately, without blocking registration.
preloadQuestions().catch(() => {});

window.addEventListener('beforeunload', e => {
  if(attemptToken){
    e.preventDefault();
    e.returnValue = '';
  }
});
