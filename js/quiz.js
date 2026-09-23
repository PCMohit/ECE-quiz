let questions = [];
let current = 0;
let answers = Object.create(null);
let attemptToken = null;
let deadlineMs = 0;
let timerId = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[c]));

function startQuiz(){
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
  QuizAPI.call('startAttempt', {name, participantId, email, institution})
    .then(d => {
      questions = Array.isArray(d.questions) ? d.questions : [];
      if(questions.length !== 50) throw new Error('The server returned an invalid quiz.');

      // Answers are stored by QUESTION ID, not by array position.
      // Unanswered questions simply have no key in this object.
      answers = Object.create(null);
      attemptToken = d.attemptToken;
      deadlineMs = Number(d.deadlineMs);
      current = 0;

      $('registration').hidden = true;
      $('quiz').hidden = false;
      $('participantLabel').textContent = `${name} • ${participantId}`;
      render();
      startTimer();
    })
    .catch(e => {
      $('regError').textContent = e.message;
      $('startBtn').disabled = false;
    });
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
      ${q.options.map((o, i) => `
        <label class="option">
          <input type="radio" name="answer" value="${String.fromCharCode(65 + i)}" ${answers[qid] === String.fromCharCode(65 + i) ? 'checked' : ''}>
          <span>${esc(o)}</span>
        </label>
      `).join('')}
    </div>`;

  document.querySelectorAll('input[name="answer"]').forEach(input => {
    input.onchange = () => {
      // Only an explicit radio selection creates an answer entry.
      answers[qid] = input.value;
    };
  });

  $('prevBtn').disabled = current === 0;
  $('nextBtn').hidden = current === questions.length - 1;
  $('submitBtn').hidden = current !== questions.length - 1;
}

function startTimer(){
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
  if(!attemptToken) return;

  clearInterval(timerId);
  $('submitBtn').disabled = true;

  try{
    // Send only explicitly answered question IDs.
    // There is NO null-filled 50-element answer array.
    await QuizAPI.call('submitAttempt', {
      attemptToken,
      answers: Object.assign({}, answers)
    });

    $('quiz').hidden = true;
    $('result').hidden = false;
    if(auto) $('result').querySelector('h2').textContent = 'Time expired — quiz submitted';
    attemptToken = null;
  }catch(e){
    alert(e.message);
    $('submitBtn').disabled = false;
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

window.addEventListener('beforeunload', e => {
  if(attemptToken){
    e.preventDefault();
    e.returnValue = '';
  }
});
