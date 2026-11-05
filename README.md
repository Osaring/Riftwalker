# Riftwalker

Roguelike de donjons pour iPhone (site web jouable hors ligne).

**Jouer :** https://osaring.github.io/riftwalker/ puis, dans Safari, Partager → « Sur l'écran d'accueil ».

## Version 1
- Classes : Guerrier (Frappe, Charge, Tourbillon, rage) et Mage (Boule de feu incantée, Transfert, Nova de givre, mana)
- Donjons générés aléatoirement : salles de combat, trésors, mimics, clé et salle scellée, gardien d'étage
- Faille vers l'étage suivant, difficulté croissante
- Butin aux couleurs de rareté façon WoW
- Sauvegarde automatique à chaque étage, jouable hors ligne
- Musique et bruitages synthétisés (thèmes menu, exploration, combat, gardien)
- Trois styles graphiques au choix (menu Graphismes) : Classique, Pixel HD, Cel-shading 3D

## Crédits
- Graphismes : [0x72 — Dungeon Tileset II](https://0x72.itch.io/dungeontileset-ii) (CC0)
- Personnages du mode Pixel HD : Liberated Pixel Cup (CC-BY-SA / OGA-BY / GPL), auteurs détaillés dans `CREDITS-LPC.txt`
- Modèles 3D : Kay Lousberg — KayKit Adventurers, Skeletons, Dungeon (CC0) ; Quaternius — Modular Dungeon (CC0)
- Moteur 3D : Three.js (licence MIT)
- Police : Pixelify Sans (SIL Open Font License)

## Publier une mise à jour
Changer le même numéro de version à trois endroits : `APP_VERSION` dans `game.js`, `VERSION` dans `sw.js`, et `version.json` (avec une phrase de nouveautés). Les joueurs voient alors un bandeau « Nouvelle version » avec un bouton « Mettre à jour ».
