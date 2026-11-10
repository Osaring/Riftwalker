# Riftwalker

Roguelike d'action en vue du dessus façon League of Legends (Wild Rift) pour iPhone (site web jouable hors ligne), dans des donjons générés à chaque partie.

**Jouer :** https://osaring.github.io/riftwalker/ puis, dans Safari, Partager → « Sur l'écran d'accueil ».

## Version 2 (refonte complète)
- Caméra haute et fixe façon LoL : joystick à gauche, attaque et compétences à droite ; les murs deviennent transparents quand ils cachent le héros
- Guerrier : combo de 3 coups, Charge, Tourbillon, Cri de guerre, roulade d'esquive, potions, rage
- Héros et monstres aux proportions réalistes, animations mélangées (les jambes courent pendant que les bras frappent)
- Équipement façon WoW : 8 emplacements, 6 raretés, statistiques, et **chaque pièce change l'apparence du héros**
- Niveaux, points de compétence, marchand (potions, coffres), on garde tout à la mort
- Niveaux générés : salles aux vraies formes (nefs à piliers, rotondes, croix, grottes), couloirs qui serpentent et montent/descendent
- Trois ambiances qui alternent tous les deux étages : Crypte, Grottes de cristal, Ruines englouties
- Seigneur des Failles à vaincre pour ouvrir le portail de l'étage suivant
- Musique et bruitages fabriqués par le téléphone

L'ancienne version (v1) est conservée dans la branche `ancienne-version`.

## Crédits
- Personnages, tenues, animations, décors : Quaternius — Universal Base Characters, Modular Character Outfits Fantasy, Universal Animation Library 1 & 2, Modular Dungeon, Stylized Nature MegaKit, Fantasy Props MegaKit (CC0)
- Objets : Kay Lousberg — KayKit (CC0)
- Bruitages : Kenney — Impact Sounds, RPG Audio, Interface Sounds (CC0) ; OpenGameArt — RPG Sound Pack et Zombies Sound Pack (artisticdude), Battle Sound Effects (Ogrebane) (CC0)
- Musiques (licence standard filmmusic.io avec attribution, https://filmmusic.io/standard-license) :
  - « Drums of the Deep » — Kevin MacLeod (incompetech.com), https://filmmusic.io/song/3681-drums-of-the-deep
  - « The Cold Battle » — Alexander Nakarada, https://filmmusic.io/song/7515-the-cold-battle
  - « Horsemen Approach » (feat. Kevin MacLeod) — Alexander Nakarada, https://filmmusic.io/song/7934-horsemen-approach
- Textures de pierre : générées par calcul (tools/gen_textures.py)
- Icônes : game-icons.net — Lorc, Delapouite, Felbrigg (CC BY 3.0)
- Moteur 3D : Three.js (licence MIT)
- Police : Nunito (SIL Open Font License)

## Publier une mise à jour
Changer le même numéro de version à trois endroits : `APP_VERSION` dans `js/main.js`, `VERSION` dans `sw.js`, et `version.json`. Les joueurs voient alors un bandeau « Nouvelle version » avec un bouton « Mettre à jour ».
