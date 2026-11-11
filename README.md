# Last Loop

Application auto-hébergée de suivi en direct pour une Backyard Ultra :
chronométrage, classement public, profils coureurs, parcours GPX sur
OpenStreetMap, vidéoprojecteur, poste de commandement et balises GPS par
téléphone.

## Fonctions principales

- création d’événements avec GPX, distance et nombre de boucles fini ou infini ;
- chronométrage et gestion des abandons en direct ;
- comptes `coureur`, `admin` et `directeur`, invitations et réinitialisation de
  mot de passe par e-mail ;
- profils coureurs publics et historique des tours ;
- vues `/display` pour le camp de base et `/ds` pour la direction de course ;
- suivi GPS au choix par la page web ou l’application mobile native, avec codes
  individuels, reprise après coupure réseau et détection d’écart au parcours ;
- demandes d’assistance avec acquittement par la direction ;
- exports CSV des résultats, tours, points GPS et alertes ;
- endpoint de supervision `/api/health`.

## Démarrage rapide

Prérequis : Node.js 22.13 ou supérieur.

```bash
npm install
cp .env.example .env
npm run dev
```

Ouvre [http://localhost:3000/setup](http://localhost:3000/setup) pour créer le
premier compte directeur. La base SQLite de développement est créée
automatiquement dans `data/backyard.sqlite`.

### Application GPS mobile

L’application Expo/React Native vit dans `apps/tracker`. Après l’installation
du projet web :

```bash
cd apps/tracker
npm install
npm run ios       # ou npm run android
```

Le suivi web `/track` reste disponible sans installation. L’application mobile
est recommandée pour le suivi écran verrouillé et les longues courses. Consulte
son [guide dédié](apps/tracker/README.md) pour le développement et les builds.

## Documentation

- [Déploiement auto-hébergé](docs/DEPLOYMENT.md) — serveur Node, HTTPS,
  reverse proxy, service systemd, SMTP, sauvegardes et mises à jour.
- [Guide de développement](docs/DEVELOPMENT.md) — architecture, base de
  données, conventions, scripts et tests.
- [Guide d’utilisation](docs/USER_GUIDE.md) — parcours par rôle, préparation
  d’un événement, jour de course, GPS, assistance et exports.
- [Exploitation le jour J](docs/OPERATIONS.md) — checklist, supervision,
  incidents, confidentialité et fin de course.
- [Référence API](docs/API.md) — routes, authentification et formats utiles.

## Production en bref

```bash
npm ci
npm run build
npm start
```

Le serveur autonome est produit dans `dist/standalone`. Utilise un chemin
persistant pour `DATABASE_PATH`, configure le SMTP, puis place obligatoirement
l’application derrière HTTPS pour les cookies sécurisés et la géolocalisation.
Le projet ne contient aucun déploiement vers un hébergeur tiers.

## Suivi web ou application mobile

Les navigateurs mobiles peuvent suspendre la géolocalisation quand la page est
masquée ou l’écran verrouillé. `/track` tente de maintenir l’écran allumé,
conserve temporairement les points hors ligne et reprend la synchronisation au
retour. `apps/tracker` fournit un suivi natif plus fiable en arrière-plan avec
la même base, les mêmes codes coureurs et les mêmes dashboards. Aucun téléphone
ne doit cependant être considéré comme une balise de sécurité garantie : le
système peut être arrêté par l’utilisateur ou par le système d’exploitation.

## Licence et données

Adapte la durée de conservation GPS et l’information des participants à ta
politique de confidentialité. Les alertes de l’application ne remplacent pas
les services d’urgence : le 112 doit rester la procédure en cas de danger
immédiat.
