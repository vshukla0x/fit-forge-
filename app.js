/* ═══════════════════════════════════════════════
   FITFORGE — Full Functional App v3
   © 2026 · All features live
═══════════════════════════════════════════════ */
'use strict';

// ─── STORAGE HELPER ──────────────────────────────────────────────────────────
const Store = {
  get: (key, fallback = null) => {
    try { const v = localStorage.getItem(`ff_${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (key, val) => { try { localStorage.setItem(`ff_${key}`, JSON.stringify(val)); } catch {} },
  del: (key) => { try { localStorage.removeItem(`ff_${key}`); } catch {} }
};

// ─── APP STATE ────────────────────────────────────────────────────────────────
const defaultUser = { name: 'Alex', height: 175, weight: 82, bodyFat: 15, goal: 'muscle', gender: 'male', age: 25 };
let user = Store.get('user', { ...defaultUser });
let progress = Store.get('progress', { weights: [], sessions: [] });

// Today's nutrition — reset each new day
const todayStr = new Date().toDateString();
let nutrition = Store.get('nutrition', null);
if (!nutrition || nutrition.date !== todayStr) {
  nutrition = { date: todayStr, logged: [], water: 0 };
  Store.set('nutrition', nutrition);
}

// Workout state
let completedSets = Store.get('wkt_sets', {});
let workoutStartTs = Store.get('wkt_start', null);
let workoutActive  = !!workoutStartTs;
let workoutTimerInterval = null;
let restInterval   = null;
let restTotal      = 0;
let restRemaining  = 0;

// ─── PROFILE CALCULATIONS ─────────────────────────────────────────────────────
function getProfile() {
  const w = user.weight, h = user.height, a = user.age;
  // Mifflin-St Jeor BMR
  const bmr = user.gender === 'male'
    ? 10 * w + 6.25 * h - 5 * a + 5
    : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = Math.round(bmr * 1.55); // moderately active
  const adjustments = { muscle: 350, fat: -500, strength: 0, recomp: -100 };
  const targetCals  = tdee + (adjustments[user.goal] || 0);
  const calRange    = [Math.round(targetCals * 0.97), Math.round(targetCals * 1.05)];

  const protFactors = { muscle: [1.8, 2.2], fat: [2.0, 2.4], strength: [1.6, 2.0], recomp: [2.0, 2.4] };
  const [pLo, pHi] = protFactors[user.goal] || [1.8, 2.2];
  const proteinMin = Math.round(w * pLo), proteinMax = Math.round(w * pHi);
  const fatMin = Math.round(w * 0.7),    fatMax = Math.round(w * 1.0);
  const carbMin = Math.max(80, Math.round((targetCals - proteinMin * 4 - fatMin * 9) / 4));
  const carbMax = Math.round(carbMin * 1.18);
  const waterGoal = Math.round(w * 35); // ml

  return { tdee, targetCals, calRange, proteinMin, proteinMax, carbMin, carbMax, fatMin, fatMax, waterGoal };
}

// ─── MACRO TOTALS ────────────────────────────────────────────────────────────
function getTotals() {
  return nutrition.logged.reduce((a, e) => ({
    kcal: a.kcal + e.kcal, protein: a.protein + e.protein,
    carbs: a.carbs + e.carbs, fat: a.fat + e.fat, fiber: a.fiber + (e.fiber || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

// ─── MICRONUTRIENT TOTALS ────────────────────────────────────────────────────
function getMicroTotals() {
  return nutrition.logged.reduce((a, e) => {
    const food = FOODS.find(f => f.id === e.foodId);
    if (!food) return a;
    return {
      vitC:      a.vitC      + (food.vitC      || 0),
      vitD:      a.vitD      + (food.vitD      || 0),
      calcium:   a.calcium   + (food.calcium   || 0),
      iron:      a.iron      + (food.iron      || 0),
      magnesium: a.magnesium + (food.magnesium || 0),
      zinc:      a.zinc      + (food.zinc      || 0),
      potassium: a.potassium + (food.potassium || 0),
      b12:       a.b12       + (food.b12       || 0),
    };
  }, { vitC:0, vitD:0, calcium:0, iron:0, magnesium:0, zinc:0, potassium:0, b12:0 });
}

function renderMicronutrients() {
  const m = getMicroTotals();
  const targets = { vitC:90, vitD:600, calcium:1000, iron:18, magnesium:400, zinc:11, potassium:4700, b12:2.4 };
  const labels = {
    vitC:      { name: 'Vitamin C',   unit: 'mg',  emoji: '🍊', tip: 'Immune support, collagen synthesis' },
    vitD:      { name: 'Vitamin D',   unit: 'IU',  emoji: '☀️', tip: 'Testosterone, calcium absorption, immunity' },
    calcium:   { name: 'Calcium',     unit: 'mg',  emoji: '🦴', tip: 'Bone density, muscle contraction' },
    iron:      { name: 'Iron',        unit: 'mg',  emoji: '💪', tip: 'Oxygen transport, energy production' },
    magnesium: { name: 'Magnesium',   unit: 'mg',  emoji: '⚡', tip: 'Sleep quality, muscle recovery, 300+ enzymes' },
    zinc:      { name: 'Zinc',        unit: 'mg',  emoji: '🛡️', tip: 'Testosterone production, immune function' },
    potassium: { name: 'Potassium',   unit: 'mg',  emoji: '🫀', tip: 'Heart health, muscle cramps prevention' },
    b12:       { name: 'Vitamin B12', unit: 'mcg', emoji: '🧠', tip: 'Nerve function, red blood cell formation' },
  };

  const container = document.getElementById('micronutrient-list');
  if (!container) return;

  container.innerHTML = Object.entries(labels).map(([key, info]) => {
    const current = m[key] || 0;
    const target = targets[key];
    const pct = Math.min((current / target) * 100, 100);
    const status = pct >= 100 ? 'good' : pct >= 60 ? 'warn' : 'low';
    const statusText = pct >= 100 ? '✓ Met' : pct >= 60 ? `${Math.round(target - current)}${info.unit} to go` : `Low — ${Math.round(target - current)}${info.unit} needed`;
    const barColor = pct >= 100 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-orange)' : 'var(--accent-red)';
    return `
      <div class="micro-row">
        <div class="micro-row-left">
          <span class="micro-emoji">${info.emoji}</span>
          <div class="micro-info">
            <p class="micro-name">${info.name}</p>
            <p class="micro-tip">${info.tip}</p>
          </div>
        </div>
        <div class="micro-row-right">
          <div class="micro-bar-wrap">
            <div class="micro-bar-track">
              <div class="micro-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div class="micro-amounts">
              <span class="micro-current">${current % 1 === 0 ? current : current.toFixed(1)}${info.unit}</span>
              <span class="micro-target">/ ${target}${info.unit}</span>
            </div>
          </div>
          <span class="micro-status micro-${status}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');
}

function saveNutrition() { Store.set('nutrition', nutrition); }

// ─── THEME ───────────────────────────────────────────────────────────────────
let currentTheme = Store.get('theme', 'dark');
function loadTheme() { document.documentElement.setAttribute('data-theme', currentTheme); }
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  Store.set('theme', currentTheme);
  const btn = document.getElementById('theme-toggle');
  if (btn) { btn.style.transform = 'rotate(180deg) scale(0.8)'; setTimeout(() => btn.style.transform = '', 400); }
  // Redraw chart if open
  if (document.getElementById('screen-progress')?.classList.contains('active')) renderWeightChart();
}

// ─── ONBOARDING FLOW ─────────────────────────────────────────────────────────
let selectedBF = null, selectedGoal = null;

function goToOnboarding() {
  const from = document.getElementById('screen-login');
  from.style.opacity = '0'; from.style.transform = 'translateY(-20px)';
  setTimeout(() => { from.classList.remove('active'); from.style.opacity = ''; from.style.transform = '';
    document.getElementById('screen-onboard-stats').classList.add('active'); }, 220);
}

function goToBodyFat() {
  user.height = parseInt(document.getElementById('height-slider')?.value || 175);
  user.weight = parseInt(document.getElementById('weight-slider')?.value || 80);
  document.getElementById('screen-onboard-stats').classList.remove('active');
  document.getElementById('screen-onboard-bodyfat').classList.add('active');
}

function goToGoal() {
  document.getElementById('screen-onboard-bodyfat').classList.remove('active');
  document.getElementById('screen-onboard-goal').classList.add('active');
}

function enterApp() {
  if (selectedBF)   user.bodyFat = selectedBF;
  if (selectedGoal) user.goal    = selectedGoal;
  Store.set('user', user);
  document.getElementById('screen-onboard-goal').classList.remove('active');
  document.getElementById('bottom-nav').style.display = 'flex';
  document.getElementById('screen-home').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-home').classList.add('active');
  bootApp();
  setTimeout(animateStreakCounters, 200);
  setTimeout(animateProgressBars, 400);
}

function selectBodyFat(el, bf, category, color) {
  document.querySelectorAll('.bf-option').forEach(o => { o.classList.remove('selected'); o.style.removeProperty('--sel-color'); o.style.removeProperty('--sel-glow'); });
  el.classList.add('selected'); el.style.setProperty('--sel-color', color); el.style.setProperty('--sel-glow', color + '33');
  selectedBF = bf;
  const display = document.getElementById('bf-selected-display');
  document.getElementById('bf-sel-val').textContent = `~${bf}% body fat`;
  const tag = document.getElementById('bf-sel-tag');
  tag.textContent = category; tag.style.background = color + '20'; tag.style.color = color;
  display.style.display = 'block';
  const btn = document.getElementById('bf-next-btn');
  btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
}

function selectGoal(el, goal) {
  document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected'); selectedGoal = goal;
  const btn = document.getElementById('goal-next-btn');
  btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
}

function updateSlider(type) {
  const slider = document.getElementById(`${type}-slider`);
  const display = document.getElementById(`${type}-display`);
  const val = parseInt(slider.value);
  display.textContent = val;
  const pct = ((val - parseInt(slider.min)) / (parseInt(slider.max) - parseInt(slider.min))) * 100;
  slider.style.background = `linear-gradient(90deg,#A78BFA ${pct}%,var(--slider-track) ${pct}%)`;
  if (type === 'height') user.height = val;
  if (type === 'weight') user.weight = val;
  updateBMI();
}

function updateBMI() {
  const h = user.height / 100, bmi = +(user.weight / (h * h)).toFixed(1);
  const bmiDisplay = document.getElementById('bmi-display');
  const bmiCat = document.getElementById('bmi-cat');
  if (!bmiDisplay) return;
  let cat = 'Normal', col = 'var(--accent-green)';
  if (bmi < 18.5) { cat = 'Underweight'; col = 'var(--accent-blue)'; }
  else if (bmi >= 25 && bmi < 30) { cat = 'Overweight'; col = 'var(--accent-orange)'; }
  else if (bmi >= 30) { cat = 'Obese'; col = 'var(--accent-red)'; }
  bmiCat.textContent = cat; bmiCat.style.color = col;
  if (bmiDisplay.childNodes[0]) bmiDisplay.childNodes[0].textContent = `${bmi} `;
}

function initSliders() {
  ['height', 'weight'].forEach(t => {
    const s = document.getElementById(`${t}-slider`); if (!s) return;
    const pct = ((parseInt(s.value) - parseInt(s.min)) / (parseInt(s.max) - parseInt(s.min))) * 100;
    s.style.background = `linear-gradient(90deg,#A78BFA ${pct}%,var(--slider-track) ${pct}%)`;
  });
  updateBMI();
}

// ─── WORKOUT DATA ─────────────────────────────────────────────────────────────
const WORKOUT = {
  name: 'Upper Body Hypertrophy', type: 'Push Day', tag: 'Hypertrophy',
  exercises: [
    { name: 'Barbell Bench Press', muscle: 'Chest · Triceps', rest: 120, tip: 'Tuck elbows 45°, full ROM, pause at chest',
      videoId: 'vthMCtgVtFw', videoTips: ['Retract scapula before unracking','Bar path: lower chest to mid-chest arc','Feet flat, slight arch in lower back','Touch chest — no bouncing'],
      sets: [{w:60,r:12,note:'warm-up'},{w:75,r:8},{w:80,r:6,ai:true},{w:75,r:8}] },
    { name: 'Incline DB Press', muscle: 'Upper Chest', rest: 90, tip: 'Set at 30–45° incline. Control descent 2–3s',
      videoId: '5HLW2AI2Eck', videoTips: ['30–45° bench angle — not higher','Neutral grip at top, slight flare at bottom','Lower to upper chest level','Pause briefly — no bouncing'],
      sets: [{w:30,r:10},{w:34,r:8},{w:34,r:8}] },
    { name: 'Cable Lateral Raises', muscle: 'Medial Delts', rest: 60, tip: 'Lead with elbow, slight forward lean, no shrugging',
      videoId: 'yzJ7l02-yh4', videoTips: ['Lead with your elbow — not your hand','Slight forward torso lean (10–15°)','Raise to shoulder height only','Control descent — 2–3 seconds down'],
      sets: [{w:8,r:15},{w:8,r:15},{w:8,r:12},{w:8,r:12}] },
    { name: 'Overhead Press', muscle: 'Shoulders · Traps', rest: 120, tip: 'Brace core, no arching, drive bar straight up',
      videoId: '2yjwXTZQDDI', videoTips: ['Bar starts at collarbone level','Tuck elbows slightly — not full flare','Brace core hard — no lower back hyperextension','Push your head through at the top'],
      sets: [{w:40,r:10},{w:47.5,r:8},{w:47.5,r:6}] },
    { name: 'Tricep Pushdowns', muscle: 'Triceps', rest: 60, tip: 'Elbows pinned, squeeze at full extension',
      videoId: 'vB5OHsJ3EME', videoTips: ['Elbows pinned to sides — do not flare','Rope: split apart at bottom for full contraction','Full extension at bottom — squeeze 1 second','Slow eccentric on the way back up'],
      sets: [{w:25,r:15},{w:30,r:12},{w:30,r:10}] }
  ]
};

// ─── WORKOUT RENDERING ────────────────────────────────────────────────────────
function renderExerciseList() {
  const list = document.getElementById('exercise-list');
  if (!list) return;

  // Update stats strip
  const totalSets = WORKOUT.exercises.reduce((s, e) => s + e.sets.length, 0);
  const statsEls = document.querySelectorAll('.wstat-val');
  if (statsEls[0]) statsEls[0].textContent = WORKOUT.exercises.length;
  if (statsEls[2]) statsEls[2].textContent = totalSets;

  list.innerHTML = WORKOUT.exercises.map((ex, exIdx) => {
    const done = completedSets[`ex${exIdx}`] || [];
    const setsHtml = ex.sets.map((set, si) => {
      const isDone = done.includes(si);
      const note = set.note ? `<span class="set-note">${set.note}</span>` : '';
      const aiBadge = set.ai ? `<span class="ai-badge">AI ↑</span>` : '';
      return `<div class="set-row${isDone ? ' done-set' : ''}" id="set-${exIdx}-${si}"
        onclick="completeSet(${exIdx},${si},${ex.rest})" title="Tap to mark complete">
        <span class="set-num">${isDone ? '✓' : si + 1}</span>
        <span class="set-weight">${set.w} kg ${note}${aiBadge}</span>
        <span class="set-reps">${set.r}</span>
        <span class="set-rest">${ex.rest}s</span>
      </div>`;
    }).join('');

    const allDone = done.length === ex.sets.length;
    return `
      <div class="exercise-card${allDone ? ' ex-completed' : ''}" id="ex-card-${exIdx}">
        <div class="exercise-num${allDone ? ' ex-num-done' : ''}">${allDone ? '✓' : exIdx + 1}</div>
        <div class="exercise-info">
          <div class="exercise-header">
            <h3 class="exercise-name">${ex.name}</h3>
            <span class="muscle-tag">${ex.muscle}</span>
          </div>
          <div class="sets-table">
            <div class="set-row header-row"><span>Set</span><span>Weight</span><span>Reps</span><span>Rest</span></div>
            ${setsHtml}
          </div>
          <div class="exercise-tip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            ${ex.tip}
          </div>
          <button class="watch-form-btn" onclick="openVideo('${exIdx}','${ex.name}','${ex.videoId}',${JSON.stringify(ex.videoTips)})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            Watch Form on YouTube
          </button>
        </div>
      </div>`;
  }).join('');
}

function updateWorkoutProgress() {
  const totalSets = WORKOUT.exercises.reduce((s, e) => s + e.sets.length, 0);
  const doneSets  = Object.values(completedSets).flat().length;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  const fill = document.querySelector('.workout-progress-fill');
  const text = document.querySelector('.workout-footer-text');
  if (fill) fill.style.width = pct + '%';
  if (text) {
    if (doneSets === 0)          text.textContent = 'Not started';
    else if (doneSets === totalSets) { text.textContent = '🎉 Workout complete!'; setTimeout(showWorkoutComplete, 800); }
    else                         text.textContent = `${doneSets}/${totalSets} sets done`;
  }
}

// ─── WORKOUT SESSION ─────────────────────────────────────────────────────────
function beginWorkout() {
  if (workoutActive) return;
  workoutActive = true;
  workoutStartTs = Date.now();
  Store.set('wkt_start', workoutStartTs);
  document.getElementById('workout-active-bar').style.display = 'flex';
  startWorkoutClock();
  updateWorkoutProgress();
  // Scroll to first exercise
  const first = document.getElementById('ex-card-0');
  if (first) setTimeout(() => first.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

function startWorkoutClock() {
  if (workoutTimerInterval) clearInterval(workoutTimerInterval);
  const update = () => {
    if (!workoutStartTs) return;
    const e = Date.now() - workoutStartTs;
    const m = Math.floor(e / 60000), s = Math.floor((e % 60000) / 1000);
    const t = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const el1 = document.getElementById('workout-timer-display');
    const el2 = document.getElementById('active-workout-time');
    if (el1) el1.textContent = t;
    if (el2) el2.textContent = t;
  };
  update();
  workoutTimerInterval = setInterval(update, 1000);
}

function completeSet(exIdx, setIdx, restSecs) {
  if (!workoutActive) { beginWorkout(); }
  const key = `ex${exIdx}`;
  if (!completedSets[key]) completedSets[key] = [];
  const already = completedSets[key].includes(setIdx);
  if (already) {
    completedSets[key] = completedSets[key].filter(s => s !== setIdx);
  } else {
    completedSets[key].push(setIdx);
    if (!already) startRestTimer(restSecs, exIdx, setIdx);
  }
  Store.set('wkt_sets', completedSets);
  renderExerciseList();
  updateWorkoutProgress();
}

// ─── REST TIMER ───────────────────────────────────────────────────────────────
function startRestTimer(seconds, exIdx, setIdx) {
  const overlay = document.getElementById('rest-timer-overlay');
  if (!overlay) return;
  clearInterval(restInterval);
  restTotal = seconds;
  restRemaining = seconds;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.style.opacity = '1');

  // Next set label
  const ex = WORKOUT.exercises[exIdx];
  let nextLabel = 'All sets done — great work!';
  if (setIdx + 1 < ex.sets.length) {
    const ns = ex.sets[setIdx + 1];
    nextLabel = `Next → Set ${setIdx + 2}: ${ns.w} kg × ${ns.r} reps`;
  } else if (exIdx + 1 < WORKOUT.exercises.length) {
    nextLabel = `Next → ${WORKOUT.exercises[exIdx + 1].name}`;
  }
  const nl = document.getElementById('rest-next-label');
  if (nl) nl.textContent = nextLabel;

  updateRestDisplay();
  restInterval = setInterval(() => {
    restRemaining--;
    updateRestDisplay();
    if (restRemaining <= 0) { clearInterval(restInterval); finishRest(); }
  }, 1000);
}

function updateRestDisplay() {
  const countEl = document.getElementById('rest-count');
  const circle  = document.getElementById('rest-circle');
  if (countEl) {
    const m = Math.floor(restRemaining / 60), s = restRemaining % 60;
    countEl.textContent = restRemaining >= 60
      ? `${m}:${String(s).padStart(2,'0')}`
      : `${restRemaining}`;
  }
  if (circle) {
    const C = 2 * Math.PI * 42;
    const progress = Math.max(restRemaining / restTotal, 0);
    circle.style.strokeDasharray = C;
    circle.style.strokeDashoffset = C * (1 - progress);
  }
}

function finishRest() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  dismissRestTimer();
}

function skipRest() { clearInterval(restInterval); dismissRestTimer(); }

function addRestTime(secs) { restRemaining += secs; updateRestDisplay(); }

function dismissRestTimer() {
  const overlay = document.getElementById('rest-timer-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.display = 'none'; overlay.style.opacity = '1'; }, 300);
}

// ─── WORKOUT COMPLETE ────────────────────────────────────────────────────────
function showWorkoutComplete() {
  const modal = document.getElementById('workout-complete-modal');
  if (!modal || modal.classList.contains('open')) return;
  const elapsed = workoutStartTs ? Math.floor((Date.now() - workoutStartTs) / 60000) : 0;
  let volume = 0;
  WORKOUT.exercises.forEach(ex => ex.sets.forEach(s => volume += s.w * s.r));
  const sets = Object.values(completedSets).flat().length;

  document.getElementById('wc-duration').textContent = elapsed + ' min';
  document.getElementById('wc-sets').textContent     = sets;
  document.getElementById('wc-volume').textContent   = Math.round(volume).toLocaleString() + ' kg';
  document.getElementById('wc-calories').textContent = `~${Math.round(elapsed * 8)} kcal`;

  // Save session
  const session = { date: new Date().toISOString().split('T')[0], name: WORKOUT.name, duration: elapsed, sets, volume: Math.round(volume) };
  progress.sessions.unshift(session);
  if (progress.sessions.length > 90) progress.sessions.pop();
  Store.set('progress', progress);
  modal.classList.add('open');
}

function closeWorkoutComplete() {
  document.getElementById('workout-complete-modal')?.classList.remove('open');
  clearInterval(workoutTimerInterval); clearInterval(restInterval);
  workoutActive = false; workoutStartTs = null;
  completedSets = {}; restRemaining = 0;
  Store.del('wkt_start'); Store.del('wkt_sets');
  document.getElementById('workout-active-bar').style.display = 'none';
  dismissRestTimer();
  renderExerciseList();
  updateWorkoutProgress();
  switchScreen('screen-home');
}

// ─── FOOD DATABASE ────────────────────────────────────────────────────────────
const FOODS = [
  { id:1,  name:'Chicken Breast',   emoji:'🍗', serving:'100g',          kcal:165, protein:31,   carbs:0,   fat:3.6, fiber:0,   vitC:0,  vitD:4,   calcium:11,  iron:0.7, magnesium:29,  zinc:1.9, potassium:256, b12:0.3 },
  { id:2,  name:'White Rice',       emoji:'🍚', serving:'100g cooked',   kcal:130, protein:2.7,  carbs:28,  fat:0.3, fiber:0.4, vitC:0,  vitD:0,   calcium:10,  iron:0.4, magnesium:12,  zinc:0.5, potassium:35,  b12:0   },
  { id:3,  name:'Whole Egg',        emoji:'🥚', serving:'1 large (50g)', kcal:70,  protein:6,    carbs:0.6, fat:5,   fiber:0,   vitC:0,  vitD:41,  calcium:25,  iron:0.9, magnesium:6,   zinc:0.6, potassium:63,  b12:0.6 },
  { id:4,  name:'Whey Protein',     emoji:'💪', serving:'1 scoop (30g)', kcal:120, protein:25,   carbs:3,   fat:2,   fiber:0,   vitC:0,  vitD:0,   calcium:130, iron:0.5, magnesium:30,  zinc:1.5, potassium:160, b12:0.3 },
  { id:5,  name:'Oats',             emoji:'🌾', serving:'80g dry',       kcal:296, protein:10,   carbs:52,  fat:5.6, fiber:7,   vitC:0,  vitD:0,   calcium:52,  iron:3.4, magnesium:138, zinc:3.1, potassium:429, b12:0   },
  { id:6,  name:'Greek Yogurt',     emoji:'🥣', serving:'200g',          kcal:120, protein:20,   carbs:7,   fat:1.4, fiber:0,   vitC:1,  vitD:4,   calcium:188, iron:0.1, magnesium:17,  zinc:0.9, potassium:240, b12:1.3 },
  { id:7,  name:'Banana',           emoji:'🍌', serving:'1 medium',      kcal:105, protein:1.3,  carbs:27,  fat:0.4, fiber:3.1, vitC:10, vitD:0,   calcium:5,   iron:0.3, magnesium:32,  zinc:0.2, potassium:422, b12:0   },
  { id:8,  name:'Salmon',           emoji:'🐟', serving:'100g',          kcal:208, protein:20,   carbs:0,   fat:13,  fiber:0,   vitC:3,  vitD:526, calcium:12,  iron:0.3, magnesium:29,  zinc:0.4, potassium:363, b12:3.2 },
  { id:9,  name:'Sweet Potato',     emoji:'🍠', serving:'100g',          kcal:86,  protein:1.6,  carbs:20,  fat:0.1, fiber:3,   vitC:20, vitD:0,   calcium:30,  iron:0.6, magnesium:25,  zinc:0.3, potassium:337, b12:0   },
  { id:10, name:'Avocado',          emoji:'🥑', serving:'100g',          kcal:160, protein:2,    carbs:9,   fat:15,  fiber:6.7, vitC:10, vitD:0,   calcium:12,  iron:0.6, magnesium:29,  zinc:0.6, potassium:485, b12:0   },
  { id:11, name:'Almonds',          emoji:'🌰', serving:'30g',           kcal:173, protein:6,    carbs:6,   fat:15,  fiber:3.5, vitC:0,  vitD:0,   calcium:75,  iron:1.0, magnesium:80,  zinc:0.9, potassium:210, b12:0   },
  { id:12, name:'Tuna (canned)',    emoji:'🐠', serving:'100g',          kcal:116, protein:26,   carbs:0,   fat:1,   fiber:0,   vitC:0,  vitD:68,  calcium:10,  iron:1.2, magnesium:35,  zinc:0.8, potassium:444, b12:2.2 },
  { id:13, name:'Peanut Butter',    emoji:'🥜', serving:'2 tbsp (32g)',  kcal:188, protein:8,    carbs:7,   fat:16,  fiber:2,   vitC:0,  vitD:0,   calcium:17,  iron:0.6, magnesium:51,  zinc:0.9, potassium:180, b12:0   },
  { id:14, name:'Broccoli',         emoji:'🥦', serving:'100g',          kcal:34,  protein:2.8,  carbs:7,   fat:0.4, fiber:2.6, vitC:89, vitD:0,   calcium:47,  iron:0.7, magnesium:21,  zinc:0.4, potassium:316, b12:0   },
  { id:15, name:'Lean Beef',        emoji:'🥩', serving:'100g',          kcal:215, protein:26,   carbs:0,   fat:12,  fiber:0,   vitC:0,  vitD:8,   calcium:18,  iron:2.7, magnesium:22,  zinc:4.8, potassium:318, b12:2.6 },
  { id:16, name:'Whole Milk',       emoji:'🥛', serving:'250ml',         kcal:149, protein:8,    carbs:12,  fat:8,   fiber:0,   vitC:0,  vitD:40,  calcium:276, iron:0.1, magnesium:25,  zinc:1.0, potassium:322, b12:1.1 },
  { id:17, name:'Whole Wheat Bread',emoji:'🍞', serving:'2 slices (60g)',kcal:150, protein:6,    carbs:28,  fat:2,   fiber:3.4, vitC:0,  vitD:0,   calcium:43,  iron:1.9, magnesium:37,  zinc:1.0, potassium:126, b12:0   },
  { id:18, name:'Cottage Cheese',   emoji:'🧀', serving:'100g',          kcal:98,  protein:11,   carbs:3.4, fat:4.3, fiber:0,   vitC:0,  vitD:0,   calcium:83,  iron:0.1, magnesium:8,   zinc:0.4, potassium:84,  b12:0.4 },
  { id:19, name:'Olive Oil',        emoji:'🫒', serving:'1 tbsp (14g)',  kcal:119, protein:0,    carbs:0,   fat:14,  fiber:0,   vitC:0,  vitD:0,   calcium:1,   iron:0.1, magnesium:0,   zinc:0,   potassium:1,   b12:0   },
  { id:20, name:'Apple',            emoji:'🍎', serving:'1 medium',      kcal:95,  protein:0.5,  carbs:25,  fat:0.3, fiber:4.4, vitC:8,  vitD:0,   calcium:11,  iron:0.2, magnesium:9,   zinc:0.1, potassium:195, b12:0   },
  { id:21, name:'Coffee (black)',   emoji:'☕', serving:'1 cup',          kcal:2,   protein:0.3,  carbs:0,   fat:0,   fiber:0,   vitC:0,  vitD:0,   calcium:5,   iron:0.1, magnesium:7,   zinc:0.1, potassium:116, b12:0   },
  { id:22, name:'Pasta',            emoji:'🍝', serving:'100g cooked',   kcal:158, protein:5.8,  carbs:31,  fat:0.9, fiber:1.8, vitC:0,  vitD:0,   calcium:7,   iron:0.5, magnesium:18,  zinc:0.5, potassium:44,  b12:0   },
  { id:23, name:'Protein Bar',      emoji:'🍫', serving:'1 bar (60g)',   kcal:210, protein:20,   carbs:22,  fat:7,   fiber:5,   vitC:5,  vitD:40,  calcium:200, iron:2.0, magnesium:50,  zinc:2.5, potassium:180, b12:0.6 },
  { id:24, name:'Dark Chocolate',   emoji:'🍫', serving:'30g',           kcal:168, protein:2,    carbs:13,  fat:12,  fiber:3,   vitC:0,  vitD:0,   calcium:20,  iron:3.4, magnesium:65,  zinc:1.0, potassium:200, b12:0   },
  { id:25, name:'Orange',           emoji:'🍊', serving:'1 medium',      kcal:62,  protein:1.2,  carbs:15,  fat:0.2, fiber:3.1, vitC:70, vitD:0,   calcium:52,  iron:0.1, magnesium:14,  zinc:0.1, potassium:238, b12:0   },
  { id:26, name:'Brown Rice',       emoji:'🍱', serving:'100g cooked',   kcal:111, protein:2.6,  carbs:23,  fat:0.9, fiber:1.8, vitC:0,  vitD:0,   calcium:10,  iron:0.4, magnesium:43,  zinc:0.6, potassium:79,  b12:0   },
  { id:27, name:'Beef Liver',       emoji:'🫀', serving:'100g',          kcal:175, protein:27,   carbs:4,   fat:5,   fiber:0,   vitC:3,  vitD:49,  calcium:5,   iron:6.2, magnesium:21,  zinc:5.3, potassium:380, b12:83  },
  { id:28, name:'Spinach',          emoji:'🥬', serving:'100g',          kcal:23,  protein:2.9,  carbs:3.6, fat:0.4, fiber:2.2, vitC:28, vitD:0,   calcium:99,  iron:2.7, magnesium:79,  zinc:0.5, potassium:558, b12:0   },
  { id:29, name:'Quinoa',           emoji:'🌿', serving:'100g cooked',   kcal:120, protein:4.4,  carbs:21,  fat:1.9, fiber:2.8, vitC:0,  vitD:0,   calcium:17,  iron:1.5, magnesium:64,  zinc:1.1, potassium:172, b12:0   },
  { id:30, name:'Blueberries',      emoji:'🫐', serving:'100g',          kcal:57,  protein:0.7,  carbs:14,  fat:0.3, fiber:2.4, vitC:10, vitD:0,   calcium:6,   iron:0.3, magnesium:6,   zinc:0.2, potassium:77,  b12:0   },
];

// ─── FOOD LOG UI ─────────────────────────────────────────────────────────────
let foodSearchTimer;

function openFoodLog() {
  const modal = document.getElementById('food-log-modal');
  if (!modal) return;
  modal.classList.add('open');
  renderFoodResults('');
  setTimeout(() => document.getElementById('food-search-input')?.focus(), 300);
}

function closeFoodLog() { document.getElementById('food-log-modal')?.classList.remove('open'); }

function onFoodSearch(val) {
  clearTimeout(foodSearchTimer);
  foodSearchTimer = setTimeout(() => renderFoodResults(val), 120);
}

function renderFoodResults(query) {
  const list = document.getElementById('food-results-list');
  if (!list) return;
  const q = query.toLowerCase().trim();
  const results = q ? FOODS.filter(f => f.name.toLowerCase().includes(q)) : FOODS;
  if (results.length === 0) {
    list.innerHTML = `<p style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No foods found for "${query}"</p>`;
    return;
  }
  list.innerHTML = results.map(f => `
    <div class="food-result-row" onclick="logFood(${f.id})">
      <span class="fr-emoji">${f.emoji}</span>
      <div class="fr-info">
        <p class="fr-name">${f.name}</p>
        <p class="fr-meta">${f.serving} · <strong>${f.kcal} kcal</strong></p>
      </div>
      <div class="fr-macros">
        <span class="frm p">P ${Math.round(f.protein)}g</span>
        <span class="frm c">C ${Math.round(f.carbs)}g</span>
        <span class="frm f">F ${Math.round(f.fat)}g</span>
      </div>
    </div>
  `).join('');
}

function logFood(foodId, e) {
  const food = FOODS.find(f => f.id === foodId);
  if (!food) return;
  const entry = {
    id: Date.now(), foodId: food.id, name: food.name, emoji: food.emoji,
    serving: food.serving, kcal: food.kcal, protein: food.protein,
    carbs: food.carbs, fat: food.fat, fiber: food.fiber || 0,
    time: new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })
  };
  nutrition.logged.push(entry);
  saveNutrition();
  // visual feedback on the row
  const row = document.querySelector(`[onclick="logFood(${foodId})"]`);
  if (row) { row.style.background = 'rgba(52,211,153,0.14)'; setTimeout(() => row.style.background = '', 600); }
  setTimeout(() => { closeFoodLog(); updateNutritionScreen(); updateHomeScreen(); }, 700);
}

function removeLogEntry(entryId) {
  nutrition.logged = nutrition.logged.filter(e => e.id !== entryId);
  saveNutrition();
  updateNutritionScreen();
  updateHomeScreen();
}

// ─── HOME SCREEN UPDATES ─────────────────────────────────────────────────────
function updateHomeScreen() {
  const p = getProfile();
  const t = getTotals();

  // Kcal ring
  const ringKcal = document.querySelector('.ring-kcal');
  if (ringKcal) ringKcal.textContent = t.kcal.toLocaleString();

  const ringCircle = document.querySelector('.nutrition-ring circle:last-child');
  if (ringCircle) {
    const pct = Math.min(t.kcal / p.targetCals, 1);
    ringCircle.style.strokeDashoffset = 251.2 * (1 - pct);
  }

  // Macro bars
  const fills = document.querySelectorAll('.macro-bar-fill');
  const lows  = document.querySelectorAll('.macro-bar-low');
  const goals = document.querySelectorAll('.macro-goal');
  const vals  = document.querySelectorAll('.macro-val');

  const data = [
    { cur: t.protein, min: p.proteinMin, max: p.proteinMax },
    { cur: t.carbs,   min: p.carbMin,    max: p.carbMax    },
    { cur: t.fat,     min: p.fatMin,     max: p.fatMax     },
  ];

  data.forEach((d, i) => {
    if (fills[i]) fills[i].style.width = Math.min((d.cur / d.max) * 100, 100) + '%';
    if (lows[i])  lows[i].style.width  = ((d.min / d.max) * 100) + '%';
    if (goals[i]) goals[i].textContent = `${d.min}–${d.max}g`;
    if (vals[i] && vals[i].firstChild) vals[i].firstChild.textContent = `${Math.round(d.cur)}g `;
  });

  // Water on home
  renderWater();
}

// ─── NUTRITION SCREEN UPDATES ────────────────────────────────────────────────
function updateNutritionScreen() {
  const p = getProfile();
  const t = getTotals();

  // Update phase tag
  const phaseMap = { muscle: 'Bulking Phase', fat: 'Cutting Phase', strength: 'Strength Phase', recomp: 'Recomp Phase' };
  const phaseTag = document.querySelector('#screen-nutrition .topbar-tags .tag');
  if (phaseTag) {
    phaseTag.textContent = phaseMap[user.goal] || 'Custom Phase';
    phaseTag.className = `tag ${user.goal === 'fat' ? 'orange' : user.goal === 'strength' ? 'purple' : 'green'}`;
  }

  // Calorie donut
  const donutVal = document.querySelector('.donut-val');
  if (donutVal) donutVal.textContent = t.kcal.toLocaleString();
  const donutCircle = document.querySelector('.calorie-donut-wrap svg circle:last-child');
  if (donutCircle) {
    const C = 2 * Math.PI * 50;
    const pct = Math.min(t.kcal / p.targetCals, 1);
    donutCircle.style.strokeDasharray = C;
    donutCircle.style.strokeDashoffset = C * (1 - pct);
  }

  // Cal rows
  const calVals = document.querySelectorAll('.cal-val');
  if (calVals[0]) calVals[0].textContent = `${p.calRange[0].toLocaleString()}–${p.calRange[1].toLocaleString()} kcal`;
  if (calVals[1]) calVals[1].textContent = `${t.kcal.toLocaleString()} kcal`;
  const todaySession = progress.sessions.find(s => s.date === new Date().toISOString().split('T')[0]);
  const exBurn = todaySession ? Math.round(todaySession.duration * 8) : (workoutActive && workoutStartTs ? Math.round((Date.now() - workoutStartTs) / 60000 * 7) : 0);
  if (calVals[2]) calVals[2].textContent = `−${exBurn} kcal`;
  const remaining = p.calRange[1] + exBurn - t.kcal;
  if (calVals[3]) calVals[3].textContent = remaining > 0 ? `${Math.max(0, p.calRange[0] - t.kcal).toLocaleString()}–${remaining.toLocaleString()}` : '✓ Target reached';

  // Macro blocks
  updateMacroBlock('protein', t.protein, p.proteinMin, p.proteinMax);
  updateMacroBlock('carbs',   t.carbs,   p.carbMin,    p.carbMax);
  updateMacroBlock('fats',    t.fat,     p.fatMin,     p.fatMax);

  // Render logged meals
  renderLoggedMeals();
  renderMicronutrients();
}

function updateMacroBlock(type, current, min, max) {
  const block = document.querySelector(`.${type}-block`);
  if (!block) return;
  current = Math.round(current);

  const curEl = block.querySelector('.macro-current');
  if (curEl) curEl.textContent = `${current}g`;

  const rlVals = block.querySelectorAll('.rl-val');
  if (rlVals[0]) rlVals[0].textContent = `${min}g`;
  if (rlVals[1]) rlVals[1].textContent = `${max}g`;

  const zone = block.querySelector('.range-bar-zone');
  const dot  = block.querySelector('.range-fill-dot');
  const minM = block.querySelector('.range-min-marker');
  const maxM = block.querySelector('.range-max-marker');
  const barPct = Math.min((current / max) * 100, 100);
  const minPct = (min / max) * 100;

  if (zone) zone.style.width = barPct + '%';
  if (dot)  dot.style.left  = barPct + '%';
  if (minM) minM.style.left = minPct + '%';
  if (maxM) maxM.style.left = '100%';

  const labels = block.querySelectorAll('.range-bar-labels span');
  if (labels[1]) labels[1].textContent = `${max}g`;

  const chip = block.querySelector('.macro-status-chip');
  const ratio = block.querySelector('.macro-ratio');
  if (chip) {
    if (current < min)             { chip.className = 'macro-status-chip warn';  chip.textContent = `⚠ ${min - current}g below minimum`; }
    else if (current <= max)       { chip.className = 'macro-status-chip good';  chip.textContent = `✓ Within target range`; }
    else                           { chip.className = 'macro-status-chip over';  chip.textContent = `↑ ${current - max}g above maximum`; }
  }
  if (ratio) ratio.textContent = `${(current / user.weight).toFixed(1)}g/kg bodyweight`;
}

function renderLoggedMeals() {
  const container = document.getElementById('logged-meals-list');
  if (!container) return;
  if (nutrition.logged.length === 0) {
    container.innerHTML = `<div class="empty-log">
      <p>🍽️ Nothing logged yet today</p>
      <p>Tap <strong>+</strong> above to log your meals</p>
    </div>`;
    return;
  }
  const t = getTotals();
  container.innerHTML = `
    <div class="log-summary-row">
      <span class="log-sum-label">Today's Total</span>
      <div class="log-sum-macros">
        <span class="frm p">P ${Math.round(t.protein)}g</span>
        <span class="frm c">C ${Math.round(t.carbs)}g</span>
        <span class="frm f">F ${Math.round(t.fat)}g</span>
        <span class="frm kcal">${Math.round(t.kcal)} kcal</span>
      </div>
    </div>
    ${nutrition.logged.map(entry => `
    <div class="logged-item">
      <span class="li-emoji">${entry.emoji}</span>
      <div class="li-info">
        <p class="li-name">${entry.name}</p>
        <p class="li-meta">${entry.serving} · ${entry.time}</p>
      </div>
      <div class="li-right">
        <span class="li-kcal">${entry.kcal} kcal</span>
        <button class="li-del" onclick="removeLogEntry(${entry.id})" aria-label="Remove">✕</button>
      </div>
    </div>`).join('')}`;
}

// ─── WATER TRACKING ───────────────────────────────────────────────────────────
function addWater(ml) {
  nutrition.water = (nutrition.water || 0) + ml;
  if (nutrition.water < 0) nutrition.water = 0;
  saveNutrition();
  renderWater();
}

function renderWater() {
  const p = getProfile();
  const current = nutrition.water || 0;
  const goal = p.waterGoal;
  const pct = Math.min((current / goal) * 100, 100);
  const liters = current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`;
  const goalL = `${(goal / 1000).toFixed(1)}L`;

  document.querySelectorAll('.water-amount').forEach(el => el.textContent = liters);
  document.querySelectorAll('.water-goal-text').forEach(el => el.textContent = `/ ${goalL}`);
  document.querySelectorAll('.water-bar-fill').forEach(el => el.style.width = pct + '%');
}

// ─── PROGRESS SCREEN ─────────────────────────────────────────────────────────
function updateProgressScreen() {
  const leanMass = +(user.weight * (1 - user.bodyFat / 100)).toFixed(1);
  const bmi = +(user.weight / ((user.height / 100) ** 2)).toFixed(1);

  const bstatVals = document.querySelectorAll('.bstat-val');
  if (bstatVals[0]) bstatVals[0].innerHTML = `${user.weight} <span class="bstat-unit">kg</span>`;
  if (bstatVals[1]) bstatVals[1].innerHTML = `${user.bodyFat} <span class="bstat-unit">%</span>`;
  if (bstatVals[2]) bstatVals[2].innerHTML = `${leanMass} <span class="bstat-unit">kg</span>`;
  if (bstatVals[3]) bstatVals[3].innerHTML = `${bmi}`;

  renderWeightChart();
  renderActivityStats();
}

function openWeightModal() {
  const modal = document.getElementById('weight-log-modal');
  if (!modal) return;
  modal.classList.add('open');
  const input = document.getElementById('weight-input');
  if (input) { input.value = user.weight; input.focus(); input.select(); }
}

function closeWeightModal() { document.getElementById('weight-log-modal')?.classList.remove('open'); }

function logWeight() {
  const input = document.getElementById('weight-input');
  const val = parseFloat(input?.value);
  if (!val || val < 20 || val > 400) {
    input?.classList.add('shake-err');
    setTimeout(() => input?.classList.remove('shake-err'), 500);
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const existing = progress.weights.findIndex(w => w.date === today);
  if (existing >= 0) progress.weights[existing].weight = val;
  else progress.weights.unshift({ date: today, weight: val });
  if (progress.weights.length > 90) progress.weights.pop();
  user.weight = val;
  Store.set('user', user);
  Store.set('progress', progress);
  closeWeightModal();
  updateProgressScreen();
  updateHomeScreen();
  updateNutritionScreen();
}

function renderWeightChart() {
  const canvas = document.getElementById('weight-chart');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth * (window.devicePixelRatio || 1);
  const H = canvas.offsetHeight * (window.devicePixelRatio || 1);
  canvas.width = W; canvas.height = H;

  const weights = progress.weights.slice(0, 14).reverse();

  if (weights.length < 2) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${Math.round(W * 0.04)}px Inter,sans-serif`;
    ctx.fillStyle = currentTheme === 'dark' ? '#505050' : '#909090';
    ctx.textAlign = 'center';
    ctx.fillText('Log your weight daily to see your chart', W / 2, H / 2 - 10);
    ctx.fillText('Tap + Weight above to start tracking', W / 2, H / 2 + 16);
    return;
  }

  const pad = { t: 18, r: 10, b: 28, l: 36 };
  const wVals = weights.map(w => w.weight);
  const minW = Math.min(...wVals) - 0.5, maxW = Math.max(...wVals) + 0.5;
  const range = maxW - minW || 1;
  const isDark = currentTheme === 'dark';
  const textCol = isDark ? '#555' : '#999';
  const lineCol = '#A78BFA';

  const toX = i => pad.l + (i / (weights.length - 1)) * (W - pad.l - pad.r);
  const toY = w => pad.t + ((maxW - w) / range) * (H - pad.t - pad.b);

  ctx.clearRect(0, 0, W, H);

  // Area fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(167,139,250,0.18)');
  grad.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.beginPath();
  ctx.moveTo(toX(0), H - pad.b);
  weights.forEach((w, i) => {
    if (i === 0) ctx.lineTo(toX(0), toY(w.weight));
    else { const px = toX(i-1), py = toY(weights[i-1].weight), cx = (px + toX(i)) / 2;
      ctx.bezierCurveTo(cx, py, cx, toY(w.weight), toX(i), toY(w.weight)); }
  });
  ctx.lineTo(toX(weights.length - 1), H - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  weights.forEach((w, i) => {
    if (i === 0) ctx.moveTo(toX(0), toY(w.weight));
    else { const px = toX(i-1), py = toY(weights[i-1].weight), cx = (px + toX(i)) / 2;
      ctx.bezierCurveTo(cx, py, cx, toY(w.weight), toX(i), toY(w.weight)); }
  });
  ctx.strokeStyle = lineCol; ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

  // Dots
  weights.forEach((w, i) => {
    const x = toX(i), y = toY(w.weight), r = 4 * (window.devicePixelRatio || 1);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = lineCol; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#161616' : '#fff'; ctx.fill();
  });

  // Labels
  ctx.font = `${10 * (window.devicePixelRatio || 1)}px Inter,sans-serif`;
  ctx.fillStyle = textCol; ctx.textAlign = 'right';
  [minW + 0.5, (minW + maxW) / 2, maxW - 0.5].forEach(v => {
    const y = toY(v);
    ctx.fillText(v.toFixed(1), pad.l - 4, y + 3 * (window.devicePixelRatio || 1));
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1; ctx.stroke();
  });

  ctx.textAlign = 'center';
  const step = Math.ceil(weights.length / 5);
  weights.forEach((w, i) => {
    if (i % step === 0 || i === weights.length - 1) {
      const d = new Date(w.date + 'T00:00:00');
      ctx.fillStyle = textCol;
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, toX(i), H - 6 * (window.devicePixelRatio || 1));
    }
  });
}

