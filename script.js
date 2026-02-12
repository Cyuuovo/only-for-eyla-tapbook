// 最小可运行骨架：能戳、能点按钮、能切图、能计数。
// 后续我们再把 YAML 语料和 localStorage 接上。

const bubbleText = document.getElementById("bubbleText");
const eliBtn = document.getElementById("eli");
const eliImg = document.getElementById("eliImg");

const cntKisses = document.getElementById("cntKisses");
const cntTaps = document.getElementById("cntTaps");
const moodText = document.getElementById("moodText");

// ====== 简单状态 ======
let taps = 0;
let kisses = 0;
let sleeping = false;

// 图片名称（和 assets 里的 png 文件名一致，不带 .png）
const IMG = {
  neutral: "eli_neutral",
  shy: "eli_shy",
  kissed: "eli_kissed_star",
  sulk: "eli_sulk",
  sleep: "eli_sleep",
  sad: "eli_sad_down",
  pleading: "eli_pleading",
};

function setBubble(text){ bubbleText.textContent = text; }
function setMood(mood){ moodText.textContent = mood; }
function setImage(name){ eliImg.src = `./assets/${name}.png`; }

function bounce(){
  eliBtn.classList.remove("bounce");
  void eliBtn.offsetWidth;
  eliBtn.classList.add("bounce");
}

// ====== 戳戳 ======
eliBtn.addEventListener("click", () => {
  taps++;
  cntTaps.textContent = String(taps);

  // S1：睡觉时戳一下=叫醒
  if (sleeping) {
    sleeping = false;
    setImage(IMG.neutral);
    setMood("normal");
    setBubble("……嗯？你来啦。");
    bounce();
    return;
  }

  setMood("tap");
  setBubble("唔……（被戳）");
  bounce();
});

// ====== 按钮互动（占位） ======
document.querySelectorAll(".action").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;

    // 睡觉：进入睡眠并保持
    if (action === "nap") {
      sleeping = true;
      setImage(IMG.sleep);
      setMood("sleep");
      setBubble("……呼噜噜（睡着了）");
      return;
    }

    // 睡觉时按任意按钮=叫醒（S1）
    if (sleeping) {
      sleeping = false;
      setImage(IMG.neutral);
      setMood("normal");
      setBubble("被你叫醒了……哼。");
    }

    if (action === "kiss") {
      kisses++;
      cntKisses.textContent = String(kisses);
      setImage(IMG.kissed);
      setMood("kissed");
      setBubble("（亲亲回应占位）");
      return;
    }
    if (action === "hug") {
      setImage(IMG.shy);
      setMood("hug");
      setBubble("（抱抱回应占位）");
      return;
    }
    if (action === "confess") {
      setImage(IMG.shy);
      setMood("confess");
      setBubble("（我喜欢你回应占位）");
      return;
    }
    if (action === "surprise") {
      setImage(IMG.kissed);
      setMood("surprise");
      setBubble("（小惊喜回应占位）");
      return;
    }
    if (action === "groom") {
      setImage(IMG.neutral);
      setMood("groom");
      setBubble("（整理造型回应占位）");
      return;
    }
  });
});
