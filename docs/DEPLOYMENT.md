# Déploiement auto-hébergé

Ce guide décrit un déploiement Linux classique avec Node.js, SQLite et un
reverse proxy HTTPS. Last Loop ne dépend d’aucune plateforme d’hébergement.

## 1. Architecture de production

Le chemin recommandé est le suivant :

```text
Internet → Caddy ou Nginx (HTTPS) → Last Loop sur 127.0.0.1:3000 → SQLite
                                      └──────────────────────────→ SMTP
```

Le reverse proxy termine HTTPS. Le processus Node ne doit pas être exposé
directement sur Internet. Le fichier SQLite doit vivre hors du dossier des
versions de l’application, dans un répertoire persistant et sauvegardé.

## 2. Prérequis

- Linux 64 bits récent ;
- Node.js 22.13 ou supérieur et npm ;
- un nom de domaine pointant vers le serveur ;
- Caddy ou Nginx avec un certificat TLS ;
- un compte SMTP pour les invitations et réinitialisations ;
- 1 Go de RAM minimum pour une petite course, 2 Go recommandés ;
- un fournisseur de tuiles OpenStreetMap adapté à l’audience.

Vérifie les versions :

```bash
node --version
npm --version
```

## 3. Arborescence conseillée

```text
/opt/last-loop/                 code et build
/var/lib/last-loop/            base SQLite persistante
/etc/last-loop.env             secrets et configuration
/var/backups/last-loop/        sauvegardes
```

Crée un utilisateur système sans connexion interactive et donne-lui uniquement
l’accès nécessaire à `/opt/last-loop` et `/var/lib/last-loop`.

## 4. Installation et build

Dans `/opt/last-loop` :

```bash
npm ci
npm run build
```

Le build crée `dist/standalone`. Le démarrage de production est :

```bash
npm start
```

Les variables `NEXT_PUBLIC_*` sont intégrées au code client pendant le build.
Configure donc le fournisseur de carte avant `npm run build`.

## 5. Configuration

Crée `/etc/last-loop.env` à partir de `.env.example` et restreins ses droits.

Exemple :

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_PATH=/var/lib/last-loop/backyard.sqlite
SEED_DEMO_DATA=false
APP_URL=https://backyard.example.fr

SMTP_HOST=smtp.example.fr
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=backyard@example.fr
SMTP_PASSWORD=mot-de-passe-long
MAIL_FROM=Last Loop <no-reply@example.fr>
MAIL_PREVIEW=false

NEXT_PUBLIC_MAP_TILE_URL=https://tiles.example.fr/{z}/{x}/{y}.png
NEXT_PUBLIC_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors

GPS_RETENTION_DAYS=14
GPS_OFF_ROUTE_THRESHOLD_M=200
```

`SMTP_URL` peut remplacer les variables SMTP détaillées. N’active jamais
`MAIL_PREVIEW` en production : les liens d’activation seraient affichés à
l’écran au lieu d’être envoyés.

### Variables disponibles

| Variable | Défaut | Rôle |
|---|---:|---|
| `HOST` | `0.0.0.0` | Adresse d’écoute du serveur Node |
| `PORT` | `3000` | Port HTTP interne |
| `DATABASE_PATH` | `data/backyard.sqlite` | Chemin absolu recommandé en production |
| `SEED_DEMO_DATA` | désactivé en production | Charge une course exemple dans une base vide |
| `APP_URL` | URL de la requête | Base des liens envoyés par e-mail |
| `SMTP_URL` | vide | URL SMTP complète, prioritaire |
| `SMTP_HOST` / `SMTP_PORT` | vide / `587` | Serveur SMTP |
| `SMTP_SECURE` | `false` | `true` pour TLS direct, généralement port 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | vide | Identifiants SMTP |
| `MAIL_FROM` | adresse locale | Expéditeur visible |
| `MAIL_PREVIEW` | `false` | Simulation locale uniquement |
| `NEXT_PUBLIC_MAP_TILE_URL` | tuiles OSM communautaires | Modèle d’URL des tuiles |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | attribution OSM | Crédit affiché sur la carte |
| `GPS_RETENTION_DAYS` | `14` | Conservation GPS, limitée de 1 à 90 jours |
| `GPS_OFF_ROUTE_THRESHOLD_M` | `200` | Écart au GPX, limité de 50 à 2 000 mètres |

## 6. Service systemd

Exemple `/etc/systemd/system/last-loop.service` :

```ini
[Unit]
Description=Last Loop Backyard tracking
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lastloop
Group=lastloop
WorkingDirectory=/opt/last-loop
EnvironmentFile=/etc/last-loop.env
ExecStart=/usr/bin/node /opt/last-loop/dist/standalone/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/last-loop

[Install]
WantedBy=multi-user.target
```

Active et contrôle le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now last-loop
sudo systemctl status last-loop
sudo journalctl -u last-loop -f
```

Si Node n’est pas installé dans `/usr/bin/node`, adapte `ExecStart` avec le
chemin retourné par `command -v node`.

## 7. HTTPS avec Caddy

Exemple de `Caddyfile` :

