// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://irzvzevwnozbgpvmptir.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VjRoURDivyyToHVv0iKlZQ_qD8a8eTA';
const USER_ID = '07465a56-e3b9-42e8-bf7c-abd461cc7240';
const CACHE_KEY = 'wt_cache_v1';

// ─── STATE ────────────────────────────────────────────────────────────────────
let sb;
let entries   = {};
let userPrefs = { unit: 'kg', height: 170, goalKg: 0 };
let charts    = {};
let weekOffset = 0, monthOffset = 0, yearOffset = 0, weeks8Offset = 0;

// ─── LOAD PROGRESS ────────────────────────────────────────────────────────────
function setProgress(pct, msg) {
  const bar = document.getElementById('load-bar');
  const txt = document.getElementById('load-status');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = msg;
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => { el.style.display = 'none'; }, 420);
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (dot) { dot.className = 'sync-dot error'; txt.textContent = 'Error'; }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setProgress(10, 'Starting up…');

  // Set date fields to today immediately
  const t = new Date();
  document.getElementById('log-day').value   = t.getDate();
  document.getElementById('log-month').value = t.getMonth() + 1;
  document.getElementById('log-year').value  = t.getFullYear();

  // Step 1: Load from localStorage cache instantly (makes app feel instant)
  const cached = loadCache();
  if (cached) {
    entries   = cached.entries   || {};
    userPrefs = cached.userPrefs || userPrefs;
    setProgress(40, 'Loaded from cache…');
    // Show app immediately with cached data
    applyPrefs();
    renderAll();
    showAppEl();
    hideLoading();
    setProgress(60, 'Syncing with server…');
    // Then sync fresh data in background
    await syncFromServer(true);
  } else {
    // No cache — fetch from server with progress
    setProgress(30, 'Loading your data…');
    await syncFromServer(false);
    setProgress(95, 'Almost ready…');
    applyPrefs();
    renderAll();
    showAppEl();
    hideLoading();
  }

  // Auto-align ALL charts to most recent entry
  autoAlignOffsets();

  setProgress(100, 'Ready');
});

function showAppEl() {
  document.getElementById('app').style.display = 'block';
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ entries, userPrefs, ts: Date.now() }));
  } catch {}
}

