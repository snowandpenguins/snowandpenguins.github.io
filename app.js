/* Ascend Dashboard v2
   - Offline habit tracker
   - Loads/saves data.json (direct file save if supported; otherwise download)
   - Charts with 1D/1W/1Y/ALL
   - Auto computes:
     * Hours worked this week
     * Creatine streak, Ashwagandha streak, Vitamin D streak
     * Nicotine sober streak (from nicotineUsed)
     * Overall progress score (0–100) as a simple weighted daily compliance average
*/

const METRICS = [
  { key: "phoneHours", label: "Hours on phone", unit: "h", goodDirection: "down" },
  { key: "moneyBank", label: "Money in bank", unit: "$", goodDirection: "up" },

  { key: "gym", label: "Gym today", unit: "", goodDirection: "up", isBoolean: true },
  { key: "gymSessions", label: "Gym sessions (total)", unit: "", goodDirection: "up" },

  { key: "neckWorkout", label: "Neck workout today", unit: "", goodDirection: "up", isBoolean: true },
  { key: "neckWorkoutCount", label: "Neck workouts (total)", unit: "", goodDirection: "up" },

  { key: "daysSinceMast", label: "Days since masturbation", unit: "d", goodDirection: "up", privacyHideable: true },

  { key: "hoursWorkedToday", label: "Hours worked today", unit: "h", goodDirection: "up" },
  { key: "jobCount", label: "Job count", unit: "", goodDirection: "up" },
  { key: "freelanceCompletions", label: "Freelance completions (total)", unit: "", goodDirection: "up" },

  { key: "treadmillMins", label: "Time on treadmill", unit: "min", goodDirection: "up" },
  { key: "hwDone", label: "HW completed", unit: "", goodDirection: "up", isBoolean: true },
  { key: "classAvg", label: "Overall class average", unit: "%", goodDirection: "up" },

  { key: "teeth", label: "Teeth brushed (times)", unit: "x", goodDirection: "up" },
  { key: "retainer", label: "Retainer worn", unit: "", goodDirection: "up", isBoolean: true },
  { key: "contactsRemoved", label: "Contacts removed", unit: "", goodDirection: "up", isBoolean: true },

  { key: "eyebrowsPlucked", label: "Eyebrows plucked this week", unit: "", goodDirection: "up", isBoolean: true },
  { key: "nailsTrimmed", label: "Nails trimmed", unit: "", goodDirection: "up", isBoolean: true },

  { key: "creatineTaken", label: "Creatine taken today", unit: "", goodDirection: "up", isBoolean: true },
  { key: "ashwagandhaTaken", label: "Ashwagandha taken today", unit: "", goodDirection: "up", isBoolean: true },
  { key: "vitDTaken", label: "Vitamin D taken today", unit: "", goodDirection: "up", isBoolean: true },

  { key: "nicotineUsed", label: "Used nicotine today", unit: "", goodDirection: "down", isBoolean: true },

  // Auto metrics (not in form, but chartable)
  { key: "_overallProgress", label: "Overall progress (0–100)", unit: "", goodDirection: "up" },
  { key: "_streakCreatine", label: "Creatine streak (days)", unit: "d", goodDirection: "up" },
  { key: "_streakAshwagandha", label: "Ashwagandha streak (days)", unit: "d", goodDirection: "up" },
  { key: "_streakVitD", label: "Vitamin D streak (days)", unit: "d", goodDirection: "up" },
  { key: "_streakNicotineSober", label: "Nicotine sober (days)", unit: "d", goodDirection: "up" }
];

let db = { meta: { version: 2, created: isoToday() }, entries: [] };
let fileHandle = null;
let currentRange = "1W";
let chart = null;

const el = (id) => document.getElementById(id);

function isoToday(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0,10);
}

