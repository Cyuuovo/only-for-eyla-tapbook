// v0.2 — 接入 YAML 语料 + 本地计数 + 戳戳等级/连戳 + 5秒回落 + 睡觉S1唤醒
// 依赖：index.html 已引入 js-yaml（window.jsyaml）

const bubbleText = document.getElementById("bubbleText");
const eliBtn = document.getElementById("eli");
const eliImg = document.getElementById("eliImg");

const cntKisses = document.getElementById("cntKisses");
const cntTaps = document.getElementById("cntTaps");
const moodText = document.getElementById("moodText");

const now = () => Date.now();

function setBubble(text){ bubbleText.textContent = text; }
function setMood(mood){ moodText.textContent = mood; }
function setImage(name){ eliImg.src = `./assets/${name}.png`; }

// ====== 本地存储（当天计数） ======
function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
const STORE_KEY = "eli_tapbook_v1";

function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { day: todayKey(), counters: {}, lastWelcomedDay: null, lastPick: {} };
    const obj = JSON.parse(raw);
    obj.day ||= todayKey();
    obj.counters ||= {};
    obj.lastPick ||= {};
    if (obj.day !== todayKey()){
      obj.day = todayKey();
      obj.counters = {};
      obj.lastPick = {};
    }
    return obj;
  }catch{
    return { day: todayKey(), counters: {}, lastWelcomedDay: null, lastPick: {} };
  }
}
function saveStore(){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }

let store = loadStore();

function incCounter(key, delta=1){
  store.counters[key] = (store.counters[key] || 0) + delta;
  saveStore();
  renderCounters();
}
function getCounter(key){ return store.counters[key] || 0; }

function renderCounters(){
  cntKisses.textContent = String(getCounter("kisses"));
  cntTaps.textContent = String(getCounter("taps"));
}

// ====== YAML 语料加载 ======
let CFG = null;

async function fetchYaml(){
  const candidates = ["./dialogue.yaml", "./语料v3.yaml"];
  for (const url of candidates){
    try{
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = window.jsyaml.load(text);
      if (parsed && parsed.pools) return parsed;
    }catch(e){
      // next
    }
  }
  throw new Error("YAML_NOT_FOUND");
}

// ====== 抽取逻辑（weight + 避免重复）=====
function weightedPick(items, poolKey){
  if (!items || items.length === 0) return null;

  const avoidN = CFG?.rules?.avoid_repeat_last_n ?? 0;
  const lastArr = (store.lastPick[poolKey] || []).slice(-avoidN);

  let candidates = items.filter(it => !lastArr.includes(it.text));
  if (candidates.length === 0) candidates = items;

  const defW = CFG?.rules?.default_weight ?? 1;
  const weights = candidates.map(it => Number(it.weight ?? defW));
  const sum = weights.reduce((a,b)=>a+b, 0);
  let r = Math.random() * sum;

  for (let i=0;i<candidates.length;i++){
    r -= weights[i];
    if (r <= 0){
      const chosen = candidates[i];
      store.lastPick[poolKey] = [...(store.lastPick[poolKey] || []), chosen.text].slice(-Math.max(avoidN, 6));
      saveStore();
      return chosen;
    }
  }
  return candidates[candidates.length-1];
}

function applyLine(line, stateLabel){
  if (!line) return;
  setBubble(line.text || "");
  if (line.mood && CFG.moods && CFG.moods[line.mood]){
    setImage(CFG.moods[line.mood]);
  }
  setMood(stateLabel);
}

// ====== 状态：睡觉与回落 ======
let sleeping = false;
let actionResetTimer = null;

function clearActionReset(){
  if (actionResetTimer) clearTimeout(actionResetTimer);
  actionResetTimer = null;
}
function scheduleResetIfNeeded(){
  clearActionReset();
  const ms = CFG?.rules?.action_reset_ms ?? 0;
  if (ms <= 0) return;
  if (sleeping && (CFG?.rules?.sleep_persist ?? true)) return;

  actionResetTimer = setTimeout(() => {
    setImage(CFG.moods.neutral);
    setMood("normal");
  }, ms);
}
function wakeUp(msg="……嗯？你来啦。"){
  sleeping = false;
  setImage(CFG.moods.neutral);
  setMood("normal");
  setBubble(msg);
  scheduleResetIfNeeded();
}

// ====== 戳戳：滚动计数 + 冷却清空 + 情绪锁 + 连戳惩罚 ======
let tapTimes = [];
let lastTapAt = 0;
let tapLockUntil = 0;
let bounceLockUntil = 0;
let rapidLockUntil = 0;

function pruneTapTimes(t, windowMs){
  const cutoff = t - windowMs;
  while (tapTimes.length && tapTimes[0] < cutoff) tapTimes.shift();
}