// ─── SERVER SYNC ──────────────────────────────────────────────────────────────
async function syncFromServer(background) {
  try {
    // Init Supabase lazily (scripts are deferred)
    if (!sb) {
      if (!window.supabase) { showError('Could not load Supabase. Check your connection.'); return; }
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Fetch entries + prefs in parallel for speed
    const [entRes, prefRes] = await Promise.all([
      sb.from('weight_entries').select('id,date,weight_kg,note').eq('user_id', USER_ID).order('date'),
      sb.from('user_prefs').select('unit,height_cm,goal_kg').eq('user_id', USER_ID).maybeSingle()
    ]);

    if (entRes.error) throw entRes.error;

    entries = {};
    if (entRes.data) entRes.data.forEach(r => {
      entries[r.date] = { kg: parseFloat(r.weight_kg), note: r.note || '', id: r.id };
    });

    if (prefRes.data) {
      userPrefs = {
        unit:   prefRes.data.unit       || 'kg',
        height: prefRes.data.height_cm  || 170,
        goalKg: prefRes.data.goal_kg    || 0
      };
    }

    saveCache();

    if (background) {
      // Quietly refresh UI with fresh data
      autoAlignOffsets();
      applyPrefs();
      renderAll();
      setSyncing(false);
    }
  } catch (err) {
    console.error('Sync error:', err);
    if (!background) {
      showError('Could not connect to database. Check Supabase CORS settings and that RLS is disabled. (' + (err.message || err) + ')');
    } else {
      setSyncing(false);
      const dot = document.getElementById('sync-dot');
      const txt = document.getElementById('sync-text');
      if (dot) { dot.className = 'sync-dot error'; txt.textContent = 'Sync failed'; }
    }
  }
}

// ─── DATA SAVE / DELETE ───────────────────────────────────────────────────────
async function ensureSb() {
  if (!sb) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

async function saveEntry(date, kg, note) {
  setSyncing(true);
  await ensureSb();
  const existing = entries[date];
  try {
    if (existing && existing.id) {
      await sb.from('weight_entries')
        .update({ weight_kg: kg, note, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      const { data } = await sb.from('weight_entries')
        .insert({ user_id: USER_ID, date, weight_kg: kg, note })
        .select('id').single();
      if (data) entries[date].id = data.id;
    }
    saveCache();
  } catch (err) { showError('Save failed: ' + (err.message || err)); }
  setSyncing(false);
}

async function deleteEntry(date) {
  const existing = entries[date];
  if (existing && existing.id) {
    setSyncing(true);
    await ensureSb();
    try {
      await sb.from('weight_entries').delete().eq('id', existing.id);
      saveCache();
    } catch (err) { showError('Delete failed: ' + (err.message || err)); }
    setSyncing(false);
  }
  delete entries[date];
}

async function savePrefs() {
  setSyncing(true);
  await ensureSb();
  const payload = {
    user_id: USER_ID, unit: userPrefs.unit,
    height_cm: userPrefs.height, goal_kg: userPrefs.goalKg,
    updated_at: new Date().toISOString()
  };
  try {
    const { data: ex } = await sb.from('user_prefs').select('id').eq('user_id', USER_ID).maybeSingle();
    if (ex) await sb.from('user_prefs').update(payload).eq('user_id', USER_ID);
    else     await sb.from('user_prefs').insert(payload);
    saveCache();
  } catch (err) { showError('Prefs save failed: ' + (err.message || err)); }
  setSyncing(false);
}

function setSyncing(on) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (!dot) return;
  dot.className = 'sync-dot' + (on ? ' syncing' : '');
  txt.textContent = on ? 'Syncing…' : 'Synced';
}

// ─── PREFS ────────────────────────────────────────────────────────────────────
function applyPrefs() {
  document.getElementById('btn-kg').classList.toggle('active', userPrefs.unit === 'kg');
  document.getElementById('btn-lbs').classList.toggle('active', userPrefs.unit === 'lbs');
  document.getElementById('goal-unit').textContent = userPrefs.unit;
  document.getElementById('height-input').value    = userPrefs.height;
  if (userPrefs.goalKg) document.getElementById('goal-input').value = toDisplay(userPrefs.goalKg).toFixed(1);
}

function setUnit(u) { userPrefs.unit = u; applyPrefs(); savePrefs(); renderAll(); }

function toDisplay(kg) { return userPrefs.unit === 'lbs' ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(1); }
function fromDisplay(v) { return userPrefs.unit === 'lbs' ? v / 2.20462 : v; }
function unitStr()      { return userPrefs.unit; }

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function avg(arr) {
  const f = arr.filter(v => v !== null && !isNaN(v));
  return f.length ? f.reduce((a,b) => a+b, 0) / f.length : null;
}
function sortedDates() { return Object.keys(entries).sort(); }

// ─── LOG ──────────────────────────────────────────────────────────────────────
async function addEntry() {
  const day   = parseInt(document.getElementById('log-day').value);
  const month = parseInt(document.getElementById('log-month').value);
  const year  = parseInt(document.getElementById('log-year').value);
  const raw   = parseFloat(document.getElementById('log-weight').value);
  const note  = document.getElementById('log-note').value.trim();
  if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) {
    alert('Please enter a valid day, month and year.'); return;
  }
  if (isNaN(raw) || raw <= 0) { alert('Please enter a valid weight.'); return; }
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const kg   = fromDisplay(raw);
  const btn  = document.getElementById('btn-add');
  btn.disabled = true; btn.textContent = 'Saving…';
  entries[date] = { kg, note, id: entries[date]?.id };
  renderAll(); // optimistic update
  await saveEntry(date, kg, note);
  btn.disabled = false; btn.textContent = 'Save entry';
  document.getElementById('log-weight').value = '';
  document.getElementById('log-note').value   = '';
  const td = new Date();
  document.getElementById('log-day').value   = td.getDate();
  document.getElementById('log-month').value = td.getMonth() + 1;
  document.getElementById('log-year').value  = td.getFullYear();
}

async function delEntry(date) {
  if (!confirm('Delete this entry?')) return;
  await deleteEntry(date);
  renderAll();
}

function renderEntries() {
  const dates = sortedDates().slice().reverse().slice(0, 20);
  const el = document.getElementById('entries-list');
  if (!dates.length) {
    el.innerHTML = '<div class="empty-state">No entries yet.<br>Log your first weight above.</div>';
    return;
  }
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

// ─── AUTO ALIGN ──────────────────────────────────────────────────────────────
function autoAlignOffsets() {
  const dates = sortedDates();
  if (!dates.length) return;

  const latestDate = new Date(dates[dates.length - 1]);
  const now        = new Date();

  // How many weeks back is the latest entry from today?
  const diffMs   = now - latestDate;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = (now.getFullYear() - latestDate.getFullYear()) * 12
                   + (now.getMonth() - latestDate.getMonth());
  const diffYears  = now.getFullYear() - latestDate.getFullYear();

  // Set each offset so the chart opens on the latest data
  weekOffset   = -diffWeeks;       // top week chart
  weeks8Offset = -diffWeeks;       // 8-week chart
  monthOffset  = -diffMonths;      // monthly chart
  yearOffset   = -diffYears;       // yearly chart
}

// ─── METRICS ──────────────────────────────────────────────────────────────────
function renderMetrics() {
  const dates = sortedDates();
  if (!dates.length) {
    ['m-latest','m-week','m-month','m-year','m-total'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    ['m-latest-d','m-week-d','m-month-d','m-year-d','m-total-d'].forEach(id => {
      document.getElementById(id).innerHTML = '<span class="delta-same">no data yet</span>';
    });
    return;
  }
  const latest = entries[dates[dates.length-1]].kg;
  const prev   = dates.length > 1 ? entries[dates[dates.length-2]].kg : null;

  // Use the most recent entry's date as reference — not today
  // This way week/month/year avg always reflects actual data, not current calendar
  const lastDate = new Date(dates[dates.length-1]);

  // ── WEEK: Mon–Sun of the week containing the most recent entry ──
  const lastDayOfWeek = lastDate.getDay(); // 0=Sun
  const monOfLastWeek = new Date(lastDate);
  monOfLastWeek.setDate(lastDate.getDate() - ((lastDayOfWeek + 6) % 7));

  const weekDates = [], prevWeekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monOfLastWeek); d.setDate(monOfLastWeek.getDate() + i);
    weekDates.push(fmtDate(d));
    const pd = new Date(d); pd.setDate(d.getDate() - 7);
    prevWeekDates.push(fmtDate(pd));
  }

  // ── MONTH: month of the most recent entry ──
  const mStr  = `${lastDate.getFullYear()}-${pad(lastDate.getMonth()+1)}`;
  const pM    = new Date(lastDate.getFullYear(), lastDate.getMonth()-1, 1);
  const pMStr = `${pM.getFullYear()}-${pad(pM.getMonth()+1)}`;

  // ── YEAR: year of the most recent entry ──
  const refYear  = lastDate.getFullYear();
  const prevYear = refYear - 1;

  const wv  = weekDates.filter(d => entries[d]).map(d => entries[d].kg);
  const pwv = prevWeekDates.filter(d => entries[d]).map(d => entries[d].kg);
  const mv  = dates.filter(d => d.startsWith(mStr)).map(d => entries[d].kg);
  const pmv = dates.filter(d => d.startsWith(pMStr)).map(d => entries[d].kg);
  const yv  = dates.filter(d => d.startsWith(refYear+'')).map(d => entries[d].kg);
  const pyv = dates.filter(d => d.startsWith(prevYear+'')).map(d => entries[d].kg);

  function setM(id, val, dId, delta, noDataMsg) {
    document.getElementById(id).textContent = val !== null ? toDisplay(val).toFixed(1) + ' ' + unitStr() : '—';
    if (dId) {
      if (val === null) {
        document.getElementById(dId).innerHTML = '<span style="color:#cbd5e1;font-weight:500;">' + (noDataMsg || 'no data') + '</span>';
      } else if (delta !== null) {
        const icon = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
        const cls  = delta === 0 ? 'delta-same' : delta > 0 ? 'delta-up' : 'delta-down';
        document.getElementById(dId).innerHTML =
          `<span class="${cls}">${icon} ${(delta > 0 ? '+' : '')}${toDisplay(Math.abs(delta)).toFixed(1)} ${unitStr()} vs prev</span>`;
      } else {
        document.getElementById(dId).innerHTML = '<span class="delta-same">no prev data</span>';
      }
    }
  }

  setM('m-latest', latest, 'm-latest-d', prev !== null ? latest - prev : null);
  setM('m-week',  avg(wv),  'm-week-d',  avg(wv) != null && avg(pwv) != null ? avg(wv)-avg(pwv) : null);
  setM('m-month', avg(mv),  'm-month-d', avg(mv) != null && avg(pmv) != null ? avg(mv)-avg(pmv) : null);
  setM('m-year',  avg(yv),  'm-year-d',  avg(yv) != null && avg(pyv) != null ? avg(yv)-avg(pyv) : null);

  const delta = latest - entries[dates[0]].kg;
  document.getElementById('m-total').textContent = (delta >= 0 ? '+' : '') + toDisplay(delta).toFixed(1) + ' ' + unitStr();
  document.getElementById('m-total-d').innerHTML =
    `<span class="${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-same'}">${dates.length} entries</span>`;

}

// ─── CHARTS ───────────────────────────────────────────────────────────────────
const DARK       = window.matchMedia('(prefers-color-scheme: dark)').matches;
const GRID_COLOR = DARK ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
const TICK_COLOR = DARK ? '#6b6b66' : '#a0a09a';
const BASE_OPT   = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 400 },
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
  charts[id] = new Chart(canvas, { type, data: { labels, datasets }, options: { ...BASE_OPT, ...extra } });
}
function lineSet(data, color, fill = true) {
  return { data, borderColor: color, backgroundColor: fill ? color+'18':'transparent',
    borderWidth: 2, pointRadius: 3.5, pointBackgroundColor: color, tension: 0.3, fill, spanGaps: true };
}
function barSet(data, color) {
  return { data, backgroundColor: data.map(v => v ? color : 'transparent'),
    borderColor: data.map(v => v ? color : 'transparent'), borderWidth: 1, borderRadius: 4, spanGaps: true };
}
function dashLine(val, count, color) {
  return { type:'line', data: new Array(count).fill(val), borderColor: color,
    borderWidth: 1.5, borderDash: [5,5], pointRadius: 0 };
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
    `${mon.toLocaleDateString('en',{month:'short',day:'numeric'})} – ${sun.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})}`;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const vals = days.map((_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return entries[fmtDate(d)] ? toDisplay(entries[fmtDate(d)].kg) : null; });
  const avgV = avg(vals);
  const ds = [lineSet(vals,'#1D9E75')];
  if (avgV) ds.push(dashLine(avgV, 7, '#EF9F27'));
  makeChart('chart-week','line', days, ds, {
    scales:{...BASE_OPT.scales,
      x:{ticks:{color:TICK_COLOR},grid:{display:false}},
      y:{ticks:{color:TICK_COLOR,font:{family:"'DM Mono'"}},grid:{color:GRID_COLOR}}
    }
  });

  // Weekly averages trend — each bar = one week's average, navigable
  const WEEKS_SHOW = 8;
  const endW   = weeks8Offset;
  const startW = endW - (WEEKS_SHOW - 1);
  const wl = [], wa = [];
  for (let w = startW; w <= endW; w++) {
    const { mon: wm } = weekRange(w);
    const vs = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(wm); d.setDate(wm.getDate() + i);
      const e = entries[fmtDate(d)]; if (e) vs.push(toDisplay(e.kg));
    }
    // Label: "Feb 23" style
    wl.push(wm.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
    wa.push(avg(vs));
  }

  // Overall average across all shown weeks (only non-null)
  const overallAvg = avg(wa.filter(v => v !== null));

  // Nav label: date range
  const w8start = weekRange(startW).mon;
  const w8end   = weekRange(endW).sun;
  const w8lbl   = document.getElementById('weeks8-label');
  if (w8lbl) w8lbl.textContent =
    w8start.toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ' – ' +
    w8end.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

  const ds8 = [lineSet(wa, '#1D9E75')];
  if (overallAvg) ds8.push(dashLine(overallAvg, WEEKS_SHOW, '#EF9F27'));

  makeChart('chart-weeks', 'line', wl, ds8, {
    scales: {
      ...BASE_OPT.scales,
      x: { ticks: { color: TICK_COLOR, maxRotation: 45, autoSkip: false }, grid: { display: false } },
      y: { ticks: { color: TICK_COLOR, font: { family: "'DM Mono'" } }, grid: { color: GRID_COLOR } }
    }
  });
}