function parseNum(v){
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function setStatus(msg, good=false){
  const s = el("logStatus");
  s.textContent = msg;
  s.style.color = good ? "var(--good)" : "var(--muted)";
}

function setFileStatus(msg, good=false){
  const s = el("fileStatus");
  s.textContent = msg;
  s.style.color = good ? "var(--good)" : "var(--muted)";
}

function sortEntries(){
  db.entries.sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function upsertEntry(entry){
  const idx = db.entries.findIndex(e => e.date === entry.date);
  if (idx >= 0) db.entries[idx] = entry;
  else db.entries.push(entry);
  sortEntries();
}

function latestEntry(){
  if (!db.entries.length) return null;
  return db.entries[db.entries.length - 1];
}

function getMetricConfig(key){
  return METRICS.find(m => m.key === key);
}

function getCss(varName){
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function metricColor(key){
  const m = getMetricConfig(key);
  return (m?.goodDirection === "up") ? getCss("--good") : getCss("--bad");
}

function fillMetricDropdown(){
  const sel = el("metric");
  sel.innerHTML = "";
  for (const m of METRICS){
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = m.label;
    sel.appendChild(opt);
  }
  sel.value = "moneyBank";
}

function bindRangeButtons(){
  document.querySelectorAll(".segBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".segBtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      render();
    });
  });
}

function setDefaultDate(){
  el("date").value = isoToday();
}

function applyPrivacyMask(){
  const hide = el("hideMast").checked;
  const input = el("daysSinceMast");
  input.type = hide ? "password" : "number";
  input.placeholder = hide ? "Hidden" : "e.g. 3";
}

function readForm(){
  const date = el("date").value || isoToday();
  const hideMast = el("hideMast").checked;

  return {
    date,
    phoneHours: parseNum(el("phoneHours").value),
    moneyBank: parseNum(el("moneyBank").value),

    gym: parseNum(el("gym").value) ?? 0,
    gymSessions: parseNum(el("gymSessions").value),

    neckWorkout: parseNum(el("neckWorkout").value) ?? 0,
    neckWorkoutCount: parseNum(el("neckWorkoutCount").value),

    daysSinceMast: parseNum(el("daysSinceMast").value),
    _hideDaysSinceMast: hideMast ? 1 : 0,

    hoursWorkedToday: parseNum(el("hoursWorkedToday").value),
    jobCount: parseNum(el("jobCount").value),
    freelanceCompletions: parseNum(el("freelanceCompletions").value),

    treadmillMins: parseNum(el("treadmillMins").value),
    hwDone: parseNum(el("hwDone").value) ?? 0,
    classAvg: parseNum(el("classAvg").value),

    teeth: parseNum(el("teeth").value),
    retainer: parseNum(el("retainer").value) ?? 0,
    contactsRemoved: parseNum(el("contactsRemoved").value) ?? 0,

    eyebrowsPlucked: parseNum(el("eyebrowsPlucked").value) ?? 0,
    nailsTrimmed: parseNum(el("nailsTrimmed").value) ?? 0,

    creatineTaken: parseNum(el("creatineTaken").value) ?? 0,
    ashwagandhaTaken: parseNum(el("ashwagandhaTaken").value) ?? 0,
    vitDTaken: parseNum(el("vitDTaken").value) ?? 0,

    nicotineUsed: parseNum(el("nicotineUsed").value) ?? 0
  };
}

function fillForm(entry){
  if (!entry) return;

  el("date").value = entry.date || isoToday();
  el("phoneHours").value = entry.phoneHours ?? "";
  el("moneyBank").value = entry.moneyBank ?? "";

  el("gym").value = String(entry.gym ?? 0);
  el("gymSessions").value = entry.gymSessions ?? "";

  el("neckWorkout").value = String(entry.neckWorkout ?? 0);
  el("neckWorkoutCount").value = entry.neckWorkoutCount ?? "";

  el("daysSinceMast").value = entry.daysSinceMast ?? "";
  el("hideMast").checked = !!entry._hideDaysSinceMast;

  el("hoursWorkedToday").value = entry.hoursWorkedToday ?? "";
  el("jobCount").value = entry.jobCount ?? "";
  el("freelanceCompletions").value = entry.freelanceCompletions ?? "";

  el("treadmillMins").value = entry.treadmillMins ?? "";
  el("hwDone").value = String(entry.hwDone ?? 0);
  el("classAvg").value = entry.classAvg ?? "";

  el("teeth").value = entry.teeth ?? "";
  el("retainer").value = String(entry.retainer ?? 0);
  el("contactsRemoved").value = String(entry.contactsRemoved ?? 0);

  el("eyebrowsPlucked").value = String(entry.eyebrowsPlucked ?? 0);
  el("nailsTrimmed").value = String(entry.nailsTrimmed ?? 0);

  el("creatineTaken").value = String(entry.creatineTaken ?? 0);
  el("ashwagandhaTaken").value = String(entry.ashwagandhaTaken ?? 0);
  el("vitDTaken").value = String(entry.vitDTaken ?? 0);

  el("nicotineUsed").value = String(entry.nicotineUsed ?? 0);

  applyPrivacyMask();
}

