const C = document.getElementById("c"),
  g = C.getContext("2d");
const WORLD_Y_SCALE = 0.62;
let paused = false,
  bagOpen = false;
let W,
  H,
  scale,
  hero,
  enemies = [],
  sparks = [],
  loot = [],
  room = 1,
  level = 1,
  xp = 0,
  gold = 0,
  items = [],
  running = false,
  over = false,
  t = 0,
  jo = { x: 0, y: 0 },
  held = false,
  atk = 0,
  skill = 0,
  dodge = 0,
  notice = 0;
const R = (a, b) => a + Math.random() * (b - a),
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function resize() {
  scale = Math.min(devicePixelRatio || 1, 2);
  W = C.width = Math.round(innerWidth * scale);
  H = C.height = Math.round(innerHeight * scale);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  W = innerWidth;
  H = innerHeight;
}
addEventListener("resize", resize);
resize();
let audioCtx = null,
  soundOn = true,
  lastImpact = -Infinity;
let impactParticles = [],
  heroFlash = 0,
  aimAngle = 0;
function unlockAudio() {
  if (!soundOn) return;
  try {
    audioCtx =
      audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    soundOn = false;
    document.getElementById("soundToggle").textContent = "🔇 Son";
  }
}
function tone(freq, end, duration, type = "sine", vol = 0.08, delay = 0) {
  if (!soundOn || !audioCtx || audioCtx.state !== "running") return;
  try {
    let now = audioCtx.currentTime + delay,
      o = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), now);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(gain);
    gain.connect(audioCtx.destination);
    o.start(now);
    o.stop(now + duration + 0.02);
  } catch (e) {}
}
function sfx(kind) {
  if (kind === "attack") tone(320, 95, 0.12, "sawtooth", 0.045);
  else if (kind === "combo") {
    tone(490, 150, 0.2, "sawtooth", 0.07);
    tone(700, 310, 0.17, "triangle", 0.04, 0.05);
  } else if (kind === "skill") {
    tone(240, 760, 0.33, "triangle", 0.09);
    tone(520, 170, 0.38, "sine", 0.05, 0.09);
  } else if (kind === "dodge") tone(540, 190, 0.16, "triangle", 0.045);
  else if (kind === "hit") tone(130, 58, 0.15, "square", 0.025);
  else if (kind === "loot") {
    tone(520, 740, 0.11, "sine", 0.06);
    tone(740, 1060, 0.18, "sine", 0.06, 0.11);
  } else if (kind === "level") {
    [440, 554, 659, 880].forEach((n, i) =>
      tone(n, n * 1.05, 0.22, "sine", 0.065, i * 0.1),
    );
  } else if (kind === "boss") {
    tone(170, 80, 0.55, "sawtooth", 0.07);
    tone(110, 55, 0.6, "triangle", 0.06, 0.16);
  } else if (kind === "death") tone(320, 55, 0.8, "triangle", 0.075);
}
document.getElementById("soundToggle").addEventListener("click", () => {
  soundOn = !soundOn;
  document.getElementById("soundToggle").textContent = soundOn
    ? "🔊 Son"
    : "🔇 Son";
  if (soundOn) {
    unlockAudio();
    sfx("loot");
  }
});
const SAVE_KEY = "eclipse_rpg_save_v1";
let saveClock = 0,
  rewardOpen = false;
