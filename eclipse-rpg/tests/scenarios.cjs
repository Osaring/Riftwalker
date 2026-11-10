module.exports = function verifyGame() {
  const results = [];
  function check(name, test) {
    if (!test) throw new Error(name);
    results.push(name);
  }
  start("Guerrier");
  check("fresh game starts", running && room === 1 && hero.hp === 100);
  const b = stick.getBoundingClientRect();
  moveStick({ clientX: b.left + b.width, clientY: b.top + b.height / 2 });
  const horizontal = jo.x;
  moveStick({ clientX: b.left + b.width / 2, clientY: b.top + b.height });
  check(
    "joystick axes have equal strength",
    Math.abs(horizontal - jo.y) < 1e-9,
  );
  enemies = [];
  hero.x = hero.y = 0;
  jo = { x: 1, y: 0 };
  update(0.1);
  const horizontalDistance = hero.x;
  hero.x = hero.y = 0;
  jo = { x: 0, y: 1 };
  update(0.1);
  check(
    "equal visible speed in both axes",
    Math.abs(hero.y * WORLD_Y_SCALE - horizontalDistance) < 1e-8,
  );
  hero.x = hero.y = 0;
  dodge = 0;
  evade();
  check("vertical dodge has no horizontal drift", hero.x === 0 && hero.y > 0);
  dodge = 0;
  hero.x = hero.y = 0;
  reset();
  keys = { q: true };
  evade();
  check("AZERTY keyboard dodge follows movement", hero.x < 0 && hero.y === 0);
  clearInput();
  toggleBag();
  const snapshot = JSON.stringify({ hero, atk, skill, dodge });
  jo = { x: 1, y: 1 };
  update(1);
  attack();
  cast();
  evade();
  check(
    "inventory pauses movement combat and cooldowns",
    snapshot === JSON.stringify({ hero, atk, skill, dodge }),
  );
  toggleBag();
  check("closing inventory resets input", jo.x === 0 && jo.y === 0 && !held);
  setPaused(true);
  const px = hero.x;
  keys = { d: true };
  update(1);
  check("explicit pause freezes simulation", hero.x === px);
  setPaused(false);
  check("resume clears stuck keys", Object.keys(keys).length === 0);
  // A defeated enemy with an attack about to resolve must not hit back.
  hero.hp = 100;
  enemies = [
    {
      x: hero.x,
      y: hero.y,
      hp: 0,
      max: 10,
      boss: false,
      type: "brute",
      spd: 0,
      hit: 0,
      phase: 0,
      r: 26,
      cool: 0,
      wind: 0.001,
      aimX: hero.x,
      aimY: hero.y,
    },
  ];
  hazards = [];
  bolts = [];
  update(0.2);
  check(
    "dead enemies cannot resolve attacks",
    hero.hp === 100 && hazards.length === 0 && enemies.length === 0,
  );
  loot = [];
  const previousRoom = room;
  update(0.1);
  check(
    "cleared room waits for player",
    room === previousRoom && !document.getElementById("nextRoom").hidden,
  );
  drop(100, 100);
  const oldItemCount = items.length;
  nextRoom();
  chooseBlessing("might");
  check(
    "next room collects remaining loot",
    room === previousRoom + 1 &&
      items.length === oldItemCount + 1 &&
      enemies.length > 0,
  );
  hero.equipped.weapon = items.find((l) => l.slot === "weapon")?.id || null;
  syncEquipment();
  skill = 2;
  atk = 0.2;
  dodge = 1;
  bolts = [
    {
      x: 10,
      y: 10,
      r: 9,
      life: 2,
      damage: 19,
      vx: 100,
      vy: 0,
      color: "#e8a4f8",
    },
  ];
  saveGame();
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
  check("current save validates", !!readSave());
  hero.x = 333;
  resumeGame();
  check(
    "resume restores position and active combat",
    hero.x === saved.hero.x && skill === 2 && dodge === 1 && bolts.length === 1,
  );
  hero.equipped.weapon = null;
  saveGame();
  resumeGame();
  check(
    "intentionally unequipped weapon stays unequipped",
    hero.equipped.weapon === null && hero.weapon === 1,
  );
  const old = JSON.parse(JSON.stringify(saved));
  delete old.hero.blessings;
  delete old.rewardOpen;
  delete old.combat;
  delete old.bolts;
  delete old.hazards;
  localStorage.setItem(SAVE_KEY, JSON.stringify(old));
  check("v0.13 save remains compatible", !!readSave());
  resumeGame();
  check(
    "old save resumes without transient effects",
    running && bolts.length === 0 && skill === 0,
  );
  const bad = JSON.parse(JSON.stringify(old));
  bad.hero.x = "broken";
  localStorage.setItem(SAVE_KEY, JSON.stringify(bad));
  check("malformed save is rejected", readSave() === null);
  localStorage.setItem(SAVE_KEY, JSON.stringify(old));
  window.confirm = () => false;
  const previousHero = hero;
  start("Mage");
  check(
    "new game does not overwrite without confirmation",
    hero === previousHero && !!readSave(),
  );
  window.confirm = () => true;
  start("Mage");
  check(
    "new game clears previous cooldowns and overlays",
    atk === 0 && skill === 0 && dodge === 0 && !paused && !bagOpen,
  );
  hero.hp = 0;
  enemies = [];
  loot = [];
  const deathRoom = room;
  update(0.1);
  check(
    "death cannot transition or revive",
    !running &&
      hero.hp === 0 &&
      room === deathRoom &&
      localStorage.getItem(SAVE_KEY) === null,
  );
  check("canvas resolution is capped for mobile", C.width === innerWidth * 2);
  const originalDraw = draw;
  draw = () => {};
  start("Guerrier");
  enemies = [];
  loot = [];
  jo = { x: 1, y: 0 };
  hero.x = 0;
  last = 1000;
  frame(1100);
  check(
    "low frame rate preserves movement speed",
    Math.abs(hero.x - 28.5) < 1e-8,
  );
  hero.x = 0;
  last = 1000;
  for (let i = 1; i <= 60; i++) frame(1000 + (i * 1000) / 60);
  check(
    "60 FPS movement covers expected distance",
    Math.abs(hero.x - 285) < 1e-8,
  );
  draw = originalDraw;
  start("Guerrier");
  clearInput();
  room = 5;
  spawn();
  const boss = enemies[0];
  boss.x = 0;
  boss.y = -120;
  hero.x = 0;
  hero.y = 0;
  beginWind(boss);
  const locked = { x: boss.aimX, y: boss.aimY };
  hero.x = 200;
  update(0.2);
  check(
    "boss slam locks target during warning",
    boss.aimX === locked.x && boss.aimY === locked.y && hazards.length === 0,
  );
  for (let i = 0; i < 60; i++) update(1 / 60);
  check(
    "slam creates one marked hazard, no surprise volley",
    hazards.length === 1 && bolts.length === 0 && boss.recover > 0,
  );
  const bx = boss.x,
    by = boss.y;
  update(0.1);
  check(
    "boss recovery leaves an opening",
    boss.x === bx && boss.y === by && boss.recover > 0,
  );
  hazards = [];
  beginWind(boss);
  check("boss alternates slam and volley", boss.pattern === "volley");
  const angle = boss.shotAngle;
  hero.x = -200;
  resolveWind(boss);
  check(
    "volley follows the announced rays",
    bolts.length === 6 &&
      Math.abs(Math.atan2(bolts[0].vy, bolts[0].vx) - angle) < 1e-8,
  );
  bolts = [];
  boss.hp = boss.max * 0.4;
  beginWind(boss);
  resolveWind(boss);
  beginWind(boss);
  resolveWind(boss);
  check(
    "second boss phase adds two announced rays",
    boss.enraged && bolts.length === 8,
  );
  saveGame();
  resumeGame();
  check(
    "boss pattern and recovery survive save",
    enemies[0].pattern === "volley" && enemies[0].recover > 0 && !!readSave(),
  );
  hero.hp = 100;
  hero.defense = 0.5;
  invuln = 0;
  hurtHero(20);
  check(
    "damage feedback uses armor-adjusted damage",
    hero.hp === 90 && sparks.at(-1).text === "-10" && heroFlash > 0,
  );
  hurtHero(20);
  check("invulnerability prevents stacked damage", hero.hp === 90);
  start("Guerrier");
  clearInput();
  const target = enemies[0];
  enemies = [target];
  target.x = 0;
  target.y = -55;
  target.hp = target.max = 500;
  target.boss = false;
  target.type = "brute";
  impactParticles = [];
  attack();
  check(
    "attack arc points to its target",
    Math.abs(slashes.at(-1).angle + Math.PI / 2) < 1e-8,
  );
  check(
    "successful hit produces recoil and particles",
    target.y < -55 && impactParticles.length > 0,
  );
  enemies = [];
  impactParticles = [];
  atk = 0;
  attack();
  check(
    "missed attack creates no impact particles",
    impactParticles.length === 0,
  );
  for (let i = 0; i < 50; i++) impact(0, 0, "#fff", true);
  check("impact effects remain bounded", impactParticles.length <= 160);
  const pxBefore = hero.x;
  jo = { x: 1, y: 0 };
  update(0.1);
  check(
    "impact effects do not slow movement",
    Math.abs(hero.x - pxBefore - 28.5) < 1e-8,
  );
  start("Guerrier");
  nextRoom();
  check(
    "reward unavailable while enemies are alive",
    !rewardOpen && room === 1,
  );
  enemies = [];
  loot = [];
  hero.hp = 20;
  nextRoom();
  check(
    "cleared room offers three rewards before advancing",
    rewardOpen && room === 1 && !canPlay(),
  );
  const rewardSnapshot = JSON.stringify({ hero, room, atk, skill, dodge });
  jo = { x: 1, y: 0 };
  update(1);
  attack();
  cast();
  evade();
  check(
    "reward screen freezes movement and combat",
    JSON.stringify({ hero, room, atk, skill, dodge }) === rewardSnapshot,
  );
  chooseBlessing("invalid");
  check(
    "invalid reward cannot advance or grant bonus",
    room === 1 && rewardOpen && blessingRank("might") === 0,
  );
  setPaused(true);
  chooseBlessing("might");
  check(
    "paused reward cannot be selected",
    rewardOpen && blessingRank("might") === 0,
  );
  setPaused(false);
  saveGame();
  rewardOpen = false;
  resumeGame();
  check(
    "pending choice reopens after resume",
    rewardOpen && room === 1 && hero.hp === 20,
  );
  chooseBlessing("vitality");
  const roomAfterReward = room;
  chooseBlessing("vitality");
  check(
    "vitality granted once with healing and next room",
    hero.max === 120 &&
      hero.hp === 64 &&
      blessingRank("vitality") === 1 &&
      room === roomAfterReward &&
      room === 2,
  );
  saveGame();
  resumeGame();
  check(
    "vitality resume does not reapply max health",
    hero.max === 120 && blessingRank("vitality") === 1 && !rewardOpen,
  );
  enemies = [];
  loot = [];
  nextRoom();
  closeRewards();
  check(
    "back preserves room and grants nothing",
    room === 2 && !rewardOpen && blessingRank("might") === 0,
  );
  nextRoom();
  chooseBlessing("might");
  const dummy = enemies[0];
  dummy.x = hero.x + 30;
  dummy.y = hero.y;
  dummy.hp = dummy.max = 1000;
  enemies = [dummy];
  atk = 0;
  comboWindow = 0;
  attack();
  check(
    "might improves actual attack damage by eight percent",
    Math.abs(dummy.hp - (1000 - 19 * 1.08)) < 1e-8,
  );
  dummy.hp = 1000;
  skill = 0;
  hero.mp = 100;
  cast();
  check(
    "might also improves power damage",
    Math.abs(dummy.hp - (1000 - 49 * 1.08)) < 1e-8,
  );
  enemies = [];
  loot = [];
  nextRoom();
  chooseBlessing("focus");
  enemies = [];
  bolts = [];
  hazards = [];
  clearInput();
  hero.mp = 0;
  update(1);
  check(
    "energy increases actual mana recovery",
    hero.mp === 8 && blessingRank("focus") === 1,
  );
  saveGame();
  resumeGame();
  check(
    "all selected bonuses survive reload",
    blessingRank("might") === 1 &&
      blessingRank("focus") === 1 &&
      blessingRank("vitality") === 1 &&
      hero.max === 120,
  );
  const corrupt = JSON.parse(localStorage.getItem(SAVE_KEY));
  corrupt.hero.blessings.might = -1;
  localStorage.setItem(SAVE_KEY, JSON.stringify(corrupt));
  check("negative bonus save is rejected", readSave() === null);
  start("Mage");
  check(
    "new adventure resets all bonuses",
    BLESSINGS.every((k) => blessingRank(k) === 0) &&
      hero.max === 100 &&
      !rewardOpen,
  );
  const legacy = JSON.parse(localStorage.getItem(SAVE_KEY));
  delete legacy.hero.blessings;
  delete legacy.rewardOpen;
  localStorage.setItem(SAVE_KEY, JSON.stringify(legacy));
  resumeGame();
  check(
    "pre-upgrade saves resume with zero bonuses",
    BLESSINGS.every((k) => blessingRank(k) === 0) && running,
  );
  return results;
};