function getRangeEntries(metricKey){
  if (!db.entries.length) return [];

  // ensure derived values exist
  recomputeDerivedForAll();

  const entries = db.entries.filter(e => e[metricKey] !== null && e[metricKey] !== undefined);
  if (!entries.length) return [];

  const endDate = entries[entries.length - 1].date;
  const end = new Date(endDate + "T00:00:00");

  let days = null;
  if (currentRange === "1D") days = 1;
  if (currentRange === "1W") days = 7;
  if (currentRange === "1Y") days = 365;

  if (!days) return entries;

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  return entries.filter(e => {
    const d = new Date(e.date + "T00:00:00");
    return d >= start && d <= end;
  });
}

function formatValue(key, v){
  const m = getMetricConfig(key);
  if (v === null || v === undefined) return "—";

  if (m?.isBoolean){
    return (v ? "Yes" : "No");
  }

  if (m?.unit === "$"){
    return "$" + Math.round(v).toLocaleString();
  }

  if (m?.unit === "%"){
    return (Math.round(v * 10) / 10).toFixed(1) + "%";
  }

  if (Number.isFinite(v)){
    const rounded = Math.round(v * 10) / 10;
    return String(rounded) + (m?.unit ? ` ${m.unit}` : "");
  }

  return String(v);
}

function computeAverage(values){
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a,b)=>a+b,0) / nums.length;
}

function computeDelta(values){
  const nums = values.filter(v => Number.isFinite(v));
  if (nums.length < 2) return null;
  return nums[nums.length - 1] - nums[0];
}

function setDeltaDisplay(metricKey, delta){
  const m = getMetricConfig(metricKey);
  const deltaEl = el("deltaVal");

  if (delta === null || delta === undefined){
    deltaEl.textContent = "—";
    deltaEl.style.color = "var(--text)";
    return;
  }

  const sign = delta >= 0 ? "+" : "";
  const valText = (m?.unit === "$")
    ? `${sign}$${Math.round(delta).toLocaleString()}`
    : `${sign}${Math.round(delta * 10)/10}${m?.unit ? " " + m.unit : ""}`;

  deltaEl.textContent = valText;

  const goodUp = (m?.goodDirection === "up");
  const isPositive = delta >= 0;
  const good = goodUp ? isPositive : !isPositive;
  deltaEl.style.color = good ? "var(--good)" : "var(--bad)";
}

function computeWeekHours(){
  if (!db.entries.length) return null;

  const latest = db.entries[db.entries.length - 1].date;
  const end = new Date(latest + "T00:00:00");

  const day = end.getDay(); // Sun=0
  const diffToMon = (day === 0) ? 6 : (day - 1);
  const mon = new Date(end);
  mon.setDate(mon.getDate() - diffToMon);

  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);

  let sum = 0;
  for (const e of db.entries){
    const d = new Date(e.date + "T00:00:00");
    if (d >= mon && d <= sun && Number.isFinite(e.hoursWorkedToday)){
      sum += e.hoursWorkedToday;
    }
  }
  return Math.round(sum * 10) / 10;
}

/* -------------------------
   Derived values
-------------------------- */

