'use strict';

/* ── Exercise data ─────────────────────────────────── */
const EXERCISES = [
  {
    name: 'Neck Mobility',
    hint: 'Keep movements slow and gentle — never force it.',
    steps: [
      { label: 'Tilt Right',  duration: 15, side: 'right' },
      { label: 'Tilt Left',   duration: 15, side: 'left'  },
      { label: 'Up & Down',   duration: 15, side: null    },
      { label: 'Rotations',   duration: 15, side: null    }
    ]
  },
  {
    name: 'Shoulder Rolls + Chest Opener',
    hint: 'Roll through the full range. Breathe out on the chest stretch.',
    steps: [
      { label: '10 Rolls Forward', duration: 20, side: null },
      { label: '10 Rolls Back',    duration: 20, side: null },
      { label: 'Chest Stretch',    duration: 30, side: null }
    ]
  },
  {
    name: 'Cat-Cow',
    hint: 'Inhale into Cow, exhale into Cat — 8 to 10 slow reps.',
    steps: [
      { label: 'Cat-Cow Flow', duration: 60, side: null }
    ]
  },
  {
    name: "Child's Pose",
    hint: 'Breathe deeply into each position. Let gravity do the work.',
    steps: [
      { label: 'Center',      duration: 20, side: 'center' },
      { label: 'Reach Right', duration: 20, side: 'right'  },
      { label: 'Reach Left',  duration: 20, side: 'left'   }
    ]
  },
  {
    name: 'Thread the Needle',
    hint: 'Melt your shoulder toward the floor. Repeat both sides.',
    steps: [
      { label: 'Right Side', duration: 30, side: 'right' },
      { label: 'Left Side',  duration: 30, side: 'left'  },
      { label: 'Right Side', duration: 30, side: 'right' },
      { label: 'Left Side',  duration: 30, side: 'left'  }
    ]
  },
  {
    name: 'Trapezius & Shoulder Stretch',
    hint: 'Keep the opposite shoulder relaxed and pressed down.',
    steps: [
      { label: 'Left Side',  duration: 30, side: 'left'  },
      { label: 'Right Side', duration: 30, side: 'right' }
    ]
  },
  {
    name: 'Seated Spinal Twist',
    hint: 'Sit tall, then exhale slowly into the twist.',
    steps: [
      { label: 'Twist Left',  duration: 30, side: 'left'  },
      { label: 'Twist Right', duration: 30, side: 'right' }
    ]
  },
  {
    name: 'Wall Angels',
    hint: 'Press your whole back flat against the wall — 8 to 10 slow reps.',
    steps: [
      { label: 'Wall Angels', duration: 60, side: null }
    ]
  }
];

/* ── Ring geometry ─────────────────────────────────── */
const RING_R = 94;
const CIRCUMFERENCE = +(2 * Math.PI * RING_R).toFixed(2); // ≈ 590.62

/* ── State ─────────────────────────────────────────── */
let sessions = [];
let calViewDate = new Date(); // month shown in history

const sess = {
  exerciseIdx: 0,
  stepIdx: 0,
  timeLeft: 0,
  totalTime: 0,
  paused: false,
  sessionStart: 0,
  intervalId: null,
  transitionTimer: null,
  transitionCountdown: null
};

/* ── Audio ─────────────────────────────────────────── */
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq = 760, dur = 0.38, vol = 0.28) {
  try {
    ensureAudio();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur);
  } catch (_) { /* audio unavailable */ }
}

function chime() {
  beep(523, 0.28, 0.25);
  setTimeout(() => beep(659, 0.28, 0.25), 200);
  setTimeout(() => beep(784, 0.5,  0.25), 400);
}

/* ── Date helpers ──────────────────────────────────── */
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

/* ── Storage (localStorage) ────────────────────────── */
const STORAGE_KEY = 'stretch-daily-sessions';

async function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    sessions = raw ? JSON.parse(raw) : [];
  } catch (_) { sessions = []; }
}

async function saveSession(duration) {
  const now = new Date();
  const session = {
    id: Date.now(),
    date: localDateStr(now),
    completedAt: now.toISOString(),
    duration
  };
  sessions.push(session);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) { console.error('Save failed', e); }
}

/* ── Stats helpers ─────────────────────────────────── */
function doneDates() { return new Set(sessions.map(s => s.date)); }

function isTodayDone() { return doneDates().has(localDateStr()); }