function renderActivityStats() {
  const totalSessions = progress.sessions.length;
  const totalVolume = progress.sessions.reduce((a, s) => a + (s.volume || 0), 0);
  const el1 = document.getElementById('stat-sessions');
  const el2 = document.getElementById('stat-volume');
  if (el1) el1.textContent = totalSessions;
  if (el2) el2.textContent = totalVolume > 0 ? `${Math.round(totalVolume / 1000).toLocaleString()}t` : '0';
}

// ─── HEATMAP ─────────────────────────────────────────────────────────────────
function initHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  if (!grid || grid.childElementCount > 0) return;
  const sessionDates = new Set(progress.sessions.map(s => s.date));
  const now = new Date();
  for (let i = 181; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dot = document.createElement('div');
    dot.className = 'hmap-dot';
    dot.title = dateStr;
    if (sessionDates.has(dateStr)) dot.style.opacity = '1';
    else {
      const r = Math.random();
      dot.style.opacity = r < 0.3 ? '0' : r < 0.55 ? '0.15' : r < 0.78 ? '0.35' : '0.65';
    }
    grid.appendChild(dot);
  }
}

// ─── AI COACH ─────────────────────────────────────────────────────────────────
const aiResponses = [
  () => {
    const p = getProfile(), t = getTotals();
    const gap = p.proteinMin - Math.round(t.protein);
    return gap > 0
      ? `Your protein is ${gap}g short of your ${p.proteinMin}g minimum today. Add a 30g whey shake or 150g chicken to close the gap before your next workout.`
      : `Great protein intake! You're at ${Math.round(t.protein)}g — within your ${p.proteinMin}–${p.proteinMax}g range. Recovery is optimized.`;
  },
  () => {
    const p = getProfile(), t = getTotals();
    const remaining = p.targetCals - Math.round(t.kcal);
    return remaining > 200
      ? `You need ~${remaining} more kcal today for your ${user.goal === 'muscle' ? 'muscle gain' : user.goal === 'fat' ? 'fat loss' : user.goal} goal. Target is ${p.targetCals.toLocaleString()} kcal. Don't skip the post-workout meal!`
      : `You've nailed your calorie target today (${Math.round(t.kcal).toLocaleString()}/${p.targetCals.toLocaleString()} kcal). Prioritize sleep — that's when the muscle actually grows.`;
  },
  () => {
    const sets = Object.values(completedSets).flat().length;
    const totalSets = WORKOUT.exercises.reduce((s, e) => s + e.sets.length, 0);
    if (sets > 0) return `You've completed ${sets}/${totalSets} sets today. Your rep range for ${user.goal} is ${user.goal === 'muscle' ? '6–12 reps' : user.goal === 'strength' ? '1–5 reps' : '10–20 reps'}. Keep the RPE between 7–9 on every working set.`;
    return `Based on your ${user.goal} goal at ${user.weight}kg, your ideal rep range is ${user.goal === 'muscle' ? '6–12 reps' : user.goal === 'strength' ? '1–5 reps' : '10–20 reps'}. Add weight when you can complete all reps with good form.`;
  },
  () => {
    const ws = progress.weights;
    if (ws.length >= 2) {
      const change = +(ws[0].weight - ws[ws.length - 1].weight).toFixed(1);
      const dir = change > 0 ? `+${change}kg` : `${change}kg`;
      const ideal = user.goal === 'muscle' ? 'Aim for 0.25–0.5kg/week gain' : user.goal === 'fat' ? 'Aim for 0.5–1kg/week loss max' : 'Stay consistent around your maintenance';
      return `Your weight trend: ${dir} over ${ws.length} weigh-ins. ${ideal}. Consistency over weeks beats perfection on any single day.`;
    }
    return `Start logging your weight daily on the Progress tab. Consistent morning weigh-ins (after bathroom, before eating) give the most accurate trend data.`;
  },
  () => {
    const p = getProfile();
    return `Your personalized targets: ${p.targetCals.toLocaleString()} kcal/day · ${p.proteinMin}–${p.proteinMax}g protein · ${p.carbMin}–${p.carbMax}g carbs · ${p.fatMin}–${p.fatMax}g fat · ${(p.waterGoal/1000).toFixed(1)}L water. These update as your weight changes.`;
  },
  () => `Progressive overload rule: If you complete all reps with perfect form at your logged weight, add 2.5kg next session for compounds (bench, squat, deadlift) or 1.25kg for isolation. Never sacrifice form for weight.`,
  () => `Sleep is your most powerful performance enhancer. 7–9 hours = 40% more testosterone, faster muscle repair, better insulin sensitivity. Magnesium (400mg) before bed significantly improves sleep quality and reduces cramps.`,
  () => `Creatine monohydrate (5g/day) is the most researched and proven supplement. Increases ATP recycling by ~14%, strength by ~5–15%, lean mass over time. Take it daily — timing doesn't matter much.`,
];