function streakFromBooleanKey(boolKey, entries, goodWhenTrue=true){
  // counts consecutive days from latest where condition is met.
  // goodWhenTrue=true means streak continues when boolKey==1
  // goodWhenTrue=false means streak continues when boolKey==0 (e.g., nicotineUsed=0)
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--){
    const v = entries[i][boolKey];
    const met = goodWhenTrue ? (v === 1) : (v === 0);
    // if no value logged, streak breaks
    if (v === null || v === undefined) break;
    if (!met) break;
    streak++;
  }
  return streak;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function computeProgressScore(entry){
  // Simple “overall progress” score (0–100) based on daily compliance.
  // You can tweak weights later.
  const weights = [
    // Good habits (1 = good)
    { key: "gym", w: 14, type: "bool", goodWhenTrue: true },
    { key: "neckWorkout", w: 6, type: "bool", goodWhenTrue: true },
    { key: "hwDone", w: 8, type: "bool", goodWhenTrue: true },
    { key: "retainer", w: 6, type: "bool", goodWhenTrue: true },
    { key: "contactsRemoved", w: 4, type: "bool", goodWhenTrue: true },
    { key: "eyebrowsPlucked", w: 3, type: "bool", goodWhenTrue: true },
    { key: "nailsTrimmed", w: 3, type: "bool", goodWhenTrue: true },
    { key: "creatineTaken", w: 6, type: "bool", goodWhenTrue: true },
    { key: "ashwagandhaTaken", w: 4, type: "bool", goodWhenTrue: true },
    { key: "vitDTaken", w: 4, type: "bool", goodWhenTrue: true },

    // Avoidance (0 = good)
    { key: "nicotineUsed", w: 14, type: "bool", goodWhenTrue: false },

    // Numeric: phone hours (lower better) and treadmill mins (higher better)
    { key: "phoneHours", w: 12, type: "phone" },
    { key: "treadmillMins", w: 6, type: "treadmill" },

    // Teeth brushed (2 is ideal)
    { key: "teeth", w: 10, type: "teeth" }
  ];

  let got = 0;
  let total = 0;

  for (const it of weights){
    total += it.w;

    const v = entry[it.key];

    if (it.type === "bool"){
      if (v === null || v === undefined) continue;
      const met = it.goodWhenTrue ? (v === 1) : (v === 0);
      got += met ? it.w : 0;
      continue;
    }

    if (it.type === "phone"){
      if (!Number.isFinite(v)) continue;
      // 0–2h => full points, 2–6 scales down, 8+ => 0
      const score = clamp(1 - ((v - 2) / 6), 0, 1);
      got += it.w * score;
      continue;
    }

    if (it.type === "treadmill"){
      if (!Number.isFinite(v)) continue;
      // 0 => 0, 10 => 0.5, 20 => 0.8, 30+ => 1
      const score = clamp(v / 30, 0, 1);
      got += it.w * score;
      continue;
    }

    if (it.type === "teeth"){
      if (!Number.isFinite(v)) continue;
      // 2 brushes = 1.0, 1 = 0.5, 0 = 0, 3+ = 1.0
      const score = (v >= 2) ? 1 : (v === 1 ? 0.5 : 0);
      got += it.w * score;
      continue;
    }
  }

  if (total <= 0) return null;
  return Math.round((got / total) * 100);
}

function recomputeDerivedForAll(){
  // Ensure entries sorted
  sortEntries();

  // Compute streaks (from latest back)
  const sCreatine = streakFromBooleanKey("creatineTaken", db.entries, true);
  const sAsh = streakFromBooleanKey("ashwagandhaTaken", db.entries, true);
  const sVitD = streakFromBooleanKey("vitDTaken", db.entries, true);
  const sNic = streakFromBooleanKey("nicotineUsed", db.entries, false);

  // Add streak values + progress score per entry (chartable)
  // We store same latest streak numbers on every entry for simplicity in charting.
  // If you want “streak history curve”, we can compute per-day rolling streak later.
  for (const e of db.entries){
    e._overallProgress = computeProgressScore(e);
    e._streakCreatine = sCreatine;
    e._streakAshwagandha = sAsh;
    e._streakVitD = sVitD;
    e._streakNicotineSober = sNic;
  }

  // Update top mini cards
  el("streakCreatine").textContent = db.entries.length ? `${sCreatine} d` : "—";
  el("streakNicotine").textContent = db.entries.length ? `${sNic} d` : "—";

  const last = latestEntry();
  el("overallProgress").textContent = last && Number.isFinite(last._overallProgress) ? `${last._overallProgress}/100` : "—";
}

