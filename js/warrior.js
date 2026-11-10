// =====================================================================
// LE GUERRIER : spécialisations, compétences et talents (données uniquement).
// La logique de jeu est dans main.js, l'affichage dans ui.js.
//
// Rappel du principe (comme le guerrier de WoW) :
// - la RAGE se remplit quand on frappe et quand on encaisse, et se vide hors combat ;
// - les grosses compétences la DÉPENSENT ;
// - 3 spécialisations changent le style de jeu ;
// - à certains niveaux, on choisit 1 TALENT parmi 3 sur une ligne (modifiable à tout moment).
// =====================================================================

export const SPECS = {
  arms: {
    name: 'Armes', icon: 'i_arms',
    desc: 'Coups lents et dévastateurs. Frappe mortelle fait saigner, les critiques font plus mal.',
    passive: ['+15 % de dégâts', '+30 % de dégâts critiques', 'Compétence : Frappe mortelle'],
  },
  fury: {
    name: 'Fureur', icon: 'i_fury',
    desc: 'Rapide et sauvage. Beaucoup de rage, et chaque coup te soigne un peu.',
    passive: ["+20 % de vitesse d'attaque", '+30 % de rage générée', '4 % des dégâts infligés rendus en vie', 'Compétence : Tourbillon'],
  },
  prot: {
    name: 'Protection', icon: 'i_prot',
    desc: 'Le mur de fer. Très résistant, bloque les coups de face et étourdit au bouclier.',
    passive: ['+40 % d\'armure, +15 % de vie', '20 % de chances de bloquer un coup de face', 'Parade recharge 2 s plus vite', '−10 % de dégâts', 'Compétence : Coup de bouclier'],
  },
};

// compétences actives. aim : 'dir' (direction), 'point' (endroit au sol), null (pas de visée)
// lvl = niveau requis ; rage = coût ; cd = recharge (secondes)
export const SKILLS = {
  charge: { name: 'Charge', icon: 'i_charge', btn: 'skill1', lvl: 1, cd: 8, aim: 'dir', range: 12,
    desc: (r) => `Fonce sur l'ennemi (ou dans la direction visée) et l'étourdit ${(1 + r * 0.2).toFixed(1)} s. Génère 20 rage.` },
  mortal: { name: 'Frappe mortelle', icon: 'i_mortal', btn: 'skill2', spec: 'arms', lvl: 1, cd: 4.5, rage: 30, aim: 'dir', range: 3.2,
    desc: (r) => `Un coup énorme devant toi : ${220 + r * 25} % des dégâts, et fait saigner (${40 + r * 10} % en 4 s).` },
  whirl: { name: 'Tourbillon', icon: 'i_whirl', btn: 'skill2', spec: 'fury', lvl: 1, cd: 2.5, rage: 30, aim: null,
    desc: (r) => `Tu tournoies en frappant tout autour : 4 coups à ${80 + r * 12} % des dégâts. Tu peux bouger.` },
  shieldslam: { name: 'Coup de bouclier', icon: 'i_shieldslam', btn: 'skill2', spec: 'prot', lvl: 1, cd: 5, rage: 15, aim: 'dir', range: 2.8,
    desc: (r) => `Frappe au bouclier : ${150 + r * 20} % des dégâts + ${Math.round(0.3 * 100)} % de ton armure, étourdit ${(1.2 + r * 0.15).toFixed(1)} s.` },
  execute: { name: 'Exécution', icon: 'i_execute', btn: 'skill2', lvl: 4, cd: 1.5, rage: 20, aim: null, auto: true,
    desc: (r) => `Remplace ta compétence principale quand ta cible a moins de 20 % de vie : coup de grâce à ${300 + r * 40} % des dégâts (+ la rage en plus, jusqu'à 30).` },
  leap: { name: 'Bond héroïque', icon: 'i_leap', btn: 'skill3', lvl: 2, cd: 12, aim: 'point', range: 9,
    desc: (r) => `Bondis jusqu'à l'endroit visé ; l'atterrissage inflige ${120 + r * 20} % des dégâts autour et repousse.` },
  parry: { name: 'Parade', icon: 'i_parry', btn: 'parry', lvl: 3, cd: 6, aim: null,
    desc: (r) => `Lève ton arme pendant ${(0.55 + r * 0.05).toFixed(2)} s : le prochain coup est bloqué et tu ripostes à ${150 + r * 25} % des dégâts. Bloque aussi les projectiles.` },
  avatar: { name: 'Avatar', icon: 'i_avatar', btn: 'ult', lvl: 6, cd: 60, aim: null,
    desc: (r) => `Ultime : tu grandis et deviens un colosse pendant ${12 + r * 2} s : +${30 + r * 5} % de dégâts, insensible aux chocs, +5 rage par seconde.` },
};
export const SKILL_MAX = 5;
// compétences passives (rangs achetés avec les points)
export const PASSIVES = {
  vigor: { name: 'Vigueur', icon: 'i_heart', desc: (r) => `+${r * 6} % de vie maximum.` },
  might: { name: 'Force brute', icon: 'i_fist', desc: (r) => `+${r * 5} % de dégâts.` },
  fury: { name: 'Instinct', icon: 'i_blades', desc: (r) => `+${r * 2} % de chances de coup critique.` },
  iron: { name: 'Peau de fer', icon: 'i_armor', desc: (r) => `+${r * 8} % d'armure.` },
};

