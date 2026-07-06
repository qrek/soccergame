# Facepack local (modèle Football Manager)

Comme les facepacks de la communauté FM (DF11, Cut-Out Megapack…) : le jeu
n'embarque aucune photo, mais TU peux déposer ici tes propres images — elles
sont utilisées en priorité, avant la recherche Wikipédia.

## Mode d'emploi

1. Dépose tes images dans ce dossier (`.png`, `.jpg`, `.webp`…).
   Idéalement carrées ou en portrait serré (le cadre est un rond).
2. Déclare-les dans `index.json`, clé = nom EXACT du joueur tel qu'écrit
   dans `public/data/players.js`, valeur = nom du fichier :

   {
     "Pelé": "pele.png",
     "Zinédine Zidane": "zidane.jpg",
     "David Alaba": "alaba.webp"
   }

3. Commit + déploiement : les cartes de ces joueurs affichent ta photo.

## Où trouver des visages ?

Les megapacks de visages détourés de la communauté FM (sortitoutsi, DF11)
contiennent la plupart des légendes. Attention : ces images restent soumises
au droit d'auteur — réserve-les à un usage privé entre amis et évite de les
publier dans un dépôt ou site public.
