# Guide de développement

## 1. Stack technique

- React 19 et Vinext ;
- TypeScript strict ;
- routes serveur compatibles avec l’API Next ;
- SQLite via `node:sqlite` ;
- Leaflet et OpenStreetMap pour le parcours ;
- Nodemailer pour les invitations ;
- CSS global sans bibliothèque de composants.

Node.js 22.13 minimum est requis pour `DatabaseSync` de `node:sqlite`.

## 2. Installation locale

```bash
npm install
cp .env.example .env
npm run dev
```

Le serveur démarre par défaut sur `http://localhost:3000`. Ouvre `/setup` lors
du premier lancement. En développement, `MAIL_PREVIEW=true` permet d’obtenir
les liens d’invitation sans SMTP.

Pour isoler une session de travail :

```bash
DATABASE_PATH=/tmp/last-loop-dev.sqlite npm run dev
```

## 3. Scripts

| Commande | Usage |
|---|---|
| `npm run dev` | serveur de développement et rechargement à chaud |
| `npx tsc --noEmit` | contrôle TypeScript rapide |
| `npm run lint` | ESLint, accessibilité et règles React |
| `npm run build` | build de production dans `dist/standalone` |
| `npm test` | lint puis build complet |
| `npm start` | démarre le build autonome |

Avant une livraison, exécute au minimum `npm test`.

## 4. Organisation du projet

```text
app/
  api/                 endpoints JSON, CSV et santé
  components/          composants réutilisables
  admin/               chronométrage
  director/            configuration et comptes
  ds/                  poste de commandement
  display/             vidéoprojecteur
  runner/              espace coureur
  runners/[slug]/      profil public
  track/               téléphone utilisé comme balise GPS
db/
  index.ts              ouverture, initialisation et données de démonstration
  schema.ts             schéma SQLite et index
lib/
  auth.ts               sessions, mots de passe et rôles
  dashboard-server.ts   agrégation du live public
  geo.ts                distance d’une position au GPX
  gpx.ts                lecture et simplification du GPX
  mail.ts               SMTP
  tracking.ts           codes et appareils GPS
docs/                   documentation du projet
```

## 5. Base de données

`getDb()` ouvre une instance unique, active les clés étrangères, le mode WAL et
un délai d’attente de 5 secondes. Chaque instruction de `schemaStatements` est
jouée au démarrage avec `IF NOT EXISTS`, puis `PRAGMA optimize` est exécuté.

Tables principales :

| Table | Contenu |
|---|---|
| `events` | paramètres, GPX et événement actif |
| `participants` | dossards et statut de course |
| `laps` | passages et durées par boucle |
| `race_updates` | fil de course public |
| `users`, `sessions` | comptes et sessions |
| `runner_profiles` | profils publics |
| `password_reset_tokens` | invitations et réinitialisations |
| `tracking_codes` | empreintes des codes GPS |
| `tracking_devices` | appareils associés et révocations |
| `gps_positions` | points horodatés |
| `tracking_alerts` | demandes d’aide, acquittement et résolution |

En développement, la base de démonstration est insérée si aucun événement
n’existe. Elle est désactivée par défaut en production. `SEED_DEMO_DATA=true`
permet de la forcer et `false` de travailler avec une base locale vide. Les
profils de démonstration utilisent `INSERT OR IGNORE`.

### Modifier le schéma

1. ajoute la table ou l’index dans `db/schema.ts` ;
2. pour une colonne ajoutée à une table existante, écris une migration
   idempotente explicite ;
3. ajoute uniquement les index correspondant à une requête réelle ;
4. teste sur une copie d’une base existante, pas seulement sur une base vide ;
5. vérifie le plan des requêtes volumineuses avec `EXPLAIN QUERY PLAN` ;
6. documente la migration et la procédure de retour arrière.

Ne stocke pas de donnée métier durable dans le navigateur. L’unique exception
actuelle est la file GPS hors ligne : elle est transitoire, limitée à 720 points
et la base reste la source de vérité.

## 6. Authentification et autorisation

Les sessions utilisent un jeton aléatoire dans un cookie `HttpOnly`,
`SameSite=Strict`, marqué `Secure` en production. Seule l’empreinte SHA-256 du
jeton est stockée. Les mots de passe et codes GPS utilisent `scrypt` avec sel.

Rôles :

- `runner` : profil et statistiques personnelles ;
- `admin` : participants, tours et chronométrage ;
- `director` : configuration, comptes, codes GPS, alertes et exports.