let aiIdx = 0;

function sendChatMessage() {
  const input = document.getElementById('chat-input-field');
  const chatWindow = document.querySelector('.chat-window');
  const message = input?.value?.trim();
  if (!message) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user-bubble';
  userBubble.innerHTML = `<p>${escapeHtml(message)}</p>`;
  chatWindow.appendChild(userBubble);
  input.value = '';
  chatWindow.scrollTop = chatWindow.scrollHeight;

  const typing = document.createElement('div');
  typing.className = 'chat-bubble ai-bubble';
  typing.innerHTML = '<p style="letter-spacing:4px;opacity:0.5">···</p>';
  chatWindow.appendChild(typing);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  setTimeout(() => {
    chatWindow.removeChild(typing);
    const response = aiResponses[aiIdx % aiResponses.length]();
    aiIdx++;
    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble ai-bubble';
    aiBubble.innerHTML = `<p>${response}</p>`;
    chatWindow.appendChild(aiBubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }, 900 + Math.random() * 400);
}

function escapeHtml(s) { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

// ─── LEARN SCREEN ─────────────────────────────────────────────────────────────
function initLearnScreen() {
  const firstCard = document.querySelector('#lpanel-macro .nutrient-card:first-child');
  if (firstCard && !firstCard.classList.contains('expanded')) toggleNutrient(firstCard.id);
}

function switchLearnTab(tab, btn) {
  document.querySelectorAll('.learn-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('lpanel-macro').classList.toggle('collapsed', tab !== 'macro');
  document.getElementById('lpanel-micro').classList.toggle('collapsed', tab !== 'micro');
  if (tab === 'micro') {
    const first = document.querySelector('#lpanel-micro .nutrient-card:first-child');
    if (first && !first.classList.contains('expanded')) toggleNutrient(first.id);
  }
}

function toggleNutrient(cardId) {
  const card = document.getElementById(cardId); if (!card) return;
  const body = card.querySelector('.nutrient-body');
  const wasExpanded = card.classList.contains('expanded');
  card.closest('.learn-panel')?.querySelectorAll('.nutrient-card').forEach(c => {
    c.classList.remove('expanded');
    c.querySelector('.nutrient-body')?.classList.add('collapsed');
  });
  if (!wasExpanded) {
    card.classList.add('expanded');
    body?.classList.remove('collapsed');
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
  }
}

// ─── VIDEO MODAL ─────────────────────────────────────────────────────────────
function openVideo(id, name, videoId, tips) {
  const modal = document.getElementById('video-modal');
  const iframe = document.getElementById('video-iframe');
  const label  = document.getElementById('video-modal-label');
  const loading = document.getElementById('video-loading');
  const tipsEl = document.getElementById('video-modal-tips');
  label.textContent = name;
  tipsEl.innerHTML = tips.map((t, i) => `<div class="video-tip-item"><div class="video-tip-num">${i+1}</div><span>${t}</span></div>`).join('');
  iframe.src = ''; loading.classList.remove('hidden');
  setTimeout(() => {
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
    iframe.onload = () => loading.classList.add('hidden');
    setTimeout(() => loading.classList.add('hidden'), 2500);
  }, 200);
  modal.classList.add('open');
}

function _doCloseVideo() {
  const modal = document.getElementById('video-modal');
  const iframe = document.getElementById('video-iframe');
  modal?.classList.remove('open');
  setTimeout(() => { if (iframe) iframe.src = ''; }, 300);
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
const navMap = {
  'screen-home':      'nav-home',
  'screen-training':  'nav-training',
  'screen-nutrition': 'nav-nutrition',
  'screen-ai':        'nav-ai',
  'screen-learn':     'nav-learn',
  'screen-progress':  'nav-progress',
};

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
  const navId = navMap[screenId];
  if (navId) document.getElementById(navId)?.classList.add('active');

  if (screenId === 'screen-home')      updateHomeScreen();
  if (screenId === 'screen-training')  { renderExerciseList(); updateWorkoutProgress(); }
  if (screenId === 'screen-nutrition') updateNutritionScreen();
  if (screenId === 'screen-progress')  { initHeatmap(); updateProgressScreen(); }
  if (screenId === 'screen-learn')     initLearnScreen();
}

// ─── ANIMATIONS ───────────────────────────────────────────────────────────────
function animateStreakCounters() {
  const nums = document.querySelectorAll('.streak-num');
  const vals = [progress.sessions.length || 14, 78, 3240];
  nums.forEach((el, i) => { el.textContent = '0'; setTimeout(() => animateCounter(el, vals[i], 1000), i * 120); });
}

function animateCounter(el, target, duration) {
  const start = performance.now();
  (function update(now) {
    const p = Math.min((now - start) / duration, 1);
    const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
    el.textContent = target >= 1000 ? v.toLocaleString() : v;
    if (p < 1) requestAnimationFrame(update);
  })(start);
}

function animateProgressBars() {
  document.querySelectorAll('.macro-bar-fill, .macro-bar-low, .range-bar-zone').forEach(bar => {
    const t = bar.style.width; bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = t; }));
  });
}

