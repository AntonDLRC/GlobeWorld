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