function getTapLevel(count){
  const th = CFG?.pools?.tap?.params?.thresholds;
  if (!th) return "lv1";
  for (const lv of ["lv4","lv3","lv2","lv1"]){
    const [a,b] = th[lv] || [];
    if (typeof a === "number" && typeof b === "number" && count >= a && count <= b) return lv;
  }
  return "lv1";
}

function bounce(){
  if (!(CFG?.rules?.tap_bounce?.enabled ?? true)) return;
  const cd = CFG?.rules?.tap_bounce?.cooldown_ms ?? 120;
  const t = now();
  if (t < bounceLockUntil) return;
  bounceLockUntil = t + cd;

  eliBtn.classList.remove("bounce");
  void eliBtn.offsetWidth;
  eliBtn.classList.add("bounce");
}

function handleTap(){
  const t = now();

  // S1：睡觉时戳=叫醒
  if (sleeping && (CFG?.rules?.wake_on_tap ?? true)){
    wakeUp("……嗯？（被你戳醒了）");
    bounce();
    return;
  }

  // 10秒无戳清空
  const idleReset = CFG?.pools?.tap?.params?.idle_reset_ms ?? 10000;
  if (lastTapAt && (t - lastTapAt >= idleReset)){
    tapTimes = [];
    tapLockUntil = 0;
    rapidLockUntil = 0;
    setImage(CFG.moods.neutral);
    setMood("normal");
  }
  lastTapAt = t;

  incCounter("taps", 1);

  // 连戳惩罚（优先）
  const rapid = CFG?.pools?.tap_rapid?.params;
  if (rapid){
    const rWin = rapid.window_ms ?? 1200;
    const rTh = rapid.threshold ?? 7;
    const rLock = rapid.lock_ms ?? 2500;

    const cutoff = t - rWin;
    const rapidCount = tapTimes.filter(x => x >= cutoff).length + 1;

    if (rapidCount >= rTh && t >= rapidLockUntil){
      rapidLockUntil = t + rLock;
      const line = weightedPick(CFG.pools.tap_rapid.lines, "tap_rapid");
      applyLine(line, "tap_rapid");
      tapLockUntil = t + (CFG?.rules?.mood_hold_ms ?? 2000);
      bounce();
      return;
    }
  }

  // 正常 lv 机制（2分钟窗口）
  const win = CFG?.pools?.tap?.params?.window_ms ?? 120000;
  tapTimes.push(t);
  pruneTapTimes(t, win);
  const count = tapTimes.length;

  if (t < tapLockUntil){
    bounce();
    return;
  }

  const lv = getTapLevel(count);
  const lines = CFG?.pools?.tap?.[lv] || [];
  const line = weightedPick(lines, `tap_${lv}`);
  applyLine(line, `tap_${lv}`);

  const holdBase = CFG?.rules?.mood_hold_ms ?? 2000;
  const holdLv3 = CFG?.rules?.lv3_hold_ms ?? holdBase;
  const holdLv4 = CFG?.rules?.lv4_hold_ms ?? holdBase;

  tapLockUntil = t + (lv === "lv4" ? holdLv4 : (lv === "lv3" ? holdLv3 : holdBase));
  bounce();
}

// ====== 按钮互动（从 YAML 抽语料）=====
function handleAction(actionKey){
  if (sleeping && actionKey !== "nap" && (CFG?.rules?.wake_on_action ?? true)){
    wakeUp("被你叫醒了……哼。");
  }

  if (actionKey === "nap"){
    sleeping = true;
    const pool = CFG?.pools?.buttons?.nap?.lines || [];
    const line = weightedPick(pool, "btn_nap");
    applyLine(line, "nap");
    if (CFG?.rules?.sleep_persist ?? true) clearActionReset();
    return;
  }

  const btn = CFG?.pools?.buttons?.[actionKey];
  if (!btn) return;

  if (btn.counter) incCounter(btn.counter, 1);

  const line = weightedPick(btn.lines || [], `btn_${actionKey}`);
  applyLine(line, actionKey);

  scheduleResetIfNeeded();
}

// ====== 初始化 ======
async function init(){
  renderCounters();

  CFG = await fetchYaml();

  setImage(CFG.moods.neutral);
  setMood("normal");

  // 每日首次进入欢迎语（当天只触发一次）
  if (store.lastWelcomedDay !== todayKey()){
    const line = weightedPick(CFG.pools.welcome_daily || [], "welcome_daily");
    applyLine(line, "welcome");
    store.lastWelcomedDay = todayKey();
    saveStore();
    scheduleResetIfNeeded();
  }

  eliBtn.addEventListener("click", handleTap);

  document.querySelectorAll(".action").forEach(btn => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action));
  });
}

init().catch(err => {
  console.error(err);
  setBubble("（语料加载失败：请确认 dialogue.yaml / 语料v3.yaml 已放在仓库根目录）");
  setMood("error");
});
