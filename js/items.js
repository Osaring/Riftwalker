// =====================================================================
// ÉQUIPEMENT façon WoW : emplacements, raretés, statistiques, et apparence visible sur le héros
// =====================================================================
import { R } from './util.js';

export const SLOTS = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'mainhand', 'offhand'];
export const SLOT_NAME = { head: 'Tête', shoulders: 'Épaules', chest: 'Torse', hands: 'Mains', legs: 'Jambes', feet: 'Pieds', mainhand: 'Arme', offhand: 'Bouclier' };
export const RARITY = [
  { name: 'Médiocre', color: '#9d9d9d', mult: 0.8 },
  { name: 'Commun', color: '#ffffff', mult: 1 },
  { name: 'Inhabituel', color: '#1eff00', mult: 1.25 },
  { name: 'Rare', color: '#0070dd', mult: 1.55 },
  { name: 'Épique', color: '#a335ee', mult: 1.95 },
  { name: 'Légendaire', color: '#ff8000', mult: 2.5 },
];
export const STAT_NAME = { str: 'Force', sta: 'Endurance', armor: 'Armure', crit: 'Critique', haste: 'Hâte' };

// Apparences par emplacement, de la plus modeste à la plus prestigieuse.
// part = pièce 3D ; tex = variante de couleur ; tint = teinte ; metal = reflets métalliques
const LOOKS = {
  head: [
    [{ part: 'Ranger_Head_Hood', name: 'Capuche' }],
    [{ part: 'Knight_Head_Armet', name: 'Heaume', metal: true }, { part: 'Ranger_Head_Hood', name: 'Capuche', tint: 0x9a8aa8 }],
    [{ part: 'Knight_Head_Armet', name: 'Heaume', metal: true, tex: 'T_Knight_2_BaseColor' }, { part: 'Knight_Head_Horns', name: 'Casque à cornes', metal: true }],
    [{ part: 'Knight_Head_Horns', name: 'Casque à cornes', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Head_Crown', name: 'Couronne', metal: true }],
    [{ part: 'Noble_Head_Crown', name: 'Couronne', metal: true, tex: 'T_Noble_3_BaseColor'}],
  ],
  shoulders: [
    [{ part: 'Ranger_Acc_Pauldron', name: 'Spalière' }],
    [{ part: 'Knight_Acc_Pauldron_Round', name: 'Épaulières', metal: true }],
    [{ part: 'Knight_Acc_Pauldron_Spike', name: 'Épaulières à pointes', metal: true }, { part: 'Noble_Acc_Pauldron', name: 'Épaulières', metal: true }],
    [{ part: 'Knight_Acc_Pauldron_Spike', name: 'Épaulières à pointes', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Acc_Pauldron_Lion', name: 'Épaulières du lion', metal: true }],
    [{ part: 'Noble_Acc_Pauldron_Lion', name: 'Épaulières du lion', metal: true, tex: 'T_Noble_3_BaseColor'}],
  ],
  chest: [
    [{ part: 'Peasant_Body', name: 'Tunique' }, { part: 'Wizard_Body', name: 'Robe' }],
    [{ part: 'Ranger_Body', name: 'Brigandine' }, { part: 'Knight_Body_Cloth', name: 'Gambison' }],
    [{ part: 'Knight_Body_Armor', name: 'Cuirasse', metal: true }, { part: 'Knight_Body_Cloth', name: 'Gambison', tex: 'T_Knight_2_BaseColor' }],
    [{ part: 'Knight_Body_Armor', name: 'Cuirasse', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Body', name: 'Pourpoint', tex: 'T_Noble_2_BaseColor' }],
    [{ part: 'Knight_Body_Armor', name: 'Cuirasse', metal: true, tex: 'T_Knight_2_BaseColor'}, { part: 'Noble_Body', name: 'Pourpoint royal', tex: 'T_Noble_3_BaseColor'}],
  ],
  hands: [
    [{ part: 'Peasant_Arms', name: 'Manches' }, { part: 'Wizard_Arms', name: 'Manches' }],
    [{ part: 'Ranger_Arms', name: 'Brassards' }],
    [{ part: 'Knight_Arms', name: 'Gantelets', metal: true }],
    [{ part: 'Knight_Arms', name: 'Gantelets', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Arms', name: 'Gants', tex: 'T_Noble_2_BaseColor' }],
    [{ part: 'Knight_Arms', name: 'Gantelets', metal: true, tex: 'T_Knight_2_BaseColor'}],
  ],
  legs: [
    [{ part: 'Peasant_Legs', name: 'Braies' }, { part: 'Wizard_Legs', name: 'Chausses' }],
    [{ part: 'Ranger_Legs', name: 'Jambières de cuir' }],
    [{ part: 'Knight_Legs_Armor', name: 'Jambières', metal: true }, { part: 'Noble_Legs', name: 'Chausses' }],
    [{ part: 'Knight_Legs_Armor', name: 'Jambières', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Legs', name: 'Chausses', tex: 'T_Noble_2_BaseColor' }],
    [{ part: 'Knight_Legs_Armor', name: 'Jambières', metal: true, tex: 'T_Knight_2_BaseColor'}],
  ],
  feet: [
    [{ part: 'Peasant_Feet', name: 'Souliers' }, { part: 'Wizard_Feet', name: 'Sandales' }],
    [{ part: 'Ranger_Feet_Boots', name: 'Bottes' }],
    [{ part: 'Knight_Feet_Armor', name: 'Solerets', metal: true }, { part: 'Noble_Feet', name: 'Bottes' }],
    [{ part: 'Knight_Feet_Armor', name: 'Solerets', metal: true, tex: 'T_Knight_3_BaseColor' }, { part: 'Noble_Feet', name: 'Bottes', tex: 'T_Noble_2_BaseColor' }],
    [{ part: 'Knight_Feet_Armor', name: 'Solerets', metal: true, tex: 'T_Knight_2_BaseColor'}],
  ],
};
// armes : type -> pièce 3D, dégâts et vitesse
export const WEAPONS = {
  sword: { part: 'W_Sword_Bronze', name: 'Épée', dmg: 1, speed: 1 },
  axe: { part: 'W_Axe_Bronze', name: 'Hache', dmg: 1.12, speed: 0.92 },
  dagger: { part: 'W_Dagger_Bronze', name: 'Dague', dmg: 0.78, speed: 1.3 },
  hammer: { part: 'W_Hammer_Medium_Bronze', name: 'Marteau', dmg: 1.2, speed: 0.86 },
  greataxe: { part: 'W_Axe_Double_Bronze', name: 'Hache double', dmg: 1.35, speed: 0.78 },
  maul: { part: 'W_Hammer_Large_Bronze', name: 'Masse', dmg: 1.45, speed: 0.72 },
};
// teinte du métal des armes selon la rareté (bronze → acier → mithril → or)
const METAL = [0x9a7a5a, 0xc8b8a8, 0xdfe6f0, 0xb8d4ff, 0xe0b8ff, 0xffd27a];
const GLOW = [null, null, null, 0x3a8aff, 0xb050ff, 0xff8a20];

const PREFIX = ['Robuste', 'Ancien', 'Maudit', 'Béni', 'Sinistre', 'Ardent', 'Glacial', 'Sombre', 'Vaillant', 'Funeste'];
const SUFFIX = { str: "de l'Ours", sta: 'du Bastion', crit: 'du Faucon', haste: 'du Vent', armor: 'de la Tortue' };
// Objets légendaires : chacun a un POUVOIR unique qui change la façon de jouer (comme dans Diablo)
export const LEGENDARIES = {
  mainhand: [
    { id: 'ashbringer', name: 'Cendre-Éternelle', power: 'Tes coups enflamment les ennemis : +30 % des dégâts en brûlure sur 3 s.' },
    { id: 'riftbreaker', name: 'Brise-Faille', power: 'Chaque 3e coup de ton enchaînement libère une onde de choc autour de toi.' },
  ],
  chest: [{ id: 'voidwhisper', name: 'Murmure du Néant', power: 'Chaque Parade réussie te rend 10 % de ta vie.' }],
  head: [{ id: 'thorncrown', name: "Couronne d'Épines", power: 'Renvoie 40 % des dégâts de mêlée reçus à l\'attaquant.' }],
  shoulders: [{ id: 'scourge', name: 'Porte-Fléau', power: 'Tuer un ennemi avec Exécution recharge la Charge et le Bond héroïque.' }],
  offhand: [{ id: 'azerothtear', name: "Larme d'Azeroth", power: 'Bloquer ou parer un coup lance une décharge qui étourdit les ennemis proches.' }],
  feet: [{ id: 'wanderer', name: 'Pas du Vagabond', power: 'La roulade laisse une traînée de feu derrière toi.' }],
  hands: [{ id: 'titangrip', name: 'Poigne du Titan', power: 'Le Bond héroïque peut être utilisé 2 fois de suite.' }],
  legs: [{ id: 'bloodlust', name: 'Jambières sanguinaires', power: 'Tuer un ennemi donne +25 % de vitesse d\'attaque pendant 4 s.' }],
};
// Ensembles : porter plusieurs pièces du même ensemble donne des bonus (comme dans WoW)
export const SETS = {
  warlord: { name: 'Seigneur de guerre', slots: ['head', 'shoulders', 'chest', 'hands', 'legs'], look: 'T_Knight_3_BaseColor',
    bonus: [[2, '+10 % de dégâts'], [4, 'Frappe mortelle, Tourbillon et Exécution coûtent 10 rage de moins, +10 % de critique']] },
  dawn: { name: "Rempart de l'Aube", slots: ['head', 'shoulders', 'chest', 'legs', 'feet'], look: 'T_Knight_2_BaseColor',
    bonus: [[2, '+20 % d\'armure'], [4, 'Une Parade réussie libère une onde qui étourdit tout autour 2 s']] },
};
export function setCounts(equip) {
  const c = {};
  for (const s of SLOTS) { const it = equip[s]; if (it && it.set) c[it.set] = (c[it.set] || 0) + 1; }
  return c;
}
export function legendaryPowers(equip) {
  const p = new Set();
  for (const s of SLOTS) { const it = equip[s]; if (it && it.legend) p.add(it.legend); }
  return p;
}

export function rollRarity(bonus = 0) {
  const x = R() * 100 - bonus;
  if (x < 1.2) return 5; if (x < 5) return 4; if (x < 15) return 3; if (x < 38) return 2; if (x < 80) return 1; return 0;
}
let uid = Date.now() % 100000;
export function makeItem(slot, ilvl, rarity) {
  const tier = Math.min(4, Math.max(0, Math.floor(rarity * 0.75 + ilvl / 12 + R() * 0.8) - (rarity <= 1 ? 1 : 0)));
  const it = { id: ++uid, slot, ilvl, rarity, stats: {} };
  const budget = Math.round((4 + ilvl * 1.6) * RARITY[rarity].mult);
  if (slot === 'mainhand') {
    const types = Object.keys(WEAPONS);
    it.wtype = types[Math.floor(R() * types.length)];
    const W = WEAPONS[it.wtype];
    it.dmg = Math.round((6 + ilvl * 2.2) * RARITY[rarity].mult * W.dmg);
    it.speed = W.speed;
    it.look = { part: W.part, tint: METAL[rarity], glow: GLOW[rarity] };
    it.base = W.name;
  } else if (slot === 'offhand') {
    it.look = rarity >= 3 ? { part: 'W_Shield_Badge', scale: 0.62, rot: [0, 0, 0], tint: rarity >= 4 ? 0xe8c8ff : 0xffffff, glow: GLOW[rarity] } : { part: 'W_Shield_Wooden', tint: METAL[rarity] };
    it.stats.armor = Math.round(budget * 0.9);
    it.base = rarity >= 3 ? 'Écu' : 'Bouclier';
  } else {
    const opts = LOOKS[slot][tier];
    const L = opts[Math.floor(R() * opts.length)];
    it.look = { ...L };
    if (rarity >= 4) it.look.glow = GLOW[rarity]; // les objets épiques et légendaires luisent légèrement
    it.base = L.name;
    it.stats.armor = Math.round(budget * ({ chest: 1, legs: 0.8, head: 0.7, shoulders: 0.6, hands: 0.5, feet: 0.5 }[slot]));
  }
  // statistiques secondaires
  const pool = ['str', 'sta', 'crit', 'haste'];
  const nStats = Math.min(3, 1 + Math.floor(rarity / 2));
  let main = null;
  for (let i = 0; i < nStats; i++) {
    const s = pool.splice(Math.floor(R() * pool.length), 1)[0];
    if (!main) main = s;
    const v = s === 'crit' || s === 'haste' ? Math.max(1, Math.round(budget * 0.12 * (0.7 + R() * 0.6))) : Math.max(1, Math.round(budget * 0.35 * (0.7 + R() * 0.6)));
    it.stats[s] = v;
  }
  // pièce d'ensemble (objets épiques, 35 % de chances si l'emplacement fait partie d'un ensemble)
  if (rarity === 4 && R() < 0.35) {
    const sets = Object.entries(SETS).filter(([, v]) => v.slots.includes(slot));
    if (sets.length) {
      const [k, S] = sets[Math.floor(R() * sets.length)];
      it.set = k; it.look = { ...it.look, tex: S.look, metal: true };
      if (/Peasant|Wizard|Ranger/.test(it.look.part || '')) it.look.part = { head: 'Knight_Head_Horns', shoulders: 'Knight_Acc_Pauldron_Spike', chest: 'Knight_Body_Armor', hands: 'Knight_Arms', legs: 'Knight_Legs_Armor', feet: 'Knight_Feet_Armor' }[slot] || it.look.part;
      it.name = `${it.base} du ${S.name}`.replace('du Rempart', 'du Rempart');
      if (k === 'dawn') it.name = `${it.base} du Rempart de l'Aube`;
    }
  }
  if (rarity === 5) {
    const L = LEGENDARIES[slot];
    const pick = L[Math.floor(R() * L.length)];
    it.legend = pick.id; it.power = pick.power;
  }
  if (it.set) { /* nom déjà donné */ } else
  it.name = rarity === 5 ? LEGENDARIES[slot].find((l) => l.id === it.legend).name
    : rarity >= 3 ? `${it.base} ${PREFIX[Math.floor(R() * PREFIX.length)].toLowerCase()} ${SUFFIX[main]}`
    : rarity === 2 ? `${it.base} ${SUFFIX[main]}` : it.base;
  if (rarity === 0) it.name = it.base + ' usé' + (/e$/.test(it.base) ? 'e' : '');
  it.value = Math.round((5 + ilvl * 3) * (1 + rarity * rarity * 0.6));
  return it;
}
export function randomDrop(ilvl, bonus = 0) {
  const slot = SLOTS[Math.floor(R() * SLOTS.length)];
  return makeItem(slot, ilvl, rollRarity(bonus));
}
// équipement de départ
export function starterGear() {
  const g = {};
  g.mainhand = makeItem('mainhand', 1, 1); g.mainhand.wtype = 'sword'; g.mainhand.look = { part: WEAPONS.sword.part, tint: METAL[1] }; g.mainhand.name = 'Épée de recrue'; g.mainhand.base = 'Épée'; g.mainhand.speed = 1; g.mainhand.dmg = 8; g.mainhand.stats = { str: 1 };
  g.offhand = makeItem('offhand', 1, 1); g.offhand.name = 'Bouclier de recrue';
  g.chest = makeItem('chest', 1, 1); g.chest.look = { part: 'Peasant_Body', name: 'Tunique' }; g.chest.name = 'Tunique de recrue';
  return g;
}
// apparence complète à partir de l'équipement porté
export function looksOf(equip) {
  const L = {};
  for (const s of SLOTS) if (equip[s]) L[s] = equip[s].look;
  return L;
}
// score simple pour comparer deux objets (flèche verte / rouge dans l'inventaire)
export function itemScore(it) {
  if (!it) return 0;
  const s = it.stats;
  return (it.dmg || 0) * 2.2 * (it.speed || 1) + (s.armor || 0) * 0.6 + (s.str || 0) * 1.6 + (s.sta || 0) * 1.4 + (s.crit || 0) * 3 + (s.haste || 0) * 2.6 + (it.legend ? 40 : 0) + (it.set ? 10 : 0);
}