function initRipples() {
  const targets = document.querySelectorAll('.workout-card,.ai-nudge-card,.nutrition-card,.meal-card,.pr-card,.ai-rec-card,.goal-card,.exercise-card');
  if (!document.getElementById('ripple-style')) {
    const s = document.createElement('style'); s.id = 'ripple-style';
    s.textContent = '@keyframes ripple-anim{to{transform:scale(4);opacity:0}}';
    document.head.appendChild(s);
  }
  targets.forEach(el => el.addEventListener('click', e => {
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const rip = document.createElement('span');
    rip.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;background:rgba(167,139,250,0.12);transform:scale(0);animation:ripple-anim .6s linear;left:${x-50}px;top:${y-50}px;width:100px;height:100px;`;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden'; el.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  }));
}

// ─── KEYBOARD & SWIPE ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('bottom-nav')?.style.display === 'none') return;
  const map = {'1':'screen-home','2':'screen-training','3':'screen-nutrition','4':'screen-ai','5':'screen-learn','6':'screen-progress'};
  if (map[e.key]) switchScreen(map[e.key]);
  if (e.key === 't' || e.key === 'T') toggleTheme();
  if (e.key === 'Escape') { _doCloseVideo(); closeFoodLog(); closeWeightModal(); }
});

(function initSwipe() {
  const screens = ['screen-home','screen-training','screen-nutrition','screen-ai','screen-learn','screen-progress'];
  let idx = 0, startX = 0, startY = 0;
  const router = document.querySelector('.screen-router');
  if (!router) return;
  router.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  router.addEventListener('touchend', e => {
    if (document.getElementById('bottom-nav')?.style.display === 'none') return;
    const dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -50 && idx < screens.length - 1) { idx++; switchScreen(screens[idx]); }
    else if (dx > 50 && idx > 0) { idx--; switchScreen(screens[idx]); }
  }, { passive: true });
  document.querySelectorAll('.nav-btn').forEach((btn, i) => btn.addEventListener('click', () => { idx = i; }));
})();

// ─── LOGIN FUNCTIONS ────────────────────────────────────────────────────────
function loginWithGoogle(btn) {
  const nameInput = document.getElementById('login-name-input');
  const name = nameInput?.value?.trim();
  if (!name) {
    nameInput?.classList.add('shake-err');
    nameInput?.focus();
    setTimeout(() => nameInput?.classList.remove('shake-err'), 500);
    return;
  }
  user.name = name;
  btn.classList.add('loading');
  btn.disabled = true;
  setTimeout(() => {
    btn.classList.remove('loading');
    btn.disabled = false;
    goToOnboarding();
  }, 1000);
}

function loginWithWhatsApp(btn) {
  const nameInput = document.getElementById('login-name-input');
  const name = nameInput?.value?.trim();
  if (!name) {
    nameInput?.classList.add('shake-err');
    nameInput?.focus();
    setTimeout(() => nameInput?.classList.remove('shake-err'), 500);
    return;
  }
  user.name = name;
  btn.classList.add('loading');
  btn.disabled = true;
  setTimeout(() => {
    btn.classList.remove('loading');
    btn.disabled = false;
    goToOnboarding();
  }, 900);
}

function updateGreeting() {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greetEl = document.querySelector('.greeting-name');
  if (greetEl) greetEl.textContent = user.name || 'Athlete';
  const greetLabel = document.querySelector('.greeting-label');
  if (greetLabel) greetLabel.textContent = `Good ${time} 👋`;
}

// ─── BOOT / INIT ─────────────────────────────────────────────────────────────
function bootApp() {
  renderExerciseList();
  updateHomeScreen();
  updateNutritionScreen();
  updateProgressScreen();
  renderWater();
  initRipples();
  updateGreeting();
  if (workoutActive && workoutStartTs) startWorkoutClock();
}

function checkReturningUser() {
  const saved = Store.get('user');
  if (saved?.height && saved?.weight) {
    user = { ...defaultUser, ...saved };
    document.getElementById('screen-login')?.classList.remove('active');
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('screen-home').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-home').classList.add('active');
    bootApp();
    updateGreeting();
    setTimeout(animateStreakCounters, 300);
    setTimeout(animateProgressBars, 500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  initSliders();
  checkReturningUser();

  // Modal backdrops
  document.getElementById('food-log-modal')?.addEventListener('click', e => { if (e.target.id === 'food-log-modal') closeFoodLog(); });
  document.getElementById('weight-log-modal')?.addEventListener('click', e => { if (e.target.id === 'weight-log-modal') closeWeightModal(); });
  document.getElementById('video-modal')?.addEventListener('click', e => { if (e.target.id === 'video-modal') _doCloseVideo(); });
  document.getElementById('workout-complete-modal')?.addEventListener('click', e => { if (e.target.id === 'workout-complete-modal') closeWorkoutComplete(); });

  // Chat
  const chatInput = document.getElementById('chat-input-field');
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

  // Weight input enter key
  const weightInput = document.getElementById('weight-input');
  if (weightInput) weightInput.addEventListener('keydown', e => { if (e.key === 'Enter') logWeight(); });

  // Avatar
  const avatar = document.getElementById('avatar-btn');
  if (avatar) {
    let clicks = 0;
    avatar.addEventListener('click', () => {
      if (++clicks % 3 === 0) { avatar.style.boxShadow = '0 0 0 4px rgba(167,139,250,0.4)'; setTimeout(() => avatar.style.boxShadow = '', 700); }
    });
  }
});
