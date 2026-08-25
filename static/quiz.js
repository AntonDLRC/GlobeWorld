let allCountries = [];
let validISO2 = new Set();
let cca2Map = new Map();
let cca3Map = new Map();

let quizMode   = null;   // 'flag' | 'border'
let difficulty = null;   // 'easy' | 'medium' | 'hard'
let questions  = [];
let currentIndex = 0;
let score = 0;
let answered = false;

const TOTAL_QUESTIONS = 10;

/* Difficulty maps to how many multiple-choice options are shown */
const OPTIONS_BY_DIFFICULTY = { easy: 3, medium: 4, hard: 5 };

/* Difficulty maps to country area (bigger = generally more well-known) */
const AREA_TIERS = {
  easy:   a => a >= 400000,
  medium: a => a >= 20000 && a < 400000,
  hard:   a => a > 0 && a < 20000,
};

/* ---------- DOM refs ---------- */

const setupPanel   = document.getElementById('setup-panel');
const quizPanel    = document.getElementById('quiz-panel');
const resultsPanel = document.getElementById('results-panel');

const modeButtons = document.querySelectorAll('.mode-btn');
const diffButtons = document.querySelectorAll('.diff-btn');
const startBtn    = document.getElementById('start-btn');

const questionCounter  = document.getElementById('question-counter');
const scoreDisplay     = document.getElementById('score-display');
const questionMedia    = document.getElementById('question-media');
const questionText     = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedbackText     = document.getElementById('feedback-text');
const nextBtn          = document.getElementById('next-btn');

const finalScoreText = document.getElementById('final-score-text');
const bestScoreText  = document.getElementById('best-score-text');
const playAgainBtn   = document.getElementById('play-again-btn');
const backSetupBtn   = document.getElementById('back-setup-btn');
const quizCloseBtn = document.getElementById('quiz-close-btn');

/* ---------- load data, this is same as the globe and map page ---------- */

Promise.all([
  fetch('/api/all-countries').then(r => r.json()),
  fetch('/api/countries').then(r => r.json())
]).then(([countryList, dbData]) => {
  allCountries = countryList;
  dbData.iso2_list.forEach(code => validISO2.add(code));

  countryList.forEach(c => {
    if (c.cca2) cca2Map.set(c.cca2, c);
    if (c.cca3) cca3Map.set(c.cca3, c);
  });

  checkReady();
}).catch(err => console.error('Failed to load quiz data:', err));

/* ---------- setup selection ---------- */

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.mode;
    checkReady();
  });
});

diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    diffButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.difficulty;
    checkReady();
  });
});

function checkReady() {
  startBtn.disabled = !(quizMode && difficulty && allCountries.length);
}

startBtn.addEventListener('click', startQuiz);

playAgainBtn.addEventListener('click', () => {
  resultsPanel.classList.remove('visible');
  startQuiz();
});

backSetupBtn.addEventListener('click', () => {
  resultsPanel.classList.remove('visible');
  setupPanel.classList.add('visible');
});

quizCloseBtn.addEventListener('click', () => {
  quizPanel.classList.remove('visible');
  setupPanel.classList.add('visible');
});

/* ---------- pool building ---------- */

function buildPool() {
  const inTier = AREA_TIERS[difficulty];

  let pool = allCountries.filter(c =>
    validISO2.has(c.cca2) &&
    c.area && inTier(c.area)
  );

  if (quizMode === 'border') {
    pool = pool.filter(c => c.borders && c.borders.length > 0);
  }

  return pool;
}

/* ---------- start quiz ---------- */

function startQuiz() {
  const pool = buildPool();

  if (pool.length < OPTIONS_BY_DIFFICULTY[difficulty]) {
    alert('Not enough countries for this combination — try a different difficulty.');
    return;
  }

  const shuffledPool = shuffle([...pool]);
  const count = Math.min(TOTAL_QUESTIONS, shuffledPool.length);

  questions = [];
  for (let i = 0; i < count; i++) {
    questions.push(buildQuestion(shuffledPool[i], pool));
  }

  currentIndex = 0;
  score = 0;

  setupPanel.classList.remove('visible');
  resultsPanel.classList.remove('visible');
  quizPanel.classList.add('visible');

  renderQuestion();
}

