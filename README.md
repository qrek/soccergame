# ⚽ Football Draft — Ultimate National Teams

Jeu web **mobile multijoueur** : draftez à tour de rôle les légendes des sélections
nationales (des années 1950 à aujourd'hui), composez votre équipe, puis affrontez
les autres joueurs dans un championnat suivi de phases finales — le tout dans une
interface façon **FIFA / FUT**.

Chaque joueur rejoint la **session depuis son propre téléphone** grâce à un
**code à 4 caractères** ou en scannant un **QR code**.

## Principe

1. **Créer une session** : l'hôte obtient un code + un QR code et choisit la taille
   des équipes (5, 7, 9 ou 11).
2. **Rejoindre** : chaque joueur saisit le code (ou scanne le QR) sur son mobile.
3. **Draft** : chacun son tour, une **équipe nationale est tirée au hasard** et le
   joueur choisit un footballeur dedans, en respectant sa formation
   (ex. 1 GK · 4 DEF · 3 MID · 3 FWD pour un onze). Ordre en « serpent ».
4. **Tournoi** : championnat (toutes les équipes se rencontrent) → **classement**,
   puis **phases finales** à élimination directe (avec tirs au but) jusqu'au titre.

## Lancer le jeu

Aucune dépendance à installer (serveur 100 % Node.js natif) :

```bash
node server.js
# puis ouvrez http://localhost:3000
```

Pour jouer à plusieurs sur mobile, les téléphones doivent pouvoir joindre la
machine hôte (même réseau Wi-Fi, ou serveur exposé publiquement). Le QR code
pointe automatiquement vers l'URL de la session.

Variable d'environnement optionnelle : `PORT` (par défaut `3000`).

## Architecture

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur HTTP natif + temps réel via **SSE**, autorité du draft et du tournoi |
| `game/engine.js` | Formations, force des équipes, simulation de matchs, classement, bracket |
| `public/data/players.js` | Base de données des joueurs (nom, pays, poste, note façon FIFA, décennie) |
| `public/index.html` · `css/styles.css` · `js/app.js` | Client mobile (UI façon FUT) |
| `public/js/qrcode.js` | Générateur de QR code autonome (aucune librairie externe) |

Le **draft et le tournoi sont calculés côté serveur** pour garantir l'équité ;
les clients ne font qu'afficher l'état diffusé.

## Données

La base couvre des dizaines de sélections et des centaines de joueurs, chacun noté
sur 99 (à son apogée en sélection), façon note générale FIFA, avec 6 statistiques
détaillées calculées (PAC/SHO/PAS/DRI/DEF/PHY, ou DIV/HAN/KIC/REF/SPD/POS pour les
gardiens). Elle est facilement extensible dans `public/data/players.js`.

Chaque carte affiche un avatar généré (dégradé déterministe + initiales du
joueur) — aucun téléchargement externe n'est nécessaire.