const BLESSINGS = ["might", "vitality", "focus"];
function blessingRank(id) {
  return hero?.blessings?.[id] || 0;
}
function damageMultiplier() {
  return 1 + blessingRank("might") * 0.08;
}
function manaRecovery() {
  return 7 + blessingRank("focus");
}
function saveGame() {
  if (!running || !hero || hero.hp <= 0) return false;
  try {
    const data = {
      schema: 1,
      rewardOpen,
      hero: { ...hero },
      room,
      level,
      xp,
      gold,
      combat: { atk, skill, dodge, invuln, combo, comboWindow },
      bolts,
      hazards,
      items: items.map((l) => ({ ...l })),
      enemies: enemies.map((e) => ({ ...e })),
      loot: loot.map((l) => ({ ...l })),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    const el = document.getElementById("saveStatus");
    el.textContent = "✓ Sauvegardé";
    return true;
  } catch (e) {
    document.getElementById("saveStatus").textContent =
      "⚠ Sauvegarde indisponible";
    return false;
  }
}
function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    const finite = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
    const integer = (v, min, max) => Number.isInteger(v) && finite(v, min, max);
    if (!data || data.schema !== 1 || !data.hero) return null;
    const h = data.hero;
    if (
      h.blessings !== undefined &&
      (!h.blessings ||
        !BLESSINGS.every((id) => integer(h.blessings[id], 0, 1e6)))
    )
      return null;
    if (data.rewardOpen !== undefined && typeof data.rewardOpen !== "boolean")
      return null;
    if (
      !["Guerrier", "Mage", "Assassin"].includes(h.cls) ||
      !finite(h.x, -440, 440) ||
      !finite(h.y, -350, 350) ||
      !finite(h.max, 1, 1e8) ||
      !finite(h.hp, 0.001, h.max) ||
      !finite(h.mp, 0, 100) ||
      ![-1, 1].includes(h.dir)
    )
      return null;
    if (
      !integer(data.room, 1, 1e6) ||
      !integer(data.level, 1, 1e6) ||
      !integer(data.xp, 0, 1e9) ||
      !integer(data.gold, 0, 1e12)
    )
      return null;
    const item = (l) =>
      l &&
      typeof l.name === "string" &&
      l.name.length < 160 &&
      finite(l.power, 1, 1e6) &&
      integer(l.rar, 1, 4) &&
      typeof l.color === "string" &&
      /^#[0-9a-f]{3,8}$/i.test(l.color) &&
      (!l.slot || ["weapon", "armor"].includes(l.slot)) &&
      (!l.id || typeof l.id === "string");
    if (
      !Array.isArray(data.items) ||
      data.items.length > 10000 ||
      !data.items.every(item) ||
      !Array.isArray(data.loot) ||
      data.loot.length > 100 ||
      !data.loot.every(
        (l) => item(l) && finite(l.x, -440, 440) && finite(l.y, -350, 350),
      )
    )
      return null;
    if (
      !Array.isArray(data.enemies) ||
      data.enemies.length > 100 ||
      !data.enemies.every(
        (e) =>
          e &&
          ["boss", "brute", "archer", "stalker"].includes(e.type) &&
          finite(e.x, -440, 440) &&
          finite(e.y, -350, 350) &&
          finite(e.hp, 0, 1e9) &&
          finite(e.max, 1, 1e9) &&
          finite(e.spd, 0, 1000) &&
          finite(e.r, 1, 100) &&
          (e.recover === undefined || finite(e.recover, 0, 5)) &&
          (e.windMax === undefined || finite(e.windMax, 0.1, 5)) &&
          (e.shotAngle === undefined ||
            finite(e.shotAngle, -Math.PI * 2, Math.PI * 2)) &&
          ["pattern", "nextPattern"].every(
            (k) => e[k] === undefined || ["slam", "volley"].includes(e[k]),
          ) &&
          ["cool", "wind", "hit", "phase", "aimX", "aimY"].every((k) =>
            finite(e[k], -1e6, 1e6),
          ),
      )
    )
      return null;
    // Older saves remain valid; newer saves also retain incoming attacks and cooldowns.
    if (
      data.combat &&
      !["atk", "skill", "dodge", "invuln", "combo", "comboWindow"].every((k) =>
        finite(data.combat[k], 0, 10),
      )
    )
      return null;
    for (const key of ["bolts", "hazards"]) {
      if (
        data[key] !== undefined &&
        (!Array.isArray(data[key]) ||
          data[key].length > 500 ||
          !data[key].every(
            (v) =>
              v &&
              ["x", "y"].every((k) => finite(v[k], -1e5, 1e5)) &&
              finite(v.r, 1, 1000) &&
              finite(v.life, 0, 10) &&
              finite(v.damage, 0, 1e5) &&
              (key !== "bolts" ||
                ["vx", "vy"].every((k) => finite(v[k], -1000, 1000))),
          ))
      )
        return null;
    }
    if (data.rewardOpen && data.enemies.length !== 0) return null;
    return data;
  } catch (e) {
    return null;
  }
}
function showResume() {
  const data = readSave(),
    el = document.getElementById("resumeArea");
  if (data) {
    const when = new Date(data.savedAt || Date.now()).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    el.innerHTML =
      '<button class="action" onclick="resumeGame()">▶ Reprendre ma partie</button><p>' +
      data.hero.cls +
      " · Niveau " +
      data.level +
      " · Salle " +
      data.room +
      " · " +
      when +
      "</p>";
  } else el.innerHTML = "<p>Aucune partie sauvegardée sur cet appareil.</p>";
}
function resumeGame() {
  const data = readSave();
  if (!data) {
    showResume();
    return;
  }
  unlockAudio();
  hero = data.hero;
  hero.blessings = hero.blessings || { might: 0, vitality: 0, focus: 0 };
  room = data.room;
  level = data.level;
  xp = data.xp;
  gold = data.gold;
  items = data.items.map((l, i) => ({
    ...l,
    id: l.id || "ancien-" + i,
    slot: l.slot || (l.name && l.name.includes("Armure") ? "armor" : "weapon"),
  }));
  const legacyEquipment = !hero.equipped;
  hero.equipped = hero.equipped || { weapon: null, armor: null };
  if (legacyEquipment && items.length) {
    const best = items
      .filter((l) => l.slot === "weapon")
      .sort((a, b) => b.power - a.power)[0];
    if (best) hero.equipped.weapon = best.id;
  }
  syncEquipment();
  enemies = data.enemies.map((e) => ({
    ...e,
    recover: e.recover || 0,
    pattern: e.pattern || "slam",
    nextPattern: e.nextPattern || "slam",
    windMax: e.windMax || (e.boss ? 1.15 : e.type === "archer" ? 0.7 : 0.85),
    shotAngle: e.shotAngle || 0,
    enraged: !!e.enraged,
  }));
  loot = data.loot;
  resetSession();
  hazards = data.hazards || [];
  bolts = data.bolts || [];
  if (data.combat)
    ({ atk, skill, dodge, invuln, combo, comboWindow } = data.combat);
  skillMax = hero.cls === "Mage" ? 2.7 : 4;
  hero.hp = Math.max(1, Math.min(hero.max, hero.hp));
  hero.mp = Math.max(0, Math.min(100, hero.mp));
  running = true;
  over = false;
  document.getElementById("menu").style.display = "none";
  document.getElementById("room").textContent = room % 5 || 5;
  document.getElementById("dungeon").textContent = Math.ceil(room / 5);
  document.getElementById("boss").style.display =
    room % 5 === 0 ? "block" : "none";
  toast("Bon retour dans ECLIPSE !");
  saveClock = 0;
  if (data.rewardOpen) showRewards();
}
function start(cls) {
  if (!["Guerrier", "Mage", "Assassin"].includes(cls)) return;
  if (
    readSave() &&
    !confirm("Remplacer la partie sauvegardée par une nouvelle aventure ?")
  )
    return;
  unlockAudio();
  resetSession();
  hero = {
    x: 0,
    y: 0,
    hp: 100,
    max: 100,
    mp: 100,
    cls,
    dir: 1,
    weapon: 1,
    defense: 0,
    equipped: { weapon: null, armor: null },
    blessings: { might: 0, vitality: 0, focus: 0 },
  };
  room = 1;
  level = 1;
  xp = gold = 0;
  items = [];
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
  running = true;
  over = false;
  document.getElementById("menu").style.display = "none";
  spawn();
  saveGame();
  toast("Entre dans les ruines !");
}
let combo = 0,
  comboWindow = 0,
  slashes = [],
  bolts = [],
  hazards = [],
  invuln = 0,
  skillMax = 4,
  dodgeMax = 2.5;
