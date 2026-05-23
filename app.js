// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://irzvzevwnozbgpvmptir.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VjRoURDivyyToHVv0iKlZQ_qD8a8eTA';

// ─── INIT ─────────────────────────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let user = null;
let entries = {}; // { 'YYYY-MM-DD': { kg: number, note: string } }
let userPrefs = { unit: 'kg', height: 170, goalKg: 0 };
let charts = {};
let weekOffset = 0, monthOffset = 0, yearOffset = 0;
let saving = false;

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('log-date').value = todayStr();

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    user = session.user;
    await loadData();
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session && !user) {
      user = session.user;
      await loadData();
      showApp();
    }
  });
});

function showAuth() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  applyPrefs();
  renderAll();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', ['login','signup'][i] === tab));
  document.getElementById('auth-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('auth-signup').style.display = tab === 'signup' ? 'block' : 'none';
}

async function signIn() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-signin');
  const err = document.getElementById('login-error');
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) err.textContent = error.message;
}

async function signUp() {
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const btn = document.getElementById('btn-signup');
  const err = document.getElementById('signup-error');
  err.textContent = '';
  if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }
  btn.disabled = true; btn.textContent = 'Creating…';
  const { error } = await sb.auth.signUp({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Create account';
  if (error) err.textContent = error.message;
  else err.style.color = 'var(--accent)', err.textContent = 'Account created! Check your email to confirm, then sign in.';
}

async function signOut() {
  await sb.auth.signOut();
  user = null; entries = {};
  showAuth();
}

// ─── DATA LOAD/SAVE ───────────────────────────────────────────────────────────
async function loadData() {
  setSyncing(true);

  // Load weight entries
  const { data: rows } = await sb.from('weight_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true });

  entries = {};
  if (rows) rows.forEach(r => { entries[r.date] = { kg: parseFloat(r.weight_kg), note: r.note || '', id: r.id }; });

  // Load prefs
  const { data: prefs } = await sb.from('user_prefs')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (prefs) {
    userPrefs = { unit: prefs.unit || 'kg', height: prefs.height_cm || 170, goalKg: prefs.goal_kg || 0 };
  }

  setSyncing(false);
}

async function saveEntry(date, kg, note) {
  setSyncing(true);
  const existing = entries[date];
  if (existing && existing.id) {
    await sb.from('weight_entries').update({ weight_kg: kg, note: note, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    const { data } = await sb.from('weight_entries').insert({ user_id: user.id, date, weight_kg: kg, note }).select().single();
    if (data) entries[date].id = data.id;
  }
  setSyncing(false);
}

async function deleteEntry(date) {
  const existing = entries[date];
  if (existing && existing.id) {
    setSyncing(true);
    await sb.from('weight_entries').delete().eq('id', existing.id);
    setSyncing(false);
  }
  delete entries[date];
}

async function savePrefs() {
  setSyncing(true);
  const { data: existing } = await sb.from('user_prefs').select('id').eq('user_id', user.id).single();
  const payload = { user_id: user.id, unit: userPrefs.unit, height_cm: userPrefs.height, goal_kg: userPrefs.goalKg, updated_at: new Date().toISOString() };
  if (existing) await sb.from('user_prefs').update(payload).eq('user_id', user.id);
  else await sb.from('user_prefs').insert(payload);
  setSyncing(false);
}

function setSyncing(on) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (dot) { dot.className = 'sync-dot' + (on ? ' syncing' : ''); txt.textContent = on ? 'Syncing…' : 'Synced'; }
}

// ─── UNIT / PREFS ─────────────────────────────────────────────────────────────
function applyPrefs() {
  document.getElementById('btn-kg').classList.toggle('active', userPrefs.unit === 'kg');
  document.getElementById('btn-lbs').classList.toggle('active', userPrefs.unit === 'lbs');
  document.getElementById('goal-unit').textContent = userPrefs.unit;
  document.getElementById('height-input').value = userPrefs.height;
  if (userPrefs.goalKg) document.getElementById('goal-input').value = toDisplay(userPrefs.goalKg).toFixed(1);
}

function setUnit(u) {
  userPrefs.unit = u;
  applyPrefs();
  savePrefs();
  renderAll();
}

function toDisplay(kg) { return userPrefs.unit === 'lbs' ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(1); }
function fromDisplay(v) { return userPrefs.unit === 'lbs' ? v / 2.20462 : v; }
function unitStr() { return userPrefs.unit; }

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function avg(arr) { const f = arr.filter(v => v !== null && !isNaN(v)); return f.length ? f.reduce((a,b) => a+b, 0) / f.length : null; }
function sortedDates() { return Object.keys(entries).sort(); }

// ─── LOG ──────────────────────────────────────────────────────────────────────
async function addEntry() {
  const date = document.getElementById('log-date').value;
  const raw = parseFloat(document.getElementById('log-weight').value);
  const note = document.getElementById('log-note').value.trim();
  if (!date || isNaN(raw) || raw <= 0) { alert('Please enter a valid date and weight.'); return; }
  const kg = fromDisplay(raw);
  const btn = document.getElementById('btn-add');
  btn.disabled = true; btn.textContent = 'Saving…';
  entries[date] = { kg, note };
  await saveEntry(date, kg, note);
  btn.disabled = false; btn.textContent = 'Save entry';
  document.getElementById('log-weight').value = '';
  document.getElementById('log-note').value = '';
  renderAll();
}

async function delEntry(date) {
  if (!confirm('Delete this entry?')) return;
  await deleteEntry(date);
  renderAll();
}

function renderEntries() {
  const dates = sortedDates().slice().reverse().slice(0, 20);
  const el = document.getElementById('entries-list');
  if (!dates.length) { el.innerHTML = '<div class="empty-state">No entries yet.<br>Log your first weight above.</div>'; return; }
  el.innerHTML = dates.map(d => {
    const e = entries[d];
    return `<div class="entry-row">
      <div>
        <div class="entry-date">${d}</div>
        ${e.note ? `<div class="entry-note">${e.note}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="entry-weight">${toDisplay(e.kg)} ${unitStr()}</span>
        <button class="entry-del" onclick="delEntry('${d}')" title="Delete">×</button>
      </div>
    </div>`;
  }).join('');
}

// ─── METRICS ──────────────────────────────────────────────────────────────────
function renderMetrics() {
  const dates = sortedDates();
  if (!dates.length) return;

  const latest = entries[dates[dates.length-1]].kg;
  const prev = dates.length > 1 ? entries[dates[dates.length-2]].kg : null;

  const now = new Date();
  const weekDates = [], prevWeekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() - ((now.getDay()+6)%7) + i);
    weekDates.push(fmtDate(d));
    const pd = new Date(d); pd.setDate(d.getDate()-7);
    prevWeekDates.push(fmtDate(pd));
  }

  const monthStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  const prevM = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMStr = `${prevM.getFullYear()}-${pad(prevM.getMonth()+1)}`;

  const weekVals = weekDates.filter(d => entries[d]).map(d => entries[d].kg);
  const prevWeekVals = prevWeekDates.filter(d => entries[d]).map(d => entries[d].kg);
  const monthVals = dates.filter(d => d.startsWith(monthStr)).map(d => entries[d].kg);
  const prevMonthVals = dates.filter(d => d.startsWith(prevMStr)).map(d => entries[d].kg);
  const yearVals = dates.filter(d => d.startsWith(now.getFullYear()+'')).map(d => entries[d].kg);
  const prevYearVals = dates.filter(d => d.startsWith((now.getFullYear()-1)+'')).map(d => entries[d].kg);

  function setM(id, val, dId, delta) {
    document.getElementById(id).textContent = val !== null ? toDisplay(val).toFixed(1) + ' ' + unitStr() : '—';
    if (dId && delta !== null) {
      const icon = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      const cls = delta === 0 ? 'delta-same' : delta > 0 ? 'delta-up' : 'delta-down';
      const sign = delta > 0 ? '+' : '';
      document.getElementById(dId).innerHTML = `<span class="${cls}">${icon} ${sign}${toDisplay(Math.abs(delta)).toFixed(1)} ${unitStr()} vs prev</span>`;
    }
  }

  setM('m-latest', latest, 'm-latest-d', prev !== null ? latest - prev : null);
  setM('m-week', avg(weekVals), 'm-week-d', avg(weekVals) && avg(prevWeekVals) ? avg(weekVals)-avg(prevWeekVals) : null);
  setM('m-month', avg(monthVals), 'm-month-d', avg(monthVals) && avg(prevMonthVals) ? avg(monthVals)-avg(prevMonthVals) : null);
  setM('m-year', avg(yearVals), 'm-year-d', avg(yearVals) && avg(prevYearVals) ? avg(yearVals)-avg(prevYearVals) : null);

  const first = entries[dates[0]].kg;
  const delta = latest - first;
  document.getElementById('m-total').textContent = (delta >= 0 ? '+' : '') + toDisplay(delta).toFixed(1) + ' ' + unitStr();
  document.getElementById('m-total-d').innerHTML = `<span class="${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-same'}">${dates.length} entries total</span>`;

  // Streak
  let streak = 0;
  const td = new Date();
  while (true) { if (entries[fmtDate(td)]) { streak++; td.setDate(td.getDate()-1); } else break; }
  document.getElementById('streak-count').textContent = streak;
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────
const DARK = window.matchMedia('(prefers-color-scheme: dark)').matches;
const GRID_COLOR = DARK ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
const TICK_COLOR = DARK ? '#6b6b66' : '#a0a09a';
const BASE_OPTIONS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { ticks: { color: TICK_COLOR, font: { family: "'DM Mono'" } }, grid: { color: GRID_COLOR } },
    x: { ticks: { color: TICK_COLOR }, grid: { display: false } }
  }
};

function makeChart(id, type, labels, datasets, extra = {}) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas, {
    type, data: { labels, datasets },
    options: { ...BASE_OPTIONS, ...extra }
  });
}

function lineSet(data, color, fill = true) {
  return { data, borderColor: color, backgroundColor: fill ? color + '18' : 'transparent',
    borderWidth: 2, pointRadius: 3.5, pointBackgroundColor: color, tension: 0.3, fill, spanGaps: true };
}
function barSet(data, color) {
  return { data, backgroundColor: data.map(v => v ? color : 'transparent'),
    borderColor: data.map(v => v ? color : 'transparent'), borderWidth: 1, borderRadius: 4, spanGaps: true };
}
function dashLine(val, count, color) {
  return { type: 'line', data: new Array(count).fill(val), borderColor: color,
    borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, spanGaps: true };
}

// ─── WEEKLY ───────────────────────────────────────────────────────────────────
function weekRange(offset) {
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7) + offset*7);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return { mon, sun };
}

function renderWeekly() {
  const { mon, sun } = weekRange(weekOffset);
  document.getElementById('week-label').textContent =
    `${mon.toLocaleDateString('en', {month:'short',day:'numeric'})} – ${sun.toLocaleDateString('en', {month:'short',day:'numeric',year:'numeric'})}`;

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const vals = days.map((_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return entries[fmtDate(d)] ? toDisplay(entries[fmtDate(d)].kg) : null;
  });
  const avgV = avg(vals);
  const ds = [barSet(vals, '#1D9E75')];
  if (avgV) ds.push(dashLine(avgV, 7, '#EF9F27'));
  makeChart('chart-week', 'bar', days, ds);

  // 8-week averages
  const wLabels = [], wAvgs = [];
  for (let w = -7; w <= 0; w++) {
    const { mon: wm } = weekRange(w);
    const vs = [];
    for (let i = 0; i < 7; i++) { const d = new Date(wm); d.setDate(wm.getDate()+i); const e = entries[fmtDate(d)]; if (e) vs.push(toDisplay(e.kg)); }
    wLabels.push(wm.toLocaleDateString('en', {month:'short',day:'numeric'}));
    wAvgs.push(avg(vs));
  }
  makeChart('chart-weeks', 'line', wLabels, [lineSet(wAvgs, '#1D9E75')],
    { scales: { ...BASE_OPTIONS.scales, x: { ticks: { color: TICK_COLOR, maxRotation: 45, autoSkip: false }, grid: { display: false } } } });
}

// ─── MONTHLY ──────────────────────────────────────────────────────────────────
function renderMonthly() {
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  document.getElementById('month-label').textContent = ref.toLocaleDateString('en', {month:'long', year:'numeric'});
  const days = new Date(ref.getFullYear(), ref.getMonth()+1, 0).getDate();
  const labels = [], vals = [];
  for (let d = 1; d <= days; d++) {
    const key = `${ref.getFullYear()}-${pad(ref.getMonth()+1)}-${pad(d)}`;
    labels.push(d); vals.push(entries[key] ? toDisplay(entries[key].kg) : null);
  }
  const avgV = avg(vals);
  const ds = [barSet(vals, '#1D9E75')];
  if (avgV) ds.push(dashLine(avgV, days, '#EF9F27'));
  makeChart('chart-month', 'bar', labels, ds,
    { scales: { ...BASE_OPTIONS.scales, x: { ticks: { color: TICK_COLOR, autoSkip: true, maxTicksLimit: 15 }, grid: { display: false } } } });

  // 12-month averages
  const mLabels = [], mAvgs = [];
  for (let i = -11; i <= 0; i++) {
    const m = new Date(now.getFullYear(), now.getMonth()+i, 1);
    const ms = `${m.getFullYear()}-${pad(m.getMonth()+1)}`;
    const vs = sortedDates().filter(d => d.startsWith(ms)).map(d => toDisplay(entries[d].kg));
    mLabels.push(m.toLocaleDateString('en', {month:'short',year:'2-digit'}));
    mAvgs.push(avg(vs));
  }
  makeChart('chart-months', 'line', mLabels, [lineSet(mAvgs, '#1D9E75')],
    { scales: { ...BASE_OPTIONS.scales, x: { ticks: { color: TICK_COLOR, maxRotation: 45 }, grid: { display: false } } } });
}

// ─── YEARLY ───────────────────────────────────────────────────────────────────
function renderYearly() {
  const now = new Date();
  const refYear = now.getFullYear() + yearOffset;
  document.getElementById('year-label').textContent = refYear;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mAvgs = months.map((_, mi) => {
    const ms = `${refYear}-${pad(mi+1)}`;
    const vs = sortedDates().filter(d => d.startsWith(ms)).map(d => toDisplay(entries[d].kg));
    return avg(vs);
  });
  makeChart('chart-year', 'bar', months, [barSet(mAvgs, '#1D9E75')]);

  const allDates = sortedDates();
  makeChart('chart-all', 'line', allDates, [lineSet(allDates.map(d => toDisplay(entries[d].kg)), '#1D9E75')],
    { scales: { ...BASE_OPTIONS.scales, x: { ticks: { color: TICK_COLOR, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } } } });
}

// ─── BMI ──────────────────────────────────────────────────────────────────────
function updateBMI() {
  userPrefs.height = parseFloat(document.getElementById('height-input').value) || 170;
  const dates = sortedDates();
  if (!dates.length) return;
  const latestKg = entries[dates[dates.length-1]].kg;
  const hm = userPrefs.height / 100;
  const bmi = latestKg / (hm * hm);
  document.getElementById('bmi-val').textContent = bmi.toFixed(1);
  let cat = '', color = '';
  if (bmi < 18.5) { cat = 'Underweight'; color = '#5DCAA5'; }
  else if (bmi < 25) { cat = 'Normal'; color = '#1D9E75'; }
  else if (bmi < 30) { cat = 'Overweight'; color = '#EF9F27'; }
  else { cat = 'Obese'; color = '#D85A30'; }
  document.getElementById('bmi-cat').textContent = cat;
  document.getElementById('bmi-cat').style.color = color;
  const pct = Math.min(100, Math.max(0, ((bmi - 15) / 20) * 100));
  document.getElementById('bmi-marker').style.left = pct + '%';

  // BMI chart
  const last60 = dates.slice(-60);
  const bmiVals = last60.map(d => { const kg = entries[d].kg; return +(kg/(hm*hm)).toFixed(2); });
  const refLines = [
    { val: 18.5, color: '#5DCAA5', label: 'Normal' },
    { val: 25, color: '#EF9F27', label: 'Overweight' },
    { val: 30, color: '#D85A30', label: 'Obese' }
  ];
  const ds = [lineSet(bmiVals, '#3266ad')];
  refLines.forEach(r => ds.push(dashLine(r.val, last60.length, r.color)));
  makeChart('chart-bmi', 'line', last60, ds,
    { scales: { y: { min: 14, ticks: { color: TICK_COLOR, font: { family: "'DM Mono'" } }, grid: { color: GRID_COLOR } }, x: { ticks: { color: TICK_COLOR, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } } } });
}

function updateGoal() {
  const gDisplay = parseFloat(document.getElementById('goal-input').value);
  if (isNaN(gDisplay)) return;
  userPrefs.goalKg = fromDisplay(gDisplay);
  const dates = sortedDates();
  if (!dates.length) return;
  const current = entries[dates[dates.length-1]].kg;
  const first = entries[dates[0]].kg;
  const totalNeeded = first - userPrefs.goalKg;
  const done = first - current;
  const pct = totalNeeded === 0 ? 100 : Math.min(100, Math.max(0, (done / totalNeeded) * 100));
  document.getElementById('goal-bar').style.width = pct.toFixed(1) + '%';
  const remaining = Math.abs(current - userPrefs.goalKg);
  if (remaining < 0.3) document.getElementById('goal-status').textContent = '🎯 Goal reached! Congratulations!';
  else document.getElementById('goal-status').textContent = `${toDisplay(remaining).toFixed(1)} ${unitStr()} to go · ${pct.toFixed(0)}% of the way there`;
}

async function saveGoal() {
  updateGoal();
  await savePrefs();
}

function renderBMI() { updateBMI(); updateGoal(); }

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(name) {
  const names = ['log','weekly','monthly','yearly','bmi'];
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', names[i] === name));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.toggle('active', s.id === 'tab-'+name));
  if (name === 'weekly') renderWeekly();
  else if (name === 'monthly') renderMonthly();
  else if (name === 'yearly') renderYearly();
  else if (name === 'bmi') renderBMI();
}

function navWeek(d) { weekOffset += d; renderWeekly(); }
function navMonth(d) { monthOffset += d; renderMonthly(); }
function navYear(d) { yearOffset += d; renderYearly(); }

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  renderMetrics();
  renderEntries();
  const active = document.querySelector('.tab-section.active');
  if (active) switchTab(active.id.replace('tab-', ''));
}
