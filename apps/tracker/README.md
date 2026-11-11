# Last Loop Tracker

Application mobile dédiée à l’envoi GPS des coureurs. Elle complète la page web `/track` : les deux utilisent les mêmes codes, appareils, positions et alertes dans le backend Last Loop.

## Fonctions du MVP

- association par code coureur ou lien profond `lastloop://connect` ;
- localisation précise en arrière-plan sur iOS et Android ;
- notification Android persistante pendant le suivi ;
- file d’attente locale de 2 160 points et synchronisation par lots ;
- état de précision, dernier point, dernier envoi et écart du GPX ;
- alertes assistance et urgence ;
- jeton mobile révocable stocké dans le Keychain/Keystore.

## Développement

Depuis ce dossier :

```bash
npm install
npm run typecheck
npm run start
```

La localisation en arrière-plan ne fonctionne pas dans Expo Go. Créer puis lancer un development build :

```bash
npm run ios
# ou
npm run android
```

Le backend web doit tourner séparément à la racine du dépôt. Pour un téléphone
physique, expose-le sur le réseau local :

```bash
npm run dev -- --hostname 0.0.0.0
```

Pour un simulateur iOS, `http://localhost:3000` convient. Pour un téléphone physique, définir `EXPO_PUBLIC_API_URL` avec l’adresse IP LAN de la machine :

```bash
cp .env.example .env
```

Le téléphone et la machine doivent être sur le même réseau. Le port 3000 doit être accessible depuis ce réseau.

## Production

- configurer une URL `https://` publique et construire sans
  `LAST_LOOP_ALLOW_HTTP=1` afin de désactiver les exceptions HTTP ;
- personnaliser `ios.bundleIdentifier` et `android.package` si nécessaire ;
- fournir les textes de confidentialité et les captures demandés par Apple/Google ;
- tester l’écran verrouillé, le mode hors ligne, la révocation du code et l’autonomie sur de vrais appareils ;
- signer les builds iOS/Android selon le canal de distribution choisi.

L’application n’héberge aucune donnée : elle communique uniquement avec le backend autohébergé Last Loop.