function spawn() {
  impactParticles = [];
  heroFlash = 0;
  enemies = [];
  loot = [];
  hazards = [];
  bolts = [];
  slashes = [];
  combo = 0;
  comboWindow = 0;
  hero.x = hero.y = 0;
  hero.hp = Math.min(hero.max, hero.hp + 24);
  hero.mp = 100;
  let n = room % 5 === 0 ? 1 : 3 + Math.min(room, 6);
  for (let i = 0; i < n; i++) {
    let boss = room % 5 === 0;
    let x = R(-320, 320),
      y = R(-270, 270);
    if (Math.hypot(x, y) < 140) x += 220;
    let type = boss
      ? "boss"
      : ["brute", "archer", "stalker"][Math.floor(R(0, 3))];
    let hp = boss
      ? 330 + room * 32
      : type === "brute"
        ? 85 + room * 12
        : 40 + room * 8;
    enemies.push({
      x,
      y,
      hp,
      max: hp,
      boss,
      type,
      spd: boss ? 46 : type === "stalker" ? 93 : type === "brute" ? 32 : 55,
      hit: 0,
      phase: R(0, 6),
      r: boss ? 35 : type === "brute" ? 26 : 18,
      cool: R(0.5, 1.8),
      wind: 0,
      charge: 0,
      aimX: 0,
      aimY: 0,
    });
  }
  document.getElementById("room").textContent = room % 5 || 5;
  document.getElementById("dungeon").textContent = Math.ceil(room / 5);
  document.getElementById("boss").style.display =
    room % 5 === 0 ? "block" : "none";
}
function toast(s) {
  let el = document.getElementById("toast");
  el.textContent = s;
  notice = performance.now() + 1900;
}
// Visual feedback never pauses the simulation or changes joystick speed.
function impact(x, y, color, strong = false) {
  for (let i = 0; i < (strong ? 14 : 7); i++) {
    const angle = R(0, Math.PI * 2),
      speed = R(45, strong ? 190 : 115);
    impactParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.32,
      max: 0.32,
      color,
    });
  }
  impactParticles = impactParticles.slice(-160);
  if (t - lastImpact > 0.06) {
    tone(strong ? 210 : 410, 80, strong ? 0.16 : 0.09, "triangle", 0.055);
    lastImpact = t;
  }
}
function hurtHero(damage, protection = 0.35) {
  if (invuln > 0 || hero.hp <= 0) return false;
  const actual = damage * (1 - (hero.defense || 0));
  hero.hp -= actual;
  invuln = protection;
  heroFlash = 0.22;
  sfx("hit");
  sparks.push({
    x: hero.x,
    y: hero.y,
    text: "-" + Math.round(actual),
    life: 0.6,
    color: "#ff8199",
  });
  return true;
}
function beginWind(e) {
  e.aimX = hero.x;
  e.aimY = hero.y;
  if (e.boss) {
    e.pattern = e.nextPattern || "slam";
    e.nextPattern = e.pattern === "slam" ? "volley" : "slam";
    e.enraged = e.hp <= e.max * 0.5;
    e.windMax = e.pattern === "slam" ? 1.15 : 1.3;
    e.shotAngle = Math.atan2(hero.y - e.y, hero.x - e.x);
    toast(
      e.pattern === "slam"
        ? "BOSS · Sors du cercle !"
        : "BOSS · Évite les rayons !",
    );
  } else e.windMax = e.type === "archer" ? 0.7 : 0.85;
  e.wind = e.windMax;
}
function resolveWind(e) {
  if (e.type === "archer") {
    const len = Math.hypot(e.aimX - e.x, e.aimY - e.y) || 1;
    bolts.push({
      x: e.x,
      y: e.y,
      vx: ((e.aimX - e.x) / len) * 225,
      vy: ((e.aimY - e.y) / len) * 225,
      life: 2.8,
      r: 9,
      color: "#8ce3bc",
      damage: 19,
    });
  } else if (e.boss && e.pattern === "volley") {
    const count = e.enraged ? 8 : 6;
    for (let k = 0; k < count; k++) {
      const a = e.shotAngle + (k * Math.PI * 2) / count;
      bolts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * 175,
        vy: Math.sin(a) * 175,
        life: 3,
        r: 10,
        color: "#fda96c",
        damage: 18,
      });
    }
  } else
    hazards.push({
      x: e.aimX,
      y: e.aimY,
      r: e.boss ? 105 : 65,
      life: 0.38,
      damage: e.boss ? 37 : 23,
      done: false,
    });
  e.recover = e.boss ? 1.1 : 0.35;
  e.cool = e.boss ? (e.enraged ? 2.3 : 2.8) : e.type === "archer" ? 2.2 : 2.4;
}
function hit(dmg, range, special) {
  let targets = enemies.filter(
    (e) => e.hp > 0 && Math.hypot(e.x - hero.x, e.y - hero.y) < range,
  );
  targets.sort(
    (a, b) =>
      Math.hypot(a.x - hero.x, a.y - hero.y) -
      Math.hypot(b.x - hero.x, b.y - hero.y),
  );
  if (targets.length) {
    hero.dir = targets[0].x < hero.x ? -1 : 1;
    aimAngle = Math.atan2(targets[0].y - hero.y, targets[0].x - hero.x);
  } else {
    const input = movementInput();
    aimAngle =
      Math.hypot(input.x, input.y) > 0.08
        ? Math.atan2(input.y / WORLD_Y_SCALE, input.x)
        : hero.dir === 1
          ? 0
          : Math.PI;
  }
  for (let e of targets.slice(0, special ? 12 : 1)) {
    e.hp -= dmg;
    e.hit = 0.2;
    impact(
      e.x,
      e.y,
      special ? "#8fe5ff" : combo === 3 ? "#ffd17c" : "#ffe1a1",
      special || combo === 3,
    );
    sparks.push({
      x: e.x,
      y: e.y,
      text: "-" + Math.round(dmg),
      life: 0.65,
      color: special ? "#8fe5ff" : "#ffe1a1",
    });
    if (!e.boss) {
      let dx = e.x - hero.x,
        dy = e.y - hero.y,
        len = Math.hypot(dx, dy) || 1;
      e.x = clamp(
        e.x + (dx / len) * (special ? 35 : combo === 3 ? 16 : 6),
        -440,
        440,
      );
      e.y = clamp(
        e.y + (dy / len) * (special ? 35 : combo === 3 ? 16 : 6),
        -350,
        350,
      );
    }
  }
}
function attack() {
  if (!canPlay() || atk > 0) return;
  combo = comboWindow > 0 ? (combo % 3) + 1 : 1;
  comboWindow = 0.85;
  sfx(combo === 3 ? "combo" : "attack");
  atk = hero.cls === "Assassin" ? 0.2 : 0.31;
  let range = hero.cls === "Mage" ? 185 : combo === 3 ? 115 : 90;
  let dmg =
    (hero.cls === "Mage" ? 22 : 19) *
    hero.weapon *
    damageMultiplier() *
    (combo === 3 ? 2 : combo === 2 ? 1.25 : 1);
  hit(dmg, range, false);
  slashes.push({
    x: hero.x,
    y: hero.y,
    life: 0.3,
    max: 0.3,
    r: range,
    combo,
    angle: aimAngle,
    dir: hero.dir,
    color:
      hero.cls === "Mage" ? "#83dfff" : combo === 3 ? "#ffd17c" : "#fff2bd",
  });
  if (combo === 3) {
    sparks.push({
      x: hero.x,
      y: hero.y - 35,
      text: "COMBO ×3",
      life: 0.8,
      color: "#ffd37a",
    });
  }
}
function cast() {
  if (!canPlay() || skill > 0 || hero.mp < 30) return;
  hero.mp -= 30;
  sfx("skill");
  skillMax = hero.cls === "Mage" ? 2.7 : 4;
  skill = skillMax;
  let range = hero.cls === "Mage" ? 245 : hero.cls === "Assassin" ? 175 : 160;
  let dmg =
    (hero.cls === "Mage" ? 72 : hero.cls === "Assassin" ? 57 : 49) *
    hero.weapon *
    damageMultiplier();
  hit(dmg, range, true);
  slashes.push({
    x: hero.x,
    y: hero.y,
    life: 0.65,
    max: 0.65,
    r: range,
    combo: 4,
    dir: hero.dir,
    color:
      hero.cls === "Mage"
        ? "#66e9ff"
        : hero.cls === "Assassin"
          ? "#b58aff"
          : "#ffc76e",
  });
  sparks.push({
    x: hero.x,
    y: hero.y,
    text:
      hero.cls === "Mage" ? "NOVA" : hero.cls === "Assassin" ? "OMBRE" : "ONDE",
    life: 0.8,
    color: "#74dfff",
  });
}
function evade() {
  if (!canPlay() || dodge > 0) return;
  dodge = dodgeMax;
  sfx("dodge");
  invuln = 0.55;
  let { x: dx, y: dy } = movementInput();
  if (Math.hypot(dx, dy) < 0.08) {
    dx = hero.dir;
    dy = 0;
  }
  let len = Math.hypot(dx, dy) || 1;
  hero.x = clamp(hero.x + (dx / len) * 165, -440, 440);
  hero.y = clamp(hero.y + ((dy / len) * 165) / WORLD_Y_SCALE, -350, 350);
  sparks.push({
    x: hero.x,
    y: hero.y,
    text: "ESQUIVE",
    life: 0.5,
    color: "#a0e8ff",
  });
}
document.getElementById("attack").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  held = true;
  attack();
});
["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
  document.getElementById("attack").addEventListener(ev, () => (held = false)),
);
document.getElementById("skill").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  cast();
});
document.getElementById("dodge").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  evade();
});
let stick = document.getElementById("stick"),
  knob = document.getElementById("knob"),
  activeTouch = null,
  activePointer = null;