// ─── MONTHLY ──────────────────────────────────────────────────────────────────
function renderMonthly() {
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth()+monthOffset, 1);
  document.getElementById('month-label').textContent = ref.toLocaleDateString('en',{month:'long',year:'numeric'});
  const days = new Date(ref.getFullYear(), ref.getMonth()+1, 0).getDate();
  const labels=[], vals=[];
  for (let d=1;d<=days;d++){
    const key=`${ref.getFullYear()}-${pad(ref.getMonth()+1)}-${pad(d)}`;
    labels.push(d); vals.push(entries[key]?toDisplay(entries[key].kg):null);
  }
  const avgV=avg(vals);
  const ds=[lineSet(vals,'#1D9E75')];
  if(avgV) ds.push(dashLine(avgV,days,'#EF9F27'));
  makeChart('chart-month','line',labels,ds,
    {scales:{...BASE_OPT.scales,x:{ticks:{color:TICK_COLOR,autoSkip:true,maxTicksLimit:10},grid:{display:false}}}});

  const ml=[],ma=[];
  for(let i=-11;i<=0;i++){
    const m=new Date(now.getFullYear(),now.getMonth()+i,1);
    const ms=`${m.getFullYear()}-${pad(m.getMonth()+1)}`;
    const vs=sortedDates().filter(d=>d.startsWith(ms)).map(d=>toDisplay(entries[d].kg));
    ml.push(m.toLocaleDateString('en',{month:'short',year:'2-digit'}));
    ma.push(avg(vs));
  }
  makeChart('chart-months','line',ml,[lineSet(ma,'#1D9E75')],
    {scales:{...BASE_OPT.scales,x:{ticks:{color:TICK_COLOR,maxRotation:45},grid:{display:false}}}});
}