function buildChart(labels, values, color){
  const ctx = el("chart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "",
        data: values,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 3,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const key = el("metric").value;
              return formatValue(key, ctx.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "rgba(232,238,247,.75)" },
          grid: { color: "rgba(255,255,255,.06)" }
        },
        y: {
          ticks: { color: "rgba(232,238,247,.75)" },
          grid: { color: "rgba(255,255,255,.06)" }
        }
      }
    }
  });
}

function render(){
  const metricKey = el("metric").value;

  if (db.entries.length) recomputeDerivedForAll();

  const rangeEntries = getRangeEntries(metricKey);
  const labels = rangeEntries.map(e => e.date);
  const values = rangeEntries.map(e => {
    const v = e[metricKey];
    return Number.isFinite(v) ? v : (v === 0 ? 0 : null);
  });

  const avg = computeAverage(values);
  el("avgVal").textContent = avg === null ? "—" : formatValue(metricKey, avg);

  const delta = computeDelta(values);
  setDeltaDisplay(metricKey, delta);

  const wk = computeWeekHours();
  el("weekHours").textContent = wk === null ? "—" : `${wk} h`;

  buildChart(labels, values, metricColor(metricKey));
}

/* -------------------------
   File ops
-------------------------- */

async function pickFile(){
  if (!("showOpenFilePicker" in window)){
    setFileStatus("Direct save not supported (will use download)", false);
    return;
  }

  try{
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    fileHandle = handle;
    setFileStatus("Connected (direct save enabled)", true);
  }catch(e){
    setFileStatus("Not connected", false);
  }
}

async function loadFromConnectedFile(){
  if (!fileHandle) throw new Error("No file connected");
  const file = await fileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || !Array.isArray(parsed.entries)){
    throw new Error("Invalid JSON structure. Expected { entries: [] }");
  }
  db = parsed;
  sortEntries();
}

async function loadFromDownloadPicker(){
  return new Promise((resolve, reject) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = async () => {
      try{
        const file = inp.files?.[0];
        if (!file) return reject(new Error("No file selected"));
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.entries)){
          throw new Error("Invalid JSON structure. Expected { entries: [] }");
        }
        db = parsed;
        sortEntries();
        resolve();
      }catch(err){ reject(err); }
    };
    inp.click();
  });
}

async function saveDirect(){
  if (!fileHandle) throw new Error("No file connected");
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(db, null, 2));
  await writable.close();
}

function saveDownloadFallback(){
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   Wiring
-------------------------- */

function wire(){
  fillMetricDropdown();
  bindRangeButtons();
  setDefaultDate();

  el("hideMast").addEventListener("change", () => {
    applyPrivacyMask();
  });

  el("metric").addEventListener("change", render);

  el("btnPickFile").addEventListener("click", pickFile);

  el("btnLoad").addEventListener("click", async () => {
    try{
      if (fileHandle) await loadFromConnectedFile();
      else await loadFromDownloadPicker();

      const last = latestEntry();
      if (last) fillForm(last);

      setStatus("Loaded data ✅", true);
      render();
    }catch(err){
      setStatus(`Load failed: ${err.message}`, false);
    }
  });

  el("btnSave").addEventListener("click", async () => {
    try{
      if (fileHandle && ("showOpenFilePicker" in window)){
        await saveDirect();
        setStatus("Saved to data.json ✅", true);
      }else{
        saveDownloadFallback();
        setStatus("Downloaded updated data.json ✅ (replace your file)", true);
      }
    }catch(err){
      setStatus(`Save failed: ${err.message}`, false);
    }
  });

  el("btnFillLatest").addEventListener("click", () => {
    const last = latestEntry();
    if (!last){
      setStatus("No entries yet.", false);
      return;
    }
    const today = el("date").value || isoToday();
    const copy = { ...last, date: today };
    fillForm(copy);
    setStatus("Filled from latest.", true);
  });

  el("btnLog").addEventListener("click", () => {
    const entry = readForm();
    if (!entry.date){
      setStatus("Pick a date.", false);
      return;
    }

    upsertEntry(entry);
    setStatus(`Logged ${entry.date} ✅`, true);
    render();
  });

  // Initial
  applyPrivacyMask();
  render();
}

wire();