function currentStreak() {
  const done = doneDates();
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // If today not done yet, start counting from yesterday
  if (!done.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (done.has(localDateStr(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
    if (count > 3660) break;
  }
  return count;
}

function bestStreak() {
  const sorted = [...new Set(sessions.map(s => s.date))].sort();
  if (!sorted.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/* ── View router ───────────────────────────────────── */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  if (name === 'home')    renderHome();
  if (name === 'history') renderHistory();
}

/* ── HOME ──────────────────────────────────────────── */
function renderHome() {
  const done = isTodayDone();
  const streak = currentStreak();

  document.getElementById('today-status').innerHTML = `
    <div class="status-emoji">${done ? '✅' : '🌅'}</div>
    <div class="status-text">${done ? "Today's stretch done!" : 'Ready to stretch?'}</div>
    <div class="status-sub">${done ? 'Great work. See you tomorrow!' : '~10 minutes · 8 exercises'}</div>
  `;

  document.getElementById('streak-display').innerHTML = `
    <div class="streak-flame">🔥</div>
    <div>
      <div class="streak-number">${streak}</div>
      <div class="streak-label">day${streak !== 1 ? 's' : ''} in a row</div>
    </div>
  `;

  document.getElementById('start-btn').textContent = done ? 'Stretch Again' : 'Start Session';

  // Last 7 days grid
  const done7 = doneDates();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let cells = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    const isDone = done7.has(ds);
    const isToday = i === 0;
    cells += `
      <div class="day-cell ${isDone ? 'done' : 'missed'} ${isToday ? 'today' : ''}">
        <span class="dc-name">${DAY_ABBR[d.getDay()]}</span>
        <span class="dc-dot">${isDone ? '✓' : ''}</span>
      </div>`;
  }
  document.getElementById('week-grid').innerHTML = cells;
}

/* ── SESSION ───────────────────────────────────────── */
function startSession() {
  ensureAudio();
  sess.exerciseIdx  = 0;
  sess.stepIdx      = 0;
  sess.paused       = false;
  sess.sessionStart = Date.now();
  clearInterval(sess.intervalId);
  clearTimeout(sess.transitionTimer);
  clearInterval(sess.transitionCountdown);

  // Initialise ring geometry
  const ring = document.getElementById('ring-fg');
  ring.setAttribute('stroke-dasharray', CIRCUMFERENCE);
  ring.setAttribute('stroke-dashoffset', '0');

  showView('session');
  loadStep();
}

function loadStep() {
  const ex   = EXERCISES[sess.exerciseIdx];
  const step = ex.steps[sess.stepIdx];

  sess.timeLeft  = step.duration;
  sess.totalTime = step.duration;

  // Progress bar (by exercise)
  const pct = (sess.exerciseIdx / EXERCISES.length) * 100;
  document.getElementById('session-progress').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${sess.exerciseIdx + 1} / ${EXERCISES.length}`;

  document.getElementById('exercise-name').textContent = ex.name;
  document.getElementById('step-label').textContent    = step.label;
  document.getElementById('hint-text').textContent     = ex.hint;

  // Side badge
  const badge = document.getElementById('side-badge');
  if (step.side === 'left') {
    badge.textContent  = '← Left Side';
    badge.className    = 'side-badge side-left';
  } else if (step.side === 'right') {
    badge.textContent  = 'Right Side →';
    badge.className    = 'side-badge side-right';
  } else if (step.side === 'center') {
    badge.textContent  = '· Center ·';
    badge.className    = 'side-badge side-center';
  } else {
    badge.textContent  = '';
    badge.className    = 'side-badge';
  }

  updateTimerUI();
  startTicking();
}

function startTicking() {
  clearInterval(sess.intervalId);
  if (sess.paused) return;
  sess.intervalId = setInterval(tick, 1000);
}

function tick() {
  sess.timeLeft--;
  updateTimerUI();
  if (sess.timeLeft <= 0) {
    clearInterval(sess.intervalId);
    beep();
    setTimeout(advanceStep, 900);
  }
}

function updateTimerUI() {
  const m = Math.floor(sess.timeLeft / 60);
  const s = sess.timeLeft % 60;
  document.getElementById('timer-display').textContent = `${m}:${pad(s)}`;

  // Ring: full at totalTime, empty at 0
  const ratio  = Math.max(0, sess.timeLeft / sess.totalTime);
  const offset = CIRCUMFERENCE * (1 - ratio);
  document.getElementById('ring-fg').style.strokeDashoffset = offset;
}

function advanceStep() {
  const ex = EXERCISES[sess.exerciseIdx];
  if (sess.stepIdx + 1 < ex.steps.length) {
    sess.stepIdx++;
    loadStep();
  } else {
    advanceExercise();
  }
}

function advanceExercise() {
  if (sess.exerciseIdx + 1 < EXERCISES.length) {
    sess.exerciseIdx++;
    sess.stepIdx = 0;
    showTransition();
  } else {
    showCompletion();
  }
}

/* Transition overlay with countdown */
function showTransition() {
  const nextName = EXERCISES[sess.exerciseIdx].name;
  document.getElementById('overlay-next-name').textContent = nextName;
  let secs = 4;
  document.getElementById('overlay-countdown').textContent = `Starting in ${secs}…`;
  document.getElementById('overlay-transition').classList.remove('hidden');

  sess.transitionCountdown = setInterval(() => {
    secs--;
    if (secs > 0) {
      document.getElementById('overlay-countdown').textContent = `Starting in ${secs}…`;
    } else {
      dismissTransition();
    }
  }, 1000);
}

function dismissTransition() {
  clearInterval(sess.transitionCountdown);
  document.getElementById('overlay-transition').classList.add('hidden');
  loadStep();
}

function showCompletion() {
  chime();
  const elapsed = Math.round((Date.now() - sess.sessionStart) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('completion-stats').innerHTML =
    `Time: <strong>${m}m ${pad(s)}s</strong><br>Exercises: <strong>8 / 8</strong>`;
  document.getElementById('overlay-complete').classList.remove('hidden');
}

async function finishSession() {
  document.getElementById('overlay-complete').classList.add('hidden');
  const duration = Math.round((Date.now() - sess.sessionStart) / 1000);
  await saveSession(duration);
  showView('home');
}

function togglePause() {
  sess.paused = !sess.paused;
  document.getElementById('pause-btn').textContent = sess.paused ? 'Resume' : 'Pause';
  if (!sess.paused) startTicking();
}

function skipStep() {
  ensureAudio();
  clearInterval(sess.intervalId);
  sess.timeLeft = 0;
  updateTimerUI();
  advanceStep();
}

function quitSession() {
  if (!confirm('End this session without saving?')) return;
  clearInterval(sess.intervalId);
  clearTimeout(sess.transitionTimer);
  clearInterval(sess.transitionCountdown);
  document.getElementById('overlay-transition').classList.add('hidden');
  document.getElementById('overlay-complete').classList.add('hidden');
  showView('home');
}

/* ── HISTORY ───────────────────────────────────────── */
function changeMonth(delta) {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + delta, 1);
  renderHistory();
}

function renderHistory() {
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const DAY_NAMES   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const y = calViewDate.getFullYear();
  const m = calViewDate.getMonth();

  document.getElementById('calendar-header').textContent = `${MONTH_NAMES[m]} ${y}`;

  // Day-name row
  document.getElementById('cal-day-names').innerHTML =
    DAY_NAMES.map(d => `<div class="cal-dn">${d}</div>`).join('');

  const done    = doneDates();
  const todayDs = localDateStr();
  const firstWd = new Date(y, m, 1).getDay();
  const days    = new Date(y, m + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstWd; i++) html += '<div class="cal-day"></div>';

  for (let day = 1; day <= days; day++) {
    const ds      = `${y}-${pad(m + 1)}-${pad(day)}`;
    const isToday  = ds === todayDs;
    const isFuture = ds > todayDs;
    const isDone   = done.has(ds);
    let cls = 'cal-day';
    if      (isFuture) cls += ' future';
    else if (isDone)   cls += ' done';
    else               cls += ' missed';
    if (isToday) cls += ' today';
    html += `<div class="${cls}">${day}</div>`;
  }
  document.getElementById('calendar-grid').innerHTML = html;

  // Stats
  const streak  = currentStreak();
  const bstreak = bestStreak();
  const total   = sessions.length;
  const thisM   = sessions.filter(s => s.date.startsWith(`${y}-${pad(m + 1)}`)).length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-item"><div class="stat-num">${total}</div><div class="stat-lbl">Total Sessions</div></div>
    <div class="stat-item"><div class="stat-num">${streak}</div><div class="stat-lbl">Current Streak</div></div>
    <div class="stat-item"><div class="stat-num">${bstreak}</div><div class="stat-lbl">Best Streak</div></div>
    <div class="stat-item"><div class="stat-num">${thisM}</div><div class="stat-lbl">This Month</div></div>
  `;
}

/* ── Boot ──────────────────────────────────────────── */
(async () => {
  await loadSessions();
  showView('home');
})();