// ─── YEARLY ───────────────────────────────────────────────────────────────────
function renderYearly() {
  const now=new Date(); const refYear=now.getFullYear()+yearOffset;
  document.getElementById('year-label').textContent = refYear;
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mAvgs=months.map((_,mi)=>{
    const ms=`${refYear}-${pad(mi+1)}`;
    const vs=sortedDates().filter(d=>d.startsWith(ms)).map(d=>toDisplay(entries[d].kg));
    return avg(vs);
  });
  makeChart('chart-year','line',months,[lineSet(mAvgs,'#1D9E75')]);

  // All-time: show monthly averages for cleaner trend (not every single day)
  const allDates=sortedDates();
  // Get all months that have data
  const monthSet = [...new Set(allDates.map(d => d.slice(0,7)))].sort();
  const atLabels = monthSet.map(ms => {
    const [y,m] = ms.split('-');
    return new Date(y, m-1, 1).toLocaleDateString('en',{month:'short',year:'2-digit'});
  });
  const atVals = monthSet.map(ms => {
    const vs = allDates.filter(d=>d.startsWith(ms)).map(d=>toDisplay(entries[d].kg));
    return avg(vs);
  });
  makeChart('chart-all','line',atLabels,[lineSet(atVals,'#1D9E75')],
    {scales:{...BASE_OPT.scales,
      x:{ticks:{color:TICK_COLOR,maxRotation:45,autoSkip:true,maxTicksLimit:12},grid:{display:false}},
      y:{ticks:{color:TICK_COLOR,font:{family:"'DM Mono'"}},grid:{color:GRID_COLOR}}
    }});
}