// talents : une ligne débloquée à chaque palier de niveau, on en choisit 1 sur 3
export const TALENT_ROWS = [
  { lvl: 2, opts: [
    { id: 'firecharge', name: 'Charge enflammée', icon: 'i_fire2', desc: 'La Charge laisse une traînée de feu qui brûle les ennemis.' },
    { id: 'doublecharge', name: 'Double charge', icon: 'i_charge', desc: 'La Charge peut être utilisée 2 fois de suite.' },
    { id: 'shockcharge', name: 'Charge fracassante', icon: 'i_stun', desc: "L'impact de la Charge étourdit aussi tous les ennemis autour." },
  ] },
  { lvl: 4, opts: [
    { id: 'bloodthirst', name: 'Soif de sang', icon: 'i_blood', desc: '6 % des dégâts infligés te soignent.' },
    { id: 'secondwind', name: 'Second souffle', icon: 'i_heart', desc: "Sous 30 % de vie, un bouclier absorbe 30 % de ta vie max (une fois par minute)." },
    { id: 'stoneskin', name: 'Peau de pierre', icon: 'i_armor', desc: '+20 % d\'armure et −10 % de dégâts reçus.' },
  ] },
  { lvl: 6, opts: [
    { id: 'shockwave', name: 'Onde de choc', icon: 'i_wave', desc: "L'atterrissage du Bond héroïque étourdit 1,5 s." },
    { id: 'brutalland', name: 'Atterrissage brutal', icon: 'i_leap', desc: 'Bond héroïque : +60 % de dégâts et 3 s de recharge en moins.' },
    { id: 'swiftleap', name: 'Bond éclair', icon: 'i_roll', desc: 'Après un Bond, +40 % de vitesse pendant 3 s et la roulade est rechargée.' },
  ] },
  { lvl: 9, opts: [
    { id: 'riposte', name: 'Riposte', icon: 'i_whirl', desc: 'Une Parade réussie frappe tous les ennemis autour de toi.' },
    { id: 'bladewall', name: 'Mur de lames', icon: 'i_parry', desc: 'La Parade dure 2 fois plus longtemps.' },
    { id: 'battlerage', name: 'Rage du combat', icon: 'i_shout', desc: 'Une Parade réussie donne 30 rage et recharge la Charge.' },
  ] },
  { lvl: 12, opts: [
    { id: 'longavatar', name: 'Avatar éternel', icon: 'i_avatar', desc: "L'Avatar dure 10 s de plus." },
    { id: 'executioner', name: 'Bourreau', icon: 'i_execute', desc: "L'Exécution est possible dès que la cible a moins de 35 % de vie." },
    { id: 'bladestorm', name: 'Tempête de lames', icon: 'i_fury', desc: 'Pendant l\'Avatar, chaque 3e coup déclenche un tourbillon gratuit.' },
  ] },
];

// sauvegarde : valeurs par défaut des nouveaux champs
export function warriorDefaults(S) {
  S.spec = S.spec || 'arms';
  S.talents = S.talents || {};
  const old = S.skills || {};
  const sk = { charge: 1, mortal: 1, whirl: 1, shieldslam: 1, execute: 1, leap: 1, parry: 1, avatar: 1, vigor: 0, might: 0, fury: 0, iron: 0 };
  // anciennes sauvegardes : on garde les rangs déjà achetés
  for (const k of ['charge', 'whirl', 'vigor', 'might', 'fury', 'iron']) if (old[k]) sk[k] = Math.max(sk[k], old[k]);
  S.skills = { ...sk, ...Object.fromEntries(Object.entries(old).filter(([k]) => k in sk)) };
  if (old.shout && !S._shoutRefund) { S.points += old.shout; S._shoutRefund = true; } // le Cri de guerre n'existe plus : points rendus
  delete S.skills.shout;
  return S;
}
export const hasTalent = (S, id) => Object.values(S.talents || {}).includes(id);
// compétence principale (bouton 2) selon la spécialisation
export const mainSkill = (S) => ({ arms: 'mortal', fury: 'whirl', prot: 'shieldslam' }[S.spec] || 'mortal');