function moveStick(e) {
  if (!canPlay()) return;
  let b = stick.getBoundingClientRect(),
    dx = e.clientX - (b.left + b.width / 2),
    dy = e.clientY - (b.top + b.height / 2),
    m = Math.hypot(dx, dy) || 1,
    p = Math.min(m, b.width * 0.25);
  jo.x = ((dx / m) * p) / (b.width * 0.25);
  jo.y = ((dy / m) * p) / (b.width * 0.25);
  knob.style.transform =
    "translate(" +
    jo.x * (b.width * 0.28) +
    "px," +
    jo.y * (b.width * 0.28) +
    "px)";
}
function reset() {
  jo.x = jo.y = 0;
  knob.style.transform = "";
  activeTouch = null;
  activePointer = null;
}
function withinStick(x, y) {
  let b = stick.getBoundingClientRect();
  return (
    x >= b.left - 22 &&
    x <= b.right + 22 &&
    y >= b.top - 22 &&
    y <= b.bottom + 22
  );
}
document.addEventListener(
  "touchstart",
  (e) => {
    if (!canPlay() || activeTouch !== null) return;
    for (let t of e.changedTouches) {
      if (withinStick(t.clientX, t.clientY)) {
        activeTouch = t.identifier;
        moveStick(t);
        e.preventDefault();
        break;
      }
    }
  },
  { passive: false, capture: true },
);
document.addEventListener(
  "touchmove",
  (e) => {
    if (activeTouch === null) return;
    for (let t of e.changedTouches) {
      if (t.identifier === activeTouch) {
        moveStick(t);
        e.preventDefault();
        break;
      }
    }
  },
  { passive: false, capture: true },
);
document.addEventListener(
  "touchend",
  (e) => {
    for (let t of e.changedTouches) {
      if (t.identifier === activeTouch) {
        reset();
        break;
      }
    }
  },
  { passive: false, capture: true },
);
document.addEventListener(
  "touchcancel",
  (e) => {
    for (let t of e.changedTouches) {
      if (t.identifier === activeTouch) {
        reset();
        break;
      }
    }
  },
  { passive: false, capture: true },
);
stick.addEventListener("pointerdown", (e) => {
  if (!canPlay() || e.pointerType === "touch") return;
  activePointer = e.pointerId;
  try {
    stick.setPointerCapture(e.pointerId);
  } catch (err) {}
  moveStick(e);
});
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch" && activePointer === e.pointerId) moveStick(e);
});
document.addEventListener("pointerup", (e) => {
  if (activePointer === e.pointerId) reset();
});
document.addEventListener("pointercancel", (e) => {
  if (activePointer === e.pointerId) reset();
});
let keys = {};
function movementInput() {
  return {
    x:
      jo.x +
      (keys.d || keys.arrowright ? 1 : 0) -
      (keys.a || keys.q || keys.arrowleft ? 1 : 0),
    y:
      jo.y +
      (keys.s || keys.arrowdown ? 1 : 0) -
      (keys.w || keys.z || keys.arrowup ? 1 : 0),
  };
}
function canPlay() {
  return running && !paused && !bagOpen && !rewardOpen && !document.hidden;
}
function clearInput() {
  reset();
  held = false;
  keys = {};
}
function resetSession() {
  rewardOpen = false;
  document.getElementById("hud").inert = false;
  document.getElementById("rewardOverlay").hidden = true;
  impactParticles = [];
  heroFlash = 0;
  clearInput();
  paused = bagOpen = false;
  document.getElementById("inventory").style.display = "none";
  document.getElementById("pauseOverlay").hidden = true;
  document.getElementById("nextRoom").hidden = true;
  hazards = [];
  bolts = [];
  slashes = [];
  sparks = [];
  combo = comboWindow = atk = skill = dodge = invuln = saveClock = 0;
}
function setPaused(value) {
  if (!running) return;
  paused = value;
  clearInput();
  document.getElementById("pauseOverlay").hidden = !paused;
  if (paused) saveGame();
  else {
    unlockAudio();
    if (rewardOpen) document.getElementById("rewardMight").focus();
  }
}
addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    ) &&
    running
  )
    e.preventDefault();
  if (e.repeat) return;
  if (key === "escape" || key === "p") {
    if (bagOpen) toggleBag();
    else setPaused(!paused);
    return;
  }
  if (!canPlay()) return;
  keys[key] = true;
  if (e.code === "Space") attack();
  if (key === "e") cast();
  if (key === "shift") evade();
});
addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
addEventListener("blur", () => setPaused(true));
function syncEquipment() {
  if (!hero) return;
  hero.equipped = hero.equipped || { weapon: null, armor: null };
  const w = items.find(
      (l) => l.id === hero.equipped.weapon && l.slot === "weapon",
    ),
    a = items.find((l) => l.id === hero.equipped.armor && l.slot === "armor");
  hero.weapon = w ? Number(w.power) || 1 : 1;
  hero.defense = a
    ? Math.min(0.5, Math.max(0, (Number(a.power) || 1) - 1) * 0.35)
    : 0;
}
function equipItem(id) {
  if (!hero) return;
  const item = items.find((l) => l.id === id);
  if (!item) return;
  hero.equipped = hero.equipped || { weapon: null, armor: null };
  hero.equipped[item.slot] = hero.equipped[item.slot] === id ? null : id;
  syncEquipment();
  sfx("loot");
  saveGame();
  renderBag();
}
function renderBag() {
  if (hero)
    document.getElementById("blessingStats").textContent =
      "Améliorations · Dégâts +" +
      Math.round((damageMultiplier() - 1) * 100) +
      " % · Vie max " +
      hero.max +
      " · Mana " +
      manaRecovery() +
      "/s";
  if (!hero) return;
  syncEquipment();
  document.getElementById("stats").textContent =
    "⚔ Puissance " +
    hero.weapon.toFixed(2) +
    "× · 🛡 Réduction " +
    Math.round(hero.defense * 100) +
    " %";
  const el = document.getElementById("items");
  el.replaceChildren();
  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = "Aucun équipement pour le moment.";
    el.appendChild(p);
    return;
  }
  for (const item of items) {
    const chosen = hero.equipped[item.slot] === item.id;
    const box = document.createElement("div");
    box.className = "item" + (chosen ? " equipped" : "");
    const label = document.createElement("div");
    label.style.color = item.color || "#d8e5f7";
    label.textContent = (item.slot === "armor" ? "🛡 " : "⚔ ") + item.name;
    const desc = document.createElement("div");
    desc.textContent =
      item.slot === "armor"
        ? "Défense : " +
          Math.round(Math.min(0.5, Math.max(0, item.power - 1) * 0.35) * 100) +
          " %"
        : "Dégâts : " + Number(item.power).toFixed(2) + "×";
    const current = items.find((l) => l.id === hero.equipped[item.slot]);
    const comparison = document.createElement("small");
    comparison.style.display = "block";
    comparison.textContent =
      current && !chosen
        ? "Écart : " +
          (item.power >= current.power ? "+" : "") +
          (item.power - current.power).toFixed(2)
        : chosen
          ? "✓ Actuellement équipé"
          : "Aucun objet équipé";
    const btn = document.createElement("button");
    btn.textContent = chosen ? "Retirer" : "Équiper";
    btn.addEventListener("click", () => equipItem(item.id));
    box.append(label, desc, comparison, btn);
    el.appendChild(box);
  }
}
function toggleBag() {
  if (!running || paused || rewardOpen) return;
  bagOpen = !bagOpen;
  clearInput();
  document.getElementById("inventory").style.display = bagOpen
    ? "block"
    : "none";
  if (bagOpen) {
    renderBag();
    saveGame();
  }
}
function drop(x, y) {
  let q = Math.random(),
    rar = q > 0.96 ? 4 : q > 0.8 ? 3 : q > 0.48 ? 2 : 1,
    colors = ["", "#a4c6ee", "#66df91", "#b68aff", "#ffbf60"],
    names = ["", "Commun", "Rare", "Épique", "Légendaire"];
  let armor = Math.random() < 0.35;
  loot.push({
    id: "obj-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9),
    x,
    y,
    rar,
    color: colors[rar],
    slot: armor ? "armor" : "weapon",
    name:
      names[rar] +
      " · " +
      (armor ? "Armure" : ["Lame", "Bâton", "Dague"][Math.floor(R(0, 3))]),
    power: Number((1 + rar * 0.13 + room * 0.025).toFixed(3)),
  });
}
function update(dt) {
  if (!canPlay()) return;
  saveClock += dt;
  if (saveClock >= 5) {
    saveClock = 0;
    saveGame();
  }
  t += dt;
  heroFlash = Math.max(0, heroFlash - dt);
  impactParticles = impactParticles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return p.life > 0;
  });
  invuln = Math.max(0, invuln - dt);
  comboWindow = Math.max(0, comboWindow - dt);
  slashes = slashes.filter((s) => (s.life -= dt) > 0);
  atk = Math.max(0, atk - dt);
  skill = Math.max(0, skill - dt);
  dodge = Math.max(0, dodge - dt);
  hero.mp = Math.min(100, hero.mp + dt * manaRecovery());
  let { x: dx, y: dy } = movementInput(),
    m = Math.hypot(dx, dy);
  if (m > 0.08) {
    hero.x = clamp(hero.x + (dx / Math.max(1, m)) * 285 * dt, -440, 440);
    hero.y = clamp(
      hero.y + ((dy / Math.max(1, m)) * 285 * dt) / WORLD_Y_SCALE,
      -350,
      350,
    );
    if (Math.abs(dx) > 0.08) hero.dir = dx < 0 ? -1 : 1;
  }
  if (held && atk === 0) attack();
  for (let e of enemies) {
    if (e.hp <= 0) continue;
    let d = Math.hypot(hero.x - e.x, hero.y - e.y) || 1;
    e.cool -= dt;
    e.hit = Math.max(0, e.hit - dt);
    if (e.wind > 0) {
      e.wind -= dt;
      if (e.wind <= 0) resolveWind(e);
      continue;
    }
    if (e.recover > 0) {
      e.recover = Math.max(0, e.recover - dt);
      continue;
    }
    if (e.type === "archer") {
      if (d < 150) {
        e.x -= ((hero.x - e.x) / d) * e.spd * dt;
        e.y -= ((hero.y - e.y) / d) * e.spd * dt;
      } else if (d > 230) {
        e.x += ((hero.x - e.x) / d) * e.spd * dt;
        e.y += ((hero.y - e.y) / d) * e.spd * dt;
      }
      if (e.cool <= 0) {
        beginWind(e);
      }
    } else if (e.boss || e.type === "brute") {
      if (d > (e.boss ? 90 : 55)) {
        e.x += ((hero.x - e.x) / d) * e.spd * dt;
        e.y += ((hero.y - e.y) / d) * e.spd * dt;
      }
      if (e.cool <= 0 && d < (e.boss ? 290 : 130)) {
        beginWind(e);
      }
    } else {
      if (d > e.r + 23) {
        e.x += ((hero.x - e.x) / d) * e.spd * dt;
        e.y += ((hero.y - e.y) / d) * e.spd * dt;
      } else if (invuln <= 0 && e.hit <= 0) {
        if (e.cool <= 0 && hurtHero(12, 0.4)) e.cool = 0.75;
      }
    }
    e.x = clamp(e.x, -440, 440);
    e.y = clamp(e.y, -350, 350);
  }
  for (let b of bolts) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (invuln <= 0 && Math.hypot(b.x - hero.x, b.y - hero.y) < b.r + 17) {
      hurtHero(b.damage, 0.35);
      b.life = 0;
    }
  }
  bolts = bolts.filter((b) => b.life > 0);
  for (let h of hazards) {
    h.life -= dt;
    if (!h.done && h.life < 0.25) {
      h.done = true;
      if (invuln <= 0 && Math.hypot(h.x - hero.x, h.y - hero.y) < h.r) {
        hurtHero(h.damage, 0.4);
      }
    }
  }
  hazards = hazards.filter((h) => h.life > 0);
  if (hero.hp <= 0) {
    sfx("death");
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
    running = false;
    over = true;
    document.getElementById("menu").style.display = "flex";
    document.getElementById("panel").innerHTML =
      "<h1>ÉCHEC</h1><p>Tu as atteint la salle " +
      room +
      '. Repars à l’aventure !</p><button class="action" onclick="location.reload()">Rejouer</button>';
    clearInput();
    return;
  }
  for (let e of enemies.filter((e) => e.hp <= 0)) {
    xp += e.boss ? 110 : 20;
    gold += e.boss ? 100 : 15;
    if (Math.random() < 0.55 || e.boss) drop(e.x, e.y);
  }
  enemies = enemies.filter((e) => e.hp > 0);
  for (let l of loot.filter(
    (l) => Math.hypot(hero.x - l.x, hero.y - l.y) < 40,
  )) {
    items.push(l);
    sfx("loot");
    toast("Butin : " + l.name + " (dans le sac)");
  }
  loot = loot.filter((l) => Math.hypot(hero.x - l.x, hero.y - l.y) >= 40);
  while (xp >= level * 100) {
    sfx("level");
    xp -= level * 100;
    level++;
    hero.max += 20;
    hero.hp = hero.max;
    toast("NIVEAU " + level + " !");
  }
  document.getElementById("nextRoom").hidden = enemies.length !== 0;
  sparks = sparks.filter((s) => (s.life -= dt) > 0);
  document.getElementById("who").textContent = hero.cls;
  document.getElementById("lvl").textContent = level;
  document.getElementById("hp").style.width =
    clamp((hero.hp / hero.max) * 100, 0, 100) + "%";
  document.getElementById("mp").style.width = hero.mp + "%";
  document.getElementById("gold").textContent = gold;
  document.getElementById("xp").textContent = xp;
  if (room % 5 === 0 && enemies[0])
    document.getElementById("bhp").style.width =
      (100 * enemies[0].hp) / enemies[0].max + "%";
  document.getElementById("skill").textContent =
    skill > 0 ? Math.ceil(skill) + "s" : "✦";
  document.getElementById("dodge").textContent =
    dodge > 0 ? Math.ceil(dodge) + "s" : "↝";
  if (performance.now() > notice)
    document.getElementById("toast").textContent = "";
}
function diamond(x, y, w, h, c) {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w, y);
  g.lineTo(x, y + h);
  g.lineTo(x - w, y);
  g.closePath();
  g.fill();
}
function draw() {
  g.clearRect(0, 0, W, H);
  let bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#172940");
  bg.addColorStop(1, "#0c1022");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  if (!hero) return;
  let s = Math.min(W / 520, H / 750, 1.28),
    ox = W / 2 - hero.x * s,
    oy = H * 0.46 - hero.y * s * 0.62;
  g.save();
  g.translate(ox, oy);
  g.scale(s, s * 0.62);
  for (let i = -11; i <= 11; i++)
    for (let j = -10; j <= 10; j++) {
      let x = i * 80,
        y = j * 80;
      if (Math.abs(x) > 500 || Math.abs(y) > 420) continue;
      diamond(x, y, 79, 79, (i + j) % 2 ? "#263c49" : "#304b56");
      g.strokeStyle = "#8bb7b81c";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 39);
      g.lineTo(x + 39, y);
      g.lineTo(x, y + 39);
      g.lineTo(x - 39, y);
      g.closePath();
      g.stroke();
    }
  for (let i = 0; i < 30; i++) {
    let x = Math.sin(i * 17.8) * 490,
      y = Math.cos(i * 23.2) * 395;
    g.shadowColor = i % 3 ? "#47b8b4" : "#9b6bc8";
    g.shadowBlur = 10;
    diamond(x, y, 13, 17, i % 3 ? "#467c78" : "#775a91");
    g.shadowBlur = 0;
  }
  for (const e of enemies.filter((e) => e.wind > 0)) {
    const duration =
        e.windMax || (e.boss ? 1.15 : e.type === "archer" ? 0.7 : 0.85),
      progress = clamp(1 - e.wind / duration, 0, 1);
    g.save();
    g.strokeStyle = e.boss
      ? "#ffb35c"
      : e.type === "archer"
        ? "#8ce3bc"
        : "#ffc184";
    g.lineWidth = 3;
    if (e.boss && e.pattern === "volley") {
      const count = e.enraged ? 8 : 6;
      g.setLineDash([10, 8]);
      for (let k = 0; k < count; k++) {
        const a = e.shotAngle + (k * Math.PI * 2) / count;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + Math.cos(a) * 520, e.y + Math.sin(a) * 520);
        g.stroke();
      }
      g.setLineDash([]);
      g.beginPath();
      g.arc(e.x, e.y, 48, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      g.stroke();
    } else if (e.type === "archer") {
      g.setLineDash([9, 7]);
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.lineTo(e.aimX, e.aimY);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(e.aimX, e.aimY, 18, 0, Math.PI * 2);
      g.stroke();
    } else {
      const radius = e.boss ? 105 : 65;
      g.fillStyle = "#ff9a6b22";
      g.beginPath();
      g.arc(e.aimX, e.aimY, radius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ff9a6b55";
      g.beginPath();
      g.arc(e.aimX, e.aimY, radius * progress, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  for (let h of hazards) {
    g.fillStyle = "#ff8d6844";
    g.beginPath();
    g.arc(h.x, h.y, h.r, 0, 7);
    g.fill();
  }
  for (let b of bolts) {
    g.shadowColor = b.color;
    g.shadowBlur = 15;
    g.fillStyle = b.color;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, 7);
    g.fill();
    g.shadowBlur = 0;
  }
  for (let l of loot) {
    g.shadowBlur = 22;
    g.shadowColor = l.color;
    diamond(l.x, l.y, 12, 18, l.color);
    g.shadowBlur = 0;
  }
  function warrior(x, y, r, body, face, kind, phase) {
    g.save();
    g.translate(x, y);
    let bob = Math.sin(t * 5 + phase) * 2;
    g.translate(0, bob);
    g.fillStyle = "#07111dcc";
    g.beginPath();
    g.ellipse(0, 12, r * 1.45, r * 0.62, 0, 0, 7);
    g.fill();
    g.strokeStyle =
      kind === "hero"
        ? "#a3f3ef77"
        : kind === "boss"
          ? "#ff8c6977"
          : "#b99dcb44";
    g.lineWidth = 2;
    g.stroke();
    g.shadowColor = body;
    g.shadowBlur = kind === "hero" ? 16 : kind === "boss" ? 22 : 6;
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-r * 0.85, -r * 0.2);
    g.lineTo(-r * 0.55, -r * 1.65);
    g.lineTo(r * 0.55, -r * 1.65);
    g.lineTo(r * 0.85, -r * 0.2);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#101a2a";
    g.fillRect(-r * 0.65, -r * 0.15, r * 0.48, r * 0.75);
    g.fillRect(r * 0.17, -r * 0.15, r * 0.48, r * 0.75);
    g.fillStyle = kind === "hero" ? "#f1d59a" : "#8f718f";
    g.fillRect(-r * 0.75, -r * 1.38, r * 0.27, r * 0.6);
    g.fillRect(r * 0.48, -r * 1.38, r * 0.27, r * 0.6);
    g.strokeStyle = kind === "hero" ? "#8ce6ee" : "#bb819c";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r * 0.42, -r * 0.55);
    g.lineTo(r * 0.42, -r * 0.55);
    g.stroke();
    g.fillStyle = "#d9b78e";
    g.beginPath();
    g.arc(0, -r * 1.77, r * 0.48, 0, 7);
    g.fill();
    g.fillStyle = face;
    g.beginPath();
    g.moveTo(-r * 0.6, -r * 1.95);
    g.lineTo(0, -r * 2.45);
    g.lineTo(r * 0.6, -r * 1.95);
    g.lineTo(r * 0.5, -r * 1.65);
    g.lineTo(-r * 0.5, -r * 1.65);
    g.fill();
    g.shadowColor = kind === "hero" ? "#7ef2f9" : "#ff9a8a";
    g.shadowBlur = 7;
    g.fillStyle = kind === "hero" ? "#aafaff" : "#ffb5a5";
    g.fillRect(-r * 0.29, -r * 1.83, r * 0.18, 3);
    g.fillRect(r * 0.12, -r * 1.83, r * 0.18, 3);
    g.shadowBlur = 0;
    g.strokeStyle = kind === "archer" ? "#a1f0c5" : "#f5d49c";
    g.lineWidth = 4;
    if (kind === "archer") {
      g.beginPath();
      g.arc(r * 0.7, -r * 1.35, r * 0.85, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(r * 0.7, -r * 2.2);
      g.lineTo(r * 0.7, -r * 0.5);
      g.stroke();
    } else if (kind === "brute" || kind === "boss") {
      g.beginPath();
      g.moveTo(r * 0.8, 0);
      g.lineTo(r * 0.8, -r * 2.3);
      g.stroke();
      g.fillStyle = "#b6a79b";
      g.fillRect(r * 0.25, -r * 2.5, r * 1.2, r * 0.65);
      g.fillStyle = body;
      g.fillRect(-r * 1.15, -r * 1.6, r * 0.6, r * 0.7);
      g.fillRect(r * 0.55, -r * 1.6, r * 0.6, r * 0.7);
    } else {
      for (const side of kind === "stalker" ? [-1, 1] : [1]) {
        g.beginPath();
        g.moveTo(side * r * 0.8, -r * 0.7);
        g.lineTo(side * r * 1.3, -r * 2);
        g.stroke();
      }
    }
    if (kind === "boss") {
      g.strokeStyle = "#ff835c";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, -r * 0.9, r * 1.45, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
  for (let e of enemies) {
    let col =
      e.hit > 0
        ? "#fff2cc"
        : e.boss
          ? "#b76548"
          : e.type === "archer"
            ? "#4eaa83"
            : e.type === "brute"
              ? "#b48c5c"
              : "#9b6bcd";
    warrior(
      e.x,
      e.y,
      e.r,
      col,
      e.boss ? "#4b2036" : "#41293f",
      e.type,
      e.phase,
    );
    if (e.boss && e.recover > 0) {
      g.fillStyle = "#a5f4c0";
      g.font = "bold 18px system-ui";
      g.textAlign = "center";
      g.fillText("ATTAQUE !", e.x, e.y - e.r * 3.6);
    }
    if (e.hp < e.max) {
      g.fillStyle = "#210d20";
      g.fillRect(e.x - e.r, e.y - e.r * 3.1, e.r * 2, 5);
      g.fillStyle = "#e66d80";
      g.fillRect(e.x - e.r, e.y - e.r * 3.1, (e.r * 2 * e.hp) / e.max, 5);
    }
  }
  let color =
    hero.cls === "Mage"
      ? "#56a7da"
      : hero.cls === "Assassin"
        ? "#8660b8"
        : "#b59b65";
  warrior(
    hero.x,
    hero.y,
    25,
    heroFlash > 0 ? "#fff2dc" : color,
    hero.cls === "Mage"
      ? "#1b446a"
      : hero.cls === "Assassin"
        ? "#33264d"
        : "#604a34",
    "hero",
    0,
  );
  if (invuln > 0) {
    g.strokeStyle = "#a0e8ff";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(hero.x, hero.y + 8, 32, 20, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (const p of impactParticles) {
    g.globalAlpha = p.life / p.max;
    g.fillStyle = p.color;
    g.fillRect(p.x - 2, p.y - 18, 4, 7);
  }
  g.globalAlpha = 1;
  for (let s of slashes) {
    g.strokeStyle = s.color;
    g.shadowColor = s.color;
    g.shadowBlur = 24;
    g.lineWidth = s.combo === 4 ? 9 : 7;
    g.globalAlpha = s.life / s.max;
    g.beginPath();
    if (s.combo === 4)
      g.arc(s.x, s.y, s.r * (1 - (s.life / s.max) * 0.35), 0, 7);
    else
      g.arc(
        s.x,
        s.y - 10,
        s.r * 0.8,
        (s.angle ?? (s.dir === 1 ? 0 : Math.PI)) - 0.95,
        (s.angle ?? (s.dir === 1 ? 0 : Math.PI)) + 1.15,
      );
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
  for (let p of sparks) {
    g.globalAlpha = clamp(p.life * 2, 0, 1);
    g.fillStyle = p.color;
    g.font = "bold 24px system-ui";
    g.textAlign = "center";
    g.fillText(p.text, p.x, p.y - 45 + (1 - p.life) * -35);
    g.globalAlpha = 1;
  }
  g.restore();
  g.fillStyle = "#fff9";
  g.font = "12px system-ui";
  g.textAlign = "center";
  g.fillText("", W / 2, H - 8);
  drawRadar();
}
let last = performance.now();
function frame(now) {
  // Small simulation steps preserve movement speed at low frame rates and
  // prevent projectiles from skipping collisions during a long frame.
  let dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  while (dt > 0) {
    const step = Math.min(dt, 1 / 60);
    update(step);
    dt -= step;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
showResume();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPaused(true);
});
window.addEventListener("pagehide", saveGame);
const ECLIPSE_VERSION = 16;
let availableVersion = ECLIPSE_VERSION;
async function checkForUpdate(manual = false) {
  const btn = document.getElementById("checkUpdate");
  if (manual) {
    btn.disabled = true;
    btn.textContent = "Vérification…";
  }
  try {
    const res = await fetch("./version.json?check=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const info = await res.json();
    const next = Number(info.version);
    if (Number.isFinite(next) && next > availableVersion) {
      availableVersion = next;
      document.getElementById("updateNotes").textContent =
        info.notes || "Une nouvelle version est prête.";
      document.getElementById("updateBanner").style.display = "block";
    } else if (manual) {
      toast(
        availableVersion > ECLIPSE_VERSION
          ? "Mise à jour disponible : utilise le bouton ci-dessus."
          : "ECLIPSE est à jour · v0." + ECLIPSE_VERSION,
      );
    }
  } catch (e) {
    if (manual) toast("Connexion indisponible : réessaie");
  } finally {
    if (manual) {
      btn.disabled = false;
      btn.textContent = "↻ Vérifier";
    }
  }
}
document.getElementById("updateNow").addEventListener("click", () => {
  if (
    running &&
    !saveGame() &&
    !confirm(
      "La sauvegarde est indisponible. Relancer quand même et perdre les dernières actions ?",
    )
  )
    return;
  const u = new URL(location.href);
  u.searchParams.set("v", String(availableVersion));
  location.replace(u.href);
});
document
  .getElementById("checkUpdate")
  .addEventListener("click", () => checkForUpdate(true));
checkForUpdate();
setInterval(checkForUpdate, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkForUpdate();
});
// The modal freezes combat. A selection is consumed synchronously before
// advancing, so double taps cannot grant multiple rewards for one room.
function showRewards() {
  rewardOpen = true;
  document.getElementById("hud").inert = true;
  clearInput();
  document.getElementById("rewardOverlay").hidden = false;
  document.getElementById("rewardTitle").textContent =
    room % 5 === 0 ? "Gardien vaincu !" : "Salle " + room + " terminée !";
  document.getElementById("rewardSummary").textContent =
    "Choisis un bonus pour cette aventure. " +
    loot.length +
    " objet" +
    (loot.length === 1 ? "" : "s") +
    " à récupérer.";
  document.getElementById("mightPreview").textContent =
    "Dégâts : +" +
    blessingRank("might") * 8 +
    " % → +" +
    (blessingRank("might") + 1) * 8 +
    " %";
  document.getElementById("vitalityPreview").textContent =
    "Vie max : " + hero.max + " → " + (hero.max + 20);
  document.getElementById("focusPreview").textContent =
    "Mana : " + manaRecovery() + "/s → " + (manaRecovery() + 1) + "/s";
  document.getElementById("rewardMight").focus();
}
function nextRoom() {
  if (!canPlay() || enemies.length !== 0) return;
  showRewards();
  saveGame();
}
function chooseBlessing(id) {
  if (
    !running ||
    paused ||
    bagOpen ||
    document.hidden ||
    !rewardOpen ||
    enemies.length !== 0 ||
    !BLESSINGS.includes(id)
  )
    return;
  rewardOpen = false;
  document.getElementById("hud").inert = false;
  document.getElementById("rewardOverlay").hidden = true;
  hero.blessings = hero.blessings || { might: 0, vitality: 0, focus: 0 };
  hero.blessings[id]++;
  if (id === "vitality") {
    hero.max += 20;
    hero.hp = Math.min(hero.max, hero.hp + 20);
  }
  sfx("level");
  advanceRoom();
  document.getElementById("pauseButton").focus();
}
function closeRewards() {
  if (!rewardOpen || paused) return;
  rewardOpen = false;
  document.getElementById("hud").inert = false;
  document.getElementById("rewardOverlay").hidden = true;
  clearInput();
  saveGame();
  document.getElementById("nextRoom").focus();
}
function advanceRoom() {
  for (const l of loot) items.push(l);
  loot = [];
  room++;
  clearInput();
  spawn();
  document.getElementById("nextRoom").hidden = true;
  saveGame();
  if (room % 5 === 0) sfx("boss");
  toast(room % 5 === 0 ? "BOSS !" : "Salle " + room + " · Butin récupéré");
}
document.getElementById("nextRoom").addEventListener("click", nextRoom);
for (const [id, key] of [
  ["rewardMight", "might"],
  ["rewardVitality", "vitality"],
  ["rewardFocus", "focus"],
])
  document
    .getElementById(id)
    .addEventListener("click", () => chooseBlessing(key));
document.getElementById("rewardBack").addEventListener("click", closeRewards);
document
  .getElementById("rewardOverlay")
  .addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || paused) return;
    const ids = ["rewardMight", "rewardVitality", "rewardFocus", "rewardBack"];
    const current = ids.indexOf(document.activeElement.id);
    event.preventDefault();
    document
      .getElementById(
        ids[(current + (event.shiftKey ? -1 : 1) + ids.length) % ids.length],
      )
      .focus();
  });
document
  .getElementById("pauseButton")
  .addEventListener("click", () => setPaused(true));
document
  .getElementById("resumeButton")
  .addEventListener("click", () => setPaused(false));

function drawRadar() {
  const width = 96,
    height = 72,
    x = 12,
    y = innerHeight < 500 ? 122 : 154;
  g.save();
  g.fillStyle = "#101b30d9";
  g.fillRect(x, y, width, height);
  g.strokeStyle = "#7894b277";
  g.strokeRect(x, y, width, height);
  const point = (px, py, color, r) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(
      x + width / 2 + (px / 1000) * width,
      y + height / 2 + (py / 800) * height,
      r,
      0,
      Math.PI * 2,
    );
    g.fill();
  };
  for (const l of loot) point(l.x, l.y, l.color, 2);
  for (const e of enemies)
    point(e.x, e.y, e.boss ? "#ffb15e" : "#ff8199", e.boss ? 4 : 2.5);
  point(hero.x, hero.y, "#8ffff1", 3);
  g.font = "10px system-ui";
  g.textAlign = "left";
  g.fillStyle = "#d8e5f7";
  g.fillText(
    enemies.length + " ennemi" + (enemies.length === 1 ? "" : "s"),
    x,
    y + height + 13,
  );
  g.restore();
}