// ─── BMI ──────────────────────────────────────────────────────────────────────
function updateBMI() {
  userPrefs.height = parseFloat(document.getElementById('height-input').value)||170;
  const dates=sortedDates(); if(!dates.length)return;
  const hm=userPrefs.height/100;
  const bmi=entries[dates[dates.length-1]].kg/(hm*hm);
  document.getElementById('bmi-val').textContent = bmi.toFixed(1);
  let cat='',color='';
  if(bmi<18.5){cat='Underweight';color='#5DCAA5';}
  else if(bmi<25){cat='Normal';color='#1D9E75';}
  else if(bmi<30){cat='Overweight';color='#EF9F27';}
  else{cat='Obese';color='#D85A30';}
  document.getElementById('bmi-cat').textContent=cat;
  document.getElementById('bmi-cat').style.color=color;
  document.getElementById('bmi-marker').style.left=Math.min(100,Math.max(0,((bmi-15)/20)*100))+'%';

  // BMI history — monthly averages for cleaner view
  const bmiMonths = [...new Set(dates.map(d=>d.slice(0,7)))].sort();
  const bmiLabels = bmiMonths.map(ms => {
    const [y,m] = ms.split('-');
    return new Date(y,m-1,1).toLocaleDateString('en',{month:'short',year:'2-digit'});
  });
  const bmiVals = bmiMonths.map(ms => {
    const vs = dates.filter(d=>d.startsWith(ms)).map(d=>+(entries[d].kg/(hm*hm)).toFixed(2));
    return avg(vs);
  });
  const ds=[lineSet(bmiVals,'#3266ad')];
  [{val:18.5,color:'#5DCAA5'},{val:25,color:'#EF9F27'},{val:30,color:'#D85A30'}]
    .forEach(r=>ds.push(dashLine(r.val,bmiMonths.length,r.color)));
  makeChart('chart-bmi','line',bmiLabels,ds,
    {scales:{y:{min:14,ticks:{color:TICK_COLOR,font:{family:"'DM Mono'"}},grid:{color:GRID_COLOR}},
             x:{ticks:{color:TICK_COLOR,maxRotation:45,autoSkip:true,maxTicksLimit:12},grid:{display:false}}}});
}