```caddyfile
backyard.example.fr {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy obtient et renouvelle automatiquement le certificat si le DNS et les
ports 80/443 sont correctement configurés.

## 8. HTTPS avec Nginx

Exemple de bloc serveur, à compléter avec les chemins du certificat :

```nginx
server {
    listen 443 ssl http2;
    server_name backyard.example.fr;

    ssl_certificate /etc/letsencrypt/live/backyard.example.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/backyard.example.fr/privkey.pem;
    client_max_body_size 3m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Redirige également le port 80 vers HTTPS. Le HTTPS est obligatoire en
production : les cookies sont marqués `Secure` et la géolocalisation web exige
un contexte sécurisé.

## 9. Premier démarrage

1. Vérifie `https://ton-domaine/api/health` ; la réponse doit avoir
   `"status":"ok"`.
2. Ouvre `/setup` et crée immédiatement le compte directeur.
3. Connecte-toi à `/director` et configure les autres comptes.
4. Envoie une invitation de test pour valider le SMTP.
5. Crée un événement de test avec un GPX et vérifie la carte.
6. Depuis un téléphone, teste `/track` en 4G ou 5G.

La route `/setup` refuse toute nouvelle création dès qu’un utilisateur existe.

## 10. Application mobile GPS

L’application native dans `apps/tracker` ne contient ni serveur ni base métier.
Elle doit joindre la même URL HTTPS publique que le site :

```bash
cd apps/tracker
cp .env.example .env
# Renseigner EXPO_PUBLIC_API_URL=https://backyard.example.fr
npm ci
npm run typecheck
```

Pour une distribution de production, construis sans
`LAST_LOOP_ALLOW_HTTP=1`. Android exige une clé de signature et un APK/AAB ;
iOS exige macOS, Xcode et un certificat Apple. Les projets natifs peuvent être
générés avec `npx expo prebuild`, puis archivés localement dans Android Studio
ou Xcode : aucun hébergement Expo n’est requis.

Avant diffusion :

- vérifie l’URL HTTPS embarquée et `/api/health` depuis un réseau mobile ;
- teste les permissions « Toujours », l’écran verrouillé et la notification
  Android sur de vrais appareils ;
- teste dix minutes hors réseau puis la resynchronisation ;
- documente la collecte, l’affichage public et la durée de conservation GPS ;
- prépare une procédure de mise à jour de l’application installée.

## 11. Sauvegarde SQLite

SQLite fonctionne en mode WAL. La méthode à chaud recommandée utilise la
commande `.backup` :

```bash
sqlite3 /var/lib/last-loop/backyard.sqlite \
  ".backup '/var/backups/last-loop/backyard-$(date +%F-%H%M).sqlite'"
```

Si `sqlite3` n’est pas installé, arrête le service avant de copier le fichier :

```bash
sudo systemctl stop last-loop
sudo cp /var/lib/last-loop/backyard.sqlite /var/backups/last-loop/backyard.sqlite
sudo systemctl start last-loop
```

Une copie à chaud classique doit inclure `backyard.sqlite`, `-wal` et `-shm`.
Teste régulièrement la restauration sur une machine séparée et conserve au
moins une copie hors du serveur.

### Restauration

1. arrête Last Loop ;
2. conserve une copie du fichier actuel ;
3. remplace la base par la sauvegarde ;
4. vérifie le propriétaire et les droits ;
5. redémarre et contrôle `/api/health`, `/` et `/director`.

## 12. Mise à jour

Procédure prudente :

1. annonce une courte interruption ;
2. effectue une sauvegarde SQLite ;
3. installe la nouvelle version dans un répertoire de release ;
4. lance `npm ci` puis `npm run build` ;
5. arrête le service, remplace le lien ou le dossier actif, puis redémarre ;
6. contrôle `/api/health` et les journaux ;
7. vérifie la connexion, le dashboard directeur et la carte publique.

Les `CREATE TABLE IF NOT EXISTS` s’exécutent au démarrage. Pour une future
modification destructive du schéma, prépare une migration et une sauvegarde
avant la mise à jour.

## 13. Supervision

Sonde recommandée toutes les 30 à 60 secondes :

```text
GET https://backyard.example.fr/api/health
```

- HTTP 200 : application et base disponibles ;
- HTTP 503 : base indisponible ou erreur d’initialisation.

La réponse ne contient ni secret ni chemin local. Surveille également l’espace
disque, la mémoire, les erreurs systemd, l’expiration TLS et les échecs SMTP.

## 14. Pare-feu et sécurité

- expose uniquement 80/443 ; garde le port Node inaccessible publiquement ;
- protège `/etc/last-loop.env` et la base avec des droits minimaux ;
- utilise des mots de passe uniques d’au moins 12 caractères ;
- ne publie pas de sauvegarde dans le répertoire web ;
- conserve `NODE_ENV=production` ;
- limite l’accès SSH et applique les mises à jour de sécurité ;
- informe les coureurs que les positions fraîches sont publiques ;
- choisis une durée de conservation adaptée et exporte avant suppression si
  l’historique doit être archivé.

## 15. Cartographie

Le serveur communautaire `tile.openstreetmap.org` convient au développement et
aux faibles volumes, pas à un événement très consulté sans évaluation de sa
politique d’usage. Configure un fournisseur de tuiles ou ton propre serveur et
conserve l’attribution OpenStreetMap visible.