function buildQuestion(answerCountry, pool) {
  const numOptions = OPTIONS_BY_DIFFICULTY[difficulty];

  if (quizMode === 'flag') {
    const distractors = shuffle(
      pool.filter(c => c.cca2 !== answerCountry.cca2)
    ).slice(0, numOptions - 1);

    const options = shuffle([answerCountry, ...distractors]);

    return {
      type: 'flag',
      country: answerCountry,
      prompt: 'Which country does this flag belong to?',
      media: `https://flagcdn.com/w320/${answerCountry.cca2.toLowerCase()}.png`,
      options: options.map(c => ({
        label: c.name.common,
        correct: c.cca2 === answerCountry.cca2,
      })),
    };
  }

   // border mode
  const borderCca3 = answerCountry.borders[
    Math.floor(Math.random() * answerCountry.borders.length)
  ];
  const correctNeighbor = cca3Map.get(borderCca3);

  if (!correctNeighbor) {
    // this country's border data didn't resolve — pick a different one instead
    const fallback = pool[Math.floor(Math.random() * pool.length)];
    return buildQuestion(fallback, pool);
  }

  const nonBorderingOptions = shuffle(
    pool.filter(c =>
      c.cca2 !== answerCountry.cca2 &&
      c.cca2 !== correctNeighbor.cca2 &&
      !(answerCountry.borders || []).includes(c.cca3)
    )
  ).slice(0, numOptions - 1);

  const options = shuffle([correctNeighbor, ...nonBorderingOptions]);

  return {
    type: 'border',
    country: answerCountry,
    prompt: `Which of these countries shares a border with ${answerCountry.name.common}?`,
    media: null,
    options: options.map(c => ({
      label: c.name.common,
      correct: c.cca2 === correctNeighbor.cca2,
    })),
  };
}

/* ---------- render question ---------- */

function renderQuestion() {
  answered = false;
  const q = questions[currentIndex];

  questionCounter.textContent = `Question ${currentIndex + 1} / ${questions.length}`;
  scoreDisplay.textContent    = `Score: ${score}`;
  questionText.textContent    = q.prompt;
  feedbackText.textContent    = '';
  feedbackText.className      = 'feedback-text';
  nextBtn.classList.remove('visible');

  if (q.type === 'flag') {
    questionMedia.innerHTML = `<img src="${q.media}" alt="Flag" class="quiz-flag-img" />`;
  } else {
    questionMedia.innerHTML = `<div class="quiz-border-name">${q.country.name.common}</div>`;
  }

  optionsContainer.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => handleAnswer(btn, opt));
    optionsContainer.appendChild(btn);
  });
}

function handleAnswer(btn, opt) {
  if (answered) return;
  answered = true;

  const allBtns = optionsContainer.querySelectorAll('.option-btn');
  allBtns.forEach(b => (b.disabled = true));

  if (opt.correct) {
    btn.classList.add('correct');
    score++;
    feedbackText.textContent = 'Correct!';
    feedbackText.classList.add('correct-text');
  } else {
    btn.classList.add('wrong');
    feedbackText.textContent = 'Incorrect.';
    feedbackText.classList.add('wrong-text');

    const q = questions[currentIndex];
    Array.from(allBtns).forEach((b, i) => {
      if (q.options[i].correct) b.classList.add('correct');
    });
  }

  scoreDisplay.textContent = `Score: ${score}`;
  nextBtn.classList.add('visible');
}

nextBtn.addEventListener('click', () => {
  currentIndex++;
  if (currentIndex >= questions.length) {
    endQuiz();
  } else {
    renderQuestion();
  }
});

/* ---------- end quiz ---------- */

function endQuiz() {
  quizPanel.classList.remove('visible');
  resultsPanel.classList.add('visible');

  finalScoreText.textContent = `${score} / ${questions.length}`;

  const key = `quiz-best-${quizMode}-${difficulty}`;
  const prevBest = parseInt(localStorage.getItem(key) || '0', 10);
  const best = Math.max(prevBest, score);
  localStorage.setItem(key, String(best));
  bestScoreText.textContent = `Best: ${best} / ${questions.length}`;
}

/* ---------- helpers ---------- */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