function updateGoal() {
  const gDisplay=parseFloat(document.getElementById('goal-input').value);
  if(isNaN(gDisplay))return;
  userPrefs.goalKg=fromDisplay(gDisplay);
  const dates=sortedDates(); if(!dates.length)return;
  const current=entries[dates[dates.length-1]].kg;
  const first=entries[dates[0]].kg;
  const total=first-userPrefs.goalKg;
  const done=first-current;
  const pct=total===0?100:Math.min(100,Math.max(0,(done/total)*100));
  document.getElementById('goal-bar').style.width=pct.toFixed(1)+'%';
  const rem=Math.abs(current-userPrefs.goalKg);
  document.getElementById('goal-status').textContent = rem<0.3
    ? '🎯 Goal reached! Congratulations!'
    : `${toDisplay(rem).toFixed(1)} ${unitStr()} to go · ${pct.toFixed(0)}% of the way there`;
}
async function saveGoal() { updateGoal(); await savePrefs(); }
function renderBMI() { updateBMI(); updateGoal(); }

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(name) {
  const names=['log','weekly','monthly','yearly','bmi'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',names[i]===name));
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.toggle('active',s.id==='tab-'+name));
  if(name==='weekly')renderWeekly();
  else if(name==='monthly')renderMonthly();
  else if(name==='yearly')renderYearly();
  else if(name==='bmi')renderBMI();
}
function navWeek(d)  { weekOffset+=d;  renderWeekly(); }
function navWeeks8(d){ weeks8Offset+=d; renderWeekly(); }
function navMonth(d) { monthOffset+=d; renderMonthly(); }
function navYear(d)  { yearOffset+=d;  renderYearly(); }

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  renderMetrics();
  renderEntries();
  const active=document.querySelector('.tab-section.active');
  if(active) switchTab(active.id.replace('tab-',''));
}
