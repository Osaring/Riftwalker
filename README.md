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
- Jeu en 3D, vue à la 3ème personne (caméra par-dessus l'épaule)
- Personnages aux proportions réalistes, animations de combat, de sorts et de déplacement
- Grandes salles de château : plafonds à poutres, colonnes, arches, lustres, piliers ; couloirs larges
- Combat pensé pour la 3e personne : ciblage de l'ennemi devant soi (cadre de cible), roulade d'esquive, alertes pour les attaques hors écran, caméra qui suit la cible en combat

## Crédits
- Graphismes : [0x72 — Dungeon Tileset II](https://0x72.itch.io/dungeontileset-ii) (CC0)
- Personnages du mode Pixel HD : Liberated Pixel Cup (CC-BY-SA / OGA-BY / GPL), auteurs détaillés dans `CREDITS-LPC.txt`
- Modèles 3D : Kay Lousberg — KayKit Adventurers, Skeletons, Dungeon (CC0) ; Quaternius — Modular Dungeon, Universal Base Characters, Modular Character Outfits, Universal Animation Library 1 & 2, Fantasy Props MegaKit (CC0)
- Décors du mode Pixel HD : LPC Tile Atlas (CC-BY-SA 3.0 / GPL 3.0), auteurs dans `CREDITS-LPC.txt`
- Icônes : game-icons.net — Lorc, Delapouite, Felbrigg (CC BY 3.0)
- Moteur 3D : Three.js (licence MIT)
- Polices : Nunito, Pixelify Sans (SIL Open Font License)

## Publier une mise à jour
Changer le même numéro de version à trois endroits : `APP_VERSION` dans `game.js`, `VERSION` dans `sw.js`, et `version.json` (avec une phrase de nouveautés). Les joueurs voient alors un bandeau « Nouvelle version » avec un bouton « Mettre à jour ».
