/* Ascend Dashboard
   - Works offline
   - Loads/saves data.json (direct save if browser supports it; otherwise download fallback)
   - Charts any metric with 1D/1W/1Y/ALL
*/

const METRICS = [
  { key: "phoneHours", label: "Hours on phone", unit: "h", goodDirection: "down" },
  { key: "moneyBank", label: "Money in bank", unit: "$", goodDirection: "up" },
  { key: "gym", label: "Gym today", unit: "", goodDirection: "up", isBoolean: true },
  { key: "gymSessions", label: "Gym sessions (total)", unit: "", goodDirection: "up" },
  { key: "daysSinceMast", label: "Days since masturbation", unit: "d", goodDirection: "up", privacyHideable: true },
  { key: "hoursWorkedToday", label: "Hours worked today", unit: "h", goodDirection: "up" },
  { key: "jobCount", label: "Job count", unit: "", goodDirection: "up" },
  { key: "freelanceCompletions", label: "Freelance completions (total)", unit: "", goodDirection: "up" },
  { key: "treadmillMins", label: "Time on treadmill", unit: "min", goodDirection: "up" },
  { key: "hwDone", label: "HW completed", unit: "", goodDirection: "up", isBoolean: true },
  { key: "classAvg", label: "Overall class average", unit: "%", goodDirection: "up" },
  { key: "teeth", label: "Teeth brushed (times)", unit: "x", goodDirection: "up" },
  { key: "retainer", label: "Retainer worn", unit: "", goodDirection: "up", isBoolean: true },
  { key: "contactsRemoved", label: "Contacts removed", unit: "", goodDirection: "up", isBoolean: true }
];

let db = { meta: { version: 1, created: isoToday() }, entries: [] };
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

function metricColor(key){
  // Chart color: green if "up is good", red if "down is good"
  const m = getMetricConfig(key);
  return (m?.goodDirection === "up") ? getCss("--good") : getCss("--bad");
}

function getCss(varName){
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
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

function readForm(){
  const date = el("date").value || isoToday();
  const hideMast = el("hideMast").checked;

  const entry = {
    date,
    phoneHours: parseNum(el("phoneHours").value),
    moneyBank: parseNum(el("moneyBank").value),
    gym: parseNum(el("gym").value) ?? 0,
    gymSessions: parseNum(el("gymSessions").value),
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
    contactsRemoved: parseNum(el("contactsRemoved").value) ?? 0
  };

  return entry;
}

function fillForm(entry){
  if (!entry) return;

  el("date").value = entry.date || isoToday();
  el("phoneHours").value = entry.phoneHours ?? "";
  el("moneyBank").value = entry.moneyBank ?? "";
  el("gym").value = String(entry.gym ?? 0);
  el("gymSessions").value = entry.gymSessions ?? "";
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

  applyPrivacyMask();
}

function applyPrivacyMask(){
  const hide = el("hideMast").checked;
  const input = el("daysSinceMast");
  input.type = hide ? "password" : "number";
  input.placeholder = hide ? "Hidden" : "e.g. 3";
}

function getRangeDates(){
  // returns array of entries filtered to the selected range ending at the latest entry date
  if (!db.entries.length) return [];

  const metricKey = el("metric").value;
  const entries = db.entries
    .filter(e => e[metricKey] !== null && e[metricKey] !== undefined);

  if (!entries.length) return [];

  const endDate = entries[entries.length - 1].date;
  const end = new Date(endDate + "T00:00:00");

  let days = null;
  if (currentRange === "1D") days = 1;
  if (currentRange === "1W") days = 7;
  if (currentRange === "1Y") days = 365;

  if (!days) return entries; // ALL

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

  // Color rule:
  // - If "up is good": + is green, - is red
  // - If "down is good": + is red, - is green
  const goodUp = (m?.goodDirection === "up");
  const isPositive = delta >= 0;

  const good = goodUp ? isPositive : !isPositive;
  deltaEl.style.color = good ? "var(--good)" : "var(--bad)";
}

function computeWeekHours(){
  // Mon -> Sun week for the latest date in db
  if (!db.entries.length) return null;

  const latest = db.entries[db.entries.length - 1].date;
  const end = new Date(latest + "T00:00:00");

  // find Monday of that week
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
  const rangeEntries = getRangeDates();

  const labels = rangeEntries.map(e => e.date);
  const values = rangeEntries.map(e => {
    const v = e[metricKey];
    return Number.isFinite(v) ? v : null;
  });

  const avg = computeAverage(values);
  el("avgVal").textContent = avg === null ? "—" : formatValue(metricKey, avg);

  const delta = computeDelta(values);
  setDeltaDisplay(metricKey, delta);

  const wk = computeWeekHours();
  el("weekHours").textContent = wk === null ? "—" : `${wk} h`;

  buildChart(labels, values, metricColor(metricKey));
}

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
  // fallback: user selects file via input element
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

function wire(){
  fillMetricDropdown();
  bindRangeButtons();
  setDefaultDate();

  el("hideMast").addEventListener("change", applyPrivacyMask);

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
    // copy latest values but keep today's date
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

  // Initial render (empty)
  render();
  applyPrivacyMask();
}

wire();