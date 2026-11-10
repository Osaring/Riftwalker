# ECLIPSE 0.15

Le jeu est isolé dans ce dossier. Le jeu Riftwalker et son service worker à la racine restent inchangés.

## Structure

`index.html` contient l’interface, `styles.css` sa présentation et `game.js` la simulation. Les URL des ressources portent le numéro de version pour éviter une ancienne copie en cache. `version.json` annonce la mise à jour aux sessions ouvertes.

## Combat 0.15

Les impacts ajoutent des éclats bornés à 160 particules, un son de contact et un recul léger sur les ennemis ordinaires. Les animations de frappe s’orientent vers la cible. Aucun arrêt de simulation ni changement de vitesse du héros n’est introduit.

Les archers portent un arc vert, les brutes un marteau et une armure ocre, les traqueurs deux lames violettes. Les coups reçus par le héros affichent les dégâts après réduction d’armure ; une lueur et un anneau signalent le coup et l’invulnérabilité temporaire.

Le boss alterne une frappe au sol et une salve radiale. Le cercle se remplit avant la frappe ; les rayons indiquent les directions exactes de la salve. Le ciblage est verrouillé au début de l’annonce. Après chaque attaque, le boss reste immobile pendant 1,1 seconde pour laisser riposter. Sous la moitié de sa vie, ses salves passent de six à huit projectiles, toujours annoncés. Le cycle et la récupération sont sauvegardés, avec migration des anciennes parties.

La suite comprend 38 contrôles de logique exécutés avec succès. Le rendu du canvas des trois ennemis et des deux annonces de boss a également été produit et inspecté. Cela ne remplace pas la vérification tactile sur Safari iPhone.

## Base conservée depuis la 0.14

Le joystick utilise la même amplitude sur les deux axes. Le mouvement et l’esquive compensent la projection verticale du décor pour conserver une vitesse visible cohérente. Les déplacements au clavier suivent aussi la direction d’esquive, avec prise en charge de ZQSD, WASD et des flèches. La simulation avance par petits pas pour éviter le ralentissement artificiel quand le nombre d’images par seconde baisse.

Le sac suspend les combats. Une pause explicite et une pause lors de la perte de focus empêchent de laisser le personnage exposé pendant une interruption. La reprise efface les commandes maintenues. Les ennemis morts ne peuvent plus finir leur attaque et la mort du héros interrompt immédiatement la simulation de la salle.

Une mini-carte repère les ennemis et les objets. Après un combat, le joueur choisit quand continuer et récupère automatiquement le butin restant. Le compteur de donjon progresse toutes les cinq salles.

Le format de sauvegarde reste compatible avec la version 0.13. Les nouvelles sauvegardes conservent aussi les projectiles, zones d’attaque et délais des compétences. Les données incohérentes sont rejetées avant la reprise. Une nouvelle aventure demande confirmation lorsqu’une sauvegarde valide existe. Une mise à jour enregistre la partie avant de recharger. Un équipement retiré reste retiré après reprise.

## Vérification

Depuis la racine du dépôt, lancer `node eclipse-rpg/tests/logic.cjs`. Ce test ne nécessite aucune dépendance et vérifie les comportements de simulation dans un environnement DOM simulé.

Pour les tests navigateur, installer Playwright et Chromium dans l’environnement de test, servir le dépôt avec `python -m http.server 8765`, puis lancer `node eclipse-rpg/tests/regression.cjs`. `CHROMIUM_PATH` permet d’utiliser un Chromium déjà installé ; `ECLIPSE_TEST_URL` permet de changer l’adresse du serveur. Le test navigateur reprend les scénarios de logique et ajoute le multitouch et le rendu portrait/paysage.

Les contrôles de logique et de syntaxe ont été exécutés pour cette révision. Le lancement de Chromium est bloqué par l’environnement d’exécution ; le multitouch réel et le rendu sur Safari iPhone restent à vérifier. Le jeu demeure un prototype : cette révision améliore sa fiabilité, sans remplacer les graphismes par des ressources de production.
