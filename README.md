# Riftwalker

Roguelike de donjons pour iPhone (site web jouable hors ligne).

**Jouer :** https://osaring.github.io/riftwalker/ puis, dans Safari, Partager → « Sur l'écran d'accueil ».

## Version 1
- Classe : Guerrier (Frappe, Charge, Tourbillon, rage)
- Donjons générés aléatoirement : salles de combat, trésors, mimics, clé et salle scellée, gardien d'étage
- Faille vers l'étage suivant, difficulté croissante
- Butin aux couleurs de rareté façon WoW
- Sauvegarde automatique à chaque étage, jouable hors ligne
- Musique et bruitages synthétisés (thèmes menu, exploration, combat, gardien)

## Crédits
- Graphismes : [0x72 — Dungeon Tileset II](https://0x72.itch.io/dungeontileset-ii) (CC0)
- Police : Pixelify Sans (SIL Open Font License)

## Publier une mise à jour
Changer le même numéro de version à trois endroits : `APP_VERSION` dans `game.js`, `VERSION` dans `sw.js`, et `version.json` (avec une phrase de nouveautés). Les joueurs voient alors un bandeau « Nouvelle version » avec un bouton « Mettre à jour ».
