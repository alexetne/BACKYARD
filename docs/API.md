# Référence API

L’API est principalement consommée par l’interface Last Loop. Elle utilise des
cookies `HttpOnly`, pas des jetons Bearer. Les réponses JSON d’erreur suivent la
forme :

```json
{ "error": "Message lisible" }
```

Les horodatages JSON sont des millisecondes Unix. Les exports utilisent ISO
8601.

## Authentification

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/auth/setup` | public | indique si le premier compte est requis |
| POST | `/api/auth/setup` | public une seule fois | crée le premier directeur |
| POST | `/api/auth/login` | public | crée une session |
| POST | `/api/auth/logout` | session | détruit la session |
| GET | `/api/auth/me` | public/session | retourne l’utilisateur courant |
| POST | `/api/auth/forgot-password` | public | demande un e-mail de réinitialisation |
| GET | `/api/auth/reset-password?token=…` | public | vérifie le lien |
| POST | `/api/auth/reset-password` | public avec jeton | choisit le nouveau mot de passe |

Cookie principal : `last_loop_session`. Durée : sept jours. Le cookie est
`Secure` en production.

Exemple de connexion :

```http
POST /api/auth/login
Content-Type: application/json

{"email":"direction@example.fr","password":"mot-de-passe"}
```

## Événements et live

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/events/active` | public | événement, statistiques, coureurs, GPX et positions fraîches |
| GET | `/api/events` | directeur | liste des événements |
| POST | `/api/events` | directeur | crée et active un événement |
| POST | `/api/events/:id/activate` | directeur | active un événement archivé |
| GET | `/api/events/:id/export?type=…` | admin/directeur | export CSV |

Création d’événement :

```json
{
  "name": "Backyard des Pins",
  "location": "Bordeaux",
  "startAt": "2027-05-15T07:00:00+02:00",
  "loopDistanceKm": 6.706,
  "totalLoops": null,
  "gpxName": "boucle.gpx",
  "gpxText": "<?xml version=\"1.0\"?>…"
}
```

`totalLoops: null` signifie illimité. Le GPX est limité à 2 Mo et doit contenir
au moins deux points de trace (`<trkpt>`) ou de route (`<rtept>`).

Types d’export :

- `results` : classement et résumé ;
- `laps` : détail de chaque tour ;
- `gps` : positions encore conservées ;
- `alerts` : journal d’assistance.

## Participants et tours

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/api/participants` | admin/directeur | ajoute un participant |
| PATCH | `/api/participants/:id` | admin/directeur | change `active`, `out` ou `dns` |
| POST | `/api/laps` | admin/directeur | enregistre le prochain tour |

Ajout :

```json
{"eventId":1,"bib":27,"name":"Amélie Roux","country":"FR"}
```

Tour :

```json
{"participantId":12,"durationSeconds":3138}
```

`durationSeconds` est facultatif. Sans valeur, le temps est déduit de l’heure
théorique du départ de la boucle.

## Comptes et profils

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/users` | directeur | liste les comptes et dossiers |
| POST | `/api/users` | directeur | crée ou prépare un compte |
| POST | `/api/users/:id/invite` | directeur | valide et envoie l’invitation |
| GET | `/api/runner/me` | coureur | tableau de bord personnel |
| PATCH | `/api/runner/profile` | coureur | met à jour le profil |

Les champs de profil textuels sont limités côté serveur. La publication reste
conditionnée par le choix du coureur et l’approbation de la direction.

## GPS : association et positions

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/tracking/codes?eventId=1` | directeur | état des codes, téléphones et écarts au GPX |
| POST | `/api/tracking/codes` | directeur | génère ou régénère un code |
| POST | `/api/tracking/connect` | code coureur | associe le téléphone |
| GET | `/api/tracking/session` | appareil GPS | état de l’association |
| DELETE | `/api/tracking/session` | appareil GPS | révoque l’appareil courant |
| POST | `/api/tracking/positions` | appareil GPS | envoie jusqu’à 30 points |

La page web utilise le cookie `last_loop_tracking_device`, `HttpOnly` et
`Secure` en production. L’application native utilise le même modèle d’appareil
avec `Authorization: Bearer <jeton>`. Seule l’empreinte du jeton est enregistrée
dans SQLite.

Génération :

```json
{"eventId":1,"participantId":12}
```

Association :

```json
{"code":"27-ABCD2345"}
```

Association native :

```json
{"code":"27-ABCD2345","client":"native"}
```

Cette variante renvoie une seule fois `{ "device": {...}, "token": "..." }`.
Le jeton doit rester dans le stockage sécurisé du système et être envoyé aux
routes session, positions et alertes dans l’en-tête Bearer. Régénérer le code
révoque immédiatement tous les anciens cookies et jetons du coureur.

Lot de positions :

```json
{
  "positions": [
    {
      "latitude": 48.4078,
      "longitude": 2.7042,
      "accuracy": 8.4,
      "altitude": 93,
      "speed": 2.2,
      "heading": 41,
      "recordedAt": 1794395326000
    }
  ]
}
```

La réponse contient le nombre de points acceptés et, lorsque le GPX est
disponible, l’écart de la dernière position :

```json
{
  "accepted": 1,
  "receivedAt": 1794395338452,
  "route": {"distanceM": 14,"thresholdM": 200,"offRoute":false}
}
```

Contraintes : latitude/longitude valides, précision de 0 à 10 000 m,
horodatage datant de moins de 12 heures et au maximum cinq minutes dans le
futur. Les doublons sont ignorés.

## Alertes d’assistance

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/api/tracking/alerts` | appareil GPS | crée une alerte |
| GET | `/api/tracking/alerts?mine=1` | appareil GPS | suit les alertes du coureur |
| GET | `/api/tracking/alerts?eventId=1` | directeur | liste le journal de l’événement |
| PATCH | `/api/tracking/alerts/:id` | directeur | acquitte ou clôture |

Création :

```json
{"kind":"assistance","message":"Douleur à la cheville"}
```

`kind` vaut `assistance` ou `urgent`. Le message est facultatif et limité à 240
caractères. La dernière position connue est copiée dans l’alerte.

Mise à jour :

```json
{"action":"acknowledge"}
```

ou :

```json
{"action":"resolve"}
```

## Santé

```http
GET /api/health
```

Cette route publique est prévue pour les sondes. Réponse normale :

```json
{
  "status":"ok",
  "database":"ok",
  "activeEvent":{"id":1,"status":"live"},
  "checkedAt":"2026-11-11T12:00:00.000Z"
}
```

Elle répond HTTP 503 si SQLite est indisponible. Aucun secret, compte ou chemin
local n’est exposé.

## Codes HTTP

| Code | Signification |
|---:|---|
| 200 | lecture ou mise à jour réussie |
| 201 | création réussie |
| 400 | données invalides |
| 401 | session ou appareil absent/invalide |
| 403 | rôle insuffisant |
| 404 | ressource inexistante |
| 409 | état incompatible ou doublon métier |
| 428 | configuration initiale requise |
| 500 | erreur interne |
| 503 | base indisponible sur la sonde de santé |

## Cache et sécurité

Les routes temps réel, personnelles et de supervision utilisent `no-store`.
Les opérations d’écriture doivent être appelées depuis la même origine pour
bénéficier de `SameSite=Strict`. Ne journalise jamais les cookies, mots de
passe, codes GPS complets ni jetons de réinitialisation.