Toute route d’écriture doit contrôler le rôle côté serveur avec
`requireRequestRole`. Masquer un bouton côté client ne constitue jamais une
autorisation.

## 7. Flux GPS

1. le directeur génère un code opaque ;
2. seul son hash est conservé ;
3. `/track` échange le code contre un cookie d’appareil ;
4. le navigateur collecte une position haute précision environ toutes les huit
   secondes ;
5. jusqu’à 30 points sont envoyés par requête ;
6. les doublons appareil/horodatage sont ignorés ;
7. le serveur purge les anciens points à chaque insertion ;
8. la dernière position est comparée aux segments du GPX ;
9. le live public ne diffuse une position que pendant cinq minutes.

La détection hors parcours retranche la précision annoncée par le GPS avant de
comparer l’écart au seuil. Cela limite les faux positifs avec une mauvaise
réception.

Les navigateurs ne garantissent pas le GPS lorsque la page est masquée. Ne
présente jamais la solution web comme une balise de sécurité autonome.

## 8. Alertes d’assistance

Une alerte est liée à l’événement, au coureur et à l’appareil. La dernière
position connue est copiée au moment de l’envoi. Les états sont :

```text
open → acknowledged → resolved
  └──────────────────→ resolved
```

Seul un directeur peut acquitter ou clôturer. Le téléphone interroge son état
toutes les cinq secondes. Deux alertes identiques non résolues ne peuvent pas
être créées à moins de deux minutes d’intervalle.

## 9. Ajouter une route API

- valide tous les nombres, chaînes, enums et tailles ;
- contrôle le rôle avant la requête métier ;
- utilise des requêtes préparées ;
- regroupe les écritures liées dans `BEGIN IMMEDIATE` / `COMMIT` ;
- renvoie un code HTTP précis : 400, 401, 403, 404, 409 ou 500 ;
- ajoute `Cache-Control: no-store` aux données temps réel ou personnelles ;
- n’expose ni secret, ni hash, ni chemin local ;
- protège les exports CSV contre l’injection de formule.

## 10. E-mails en développement

Avec `MAIL_PREVIEW=true`, aucun e-mail n’est envoyé et l’interface direction
affiche le lien généré. Pour tester réellement le SMTP, utilise une boîte de
test dédiée et vérifie : invitation, mot de passe oublié, expiration du lien et
activation du compte.

## 11. Cartes et GPX

Le parseur accepte les points `<trkpt>`, impose au moins deux points et une
taille maximale de 2 Mo. La trace est simplifiée à 800 points pour le rendu
public, tandis que la distance et le dénivelé sont calculés sur la trace
complète.

Lors d’un changement du parseur, teste au minimum : namespaces XML, absence
d’altitude, coordonnées invalides, très grande trace et boucle fermée.

## 12. Validation manuelle recommandée

### Authentification

- `/setup` crée uniquement le premier directeur ;
- les trois rôles sont redirigés vers le bon espace ;
- les cookies expirés sont refusés ;
- un admin ne peut pas générer de code GPS ni gérer les comptes.

### Course

- création avec GPX ;
- activation d’un événement archivé ;
- ajout d’un participant ;
- enregistrement d’un tour et d’un abandon ;
- classement et compteur du prochain départ.

### GPS

- code valide, invalide, expiré et régénéré ;
- envoi de lots et doublons ;
- perte puis reprise du réseau ;
- position sur le GPX et position hors parcours ;
- disparition du live après cinq minutes ;
- assistance, urgence, acquittement et clôture.

### Production

- build autonome ;
- `/api/health` ;
- HTTPS et géolocalisation sur téléphone ;
- téléchargement des quatre exports CSV ;
- invitation SMTP réelle.

## 13. Données de test

Utilise toujours un `DATABASE_PATH` temporaire pour les tests d’écriture. Ne
réutilise pas la base réelle d’une course. Une stratégie simple consiste à
créer un répertoire temporaire, démarrer une instance sur un autre port, jouer
le scénario puis supprimer le répertoire après arrêt du serveur.

## 14. Conventions

- interfaces et messages utilisateur en français ;
- noms techniques et types en anglais ;
- millisecondes Unix dans SQLite, ISO 8601 dans les exports ;
- unités explicites dans les noms (`_km`, `_m`, `_seconds`, `_at`) ;
- pas de secret ni de base SQLite dans Git ;
- changements ciblés et compatibles avec les données existantes.
