# Guide d’utilisation

## 1. Les espaces

| Adresse | Public | Usage |
|---|---|---|
| `/` | oui | live, classement, carte et positions GPS fraîches |
| `/runners/[profil]` | oui | fiche publique d’un coureur |
| `/display` | oui | vidéoprojecteur du camp de base |
| `/track` | avec code GPS | balise web sans installation |
| application Last Loop Tracker | avec le même code GPS | balise native écran verrouillé |
| `/runner` | compte coureur | profil et statistiques personnelles |
| `/admin` | admin ou directeur | participants et chronométrage |
| `/ds` | directeur | poste de commandement en direct |
| `/director` | directeur | événements, dossiers et comptes |
| `/setup` | premier lancement | création du premier directeur |

## 2. Premier démarrage

1. ouvre `/setup` ;
2. saisis le nom, l’e-mail et un mot de passe d’au moins 12 caractères ;
3. conserve ces identifiants dans un gestionnaire de mots de passe ;
4. connecte-toi à l’espace direction ;
5. configure le SMTP avant d’envoyer des invitations réelles.

Une fois le premier compte créé, `/setup` ne permet plus d’en créer un autre.

## 3. Préparer un événement

Depuis l’espace directeur :

1. indique le nom et le lieu ;
2. choisis la date et l’heure du premier départ ;
3. saisis la distance officielle d’une boucle ;
4. indique un nombre de boucles ou choisis le mode infini ;
5. importe le GPX officiel ;
6. vérifie la distance, le dénivelé et la carte ;
7. active l’événement destiné au live.

La distance officielle sert au classement et aux distances cumulées. La
distance mesurée dans le GPX est affichée séparément et peut être légèrement
différente.

Un seul événement peut être actif. Les anciens événements restent consultables
dans les archives.

## 4. Ajouter les coureurs

Depuis `/admin` ou l’espace direction :

1. choisis un dossard unique dans l’événement ;
2. saisis le nom et le pays ;
3. vérifie le dossier ;
4. associe une adresse e-mail lorsque le compte coureur doit être créé ;
5. valide puis envoie l’invitation.

Le coureur reçoit un lien personnel valable 48 heures. Il choisit son mot de
passe, puis accède à `/runner`.

### Dossier et profil public

Le coureur peut renseigner : ville, club, catégorie, biographie, objectif,
ravitaillement préféré, mantra et anecdote. Il choisit de rendre son profil
public. Le profil n’apparaît dans le live qu’après validation par la direction.

## 5. Rôles

### Coureur

- complète son profil ;
- consulte ses statistiques et ses tours ;
- contrôle la visibilité publique ;
- utilise son code GPS le jour de la course ;
- peut demander de l’assistance depuis `/track`.

### Administrateur

- ajoute les participants ;
- enregistre les tours ;
- marque les abandons ou DNS ;
- télécharge les exports autorisés.

### Directeur de course

- possède tous les outils de l’administrateur ;
- crée et active les événements ;
- gère les comptes et invitations ;
- valide les profils ;
- génère les codes GPS ;
- traite les alertes d’assistance ;
- utilise le poste `/ds`.

## 6. Chronométrage

Dans `/admin`, le responsable saisit le temps `MM:SS` puis valide le tour. Si
aucun temps n’est saisi, le système calcule le temps à partir du départ horaire
de la boucle.

Un tour doit être compris entre 1 seconde et 59:59. Après validation :

- le classement est recalculé ;
- la distance du coureur est mise à jour ;
- le passage apparaît dans le fil de course ;
- les écrans publics se rafraîchissent automatiquement.

Utilise « Abandon » uniquement après confirmation. Le coureur ne peut plus
envoyer de nouvelles positions GPS lorsqu’il n’est plus actif.

## 7. Poste directeur `/ds`

Le poste de commandement regroupe :

- compte à rebours et heure du prochain départ ;
- coureurs au camp et sur la boucle ;
- retours récents et tours lents ;
- saisie rapide des tours et abandons ;
- alertes d’assistance ;
- état de chaque code et téléphone GPS ;
- positions fraîches, silencieuses ou hors parcours ;
- exports CSV.

Laisse cette page ouverte sur un ordinateur dédié. Elle actualise les données
toutes les cinq secondes.

## 8. Écran du camp `/display`

Ouvre la page sur l’ordinateur relié au vidéoprojecteur et clique sur « Plein
écran ». Elle affiche : prochain départ, coureurs en lice, boucle actuelle,
distance, temps de course, nombre de GPS actifs, classement et fil du camp.

Le classement change automatiquement de page toutes les dix secondes.

## 9. Codes GPS

Dans le bloc GPS de `/ds` :

1. clique sur « Générer » en face du coureur ;
2. note ou copie immédiatement le code complet ;
3. remets-le uniquement au coureur concerné ;
4. propose l’application Last Loop Tracker, ou `/track` sans installation ;
5. vérifie que l’appareil passe à « Associé », puis « En direct ».

Le code complet n’est affiché qu’une fois. Seuls ses deux derniers caractères
restent visibles ensuite. « Régénérer » déconnecte immédiatement l’ancien
téléphone.

## 10. Utiliser le suivi GPS sur le téléphone

Le même code fonctionne avec les deux méthodes :

- **application Last Loop Tracker** : recommandée, GPS en arrière-plan, écran
  verrouillé et file hors ligne étendue ;
- **page `/track`** : aucun téléchargement, mais la page doit rester visible
  pour une fiabilité maximale.

### Avec l’application mobile

1. installe l’application fournie par l’organisation ;
2. saisis l’adresse du serveur si elle n’est pas déjà configurée ;
3. saisis le code coureur puis appuie sur « Associer » ;
4. appuie sur « Démarrer le suivi GPS » ;
5. accorde la localisation précise et l’autorisation en arrière-plan ;
6. vérifie que l’état affiche « GPS actif » avant de verrouiller l’écran ;
7. n’arrête pas l’application et désactive l’économie d’énergie.

L’application conserve jusqu’à 2 160 points hors ligne, affiche la précision,
le dernier envoi et l’écart au GPX, puis synchronise automatiquement. Sur
Android, une notification permanente indique que le suivi est actif.

### Avec la page web `/track`

Avant le départ :

1. charge suffisamment le téléphone et prévois une batterie externe ;
2. désactive le mode économie d’énergie ;
3. ouvre `/track` en HTTPS ;
4. saisis le code donné par l’organisation ;
5. appuie sur « Démarrer le suivi GPS » ;
6. autorise la localisation précise ;
7. garde la page visible pendant la boucle.

L’écran indique : état du GPS, visibilité de la page, précision, dernier point,
dernier envoi, écart au parcours et taille de la file d’attente.

En cas de perte réseau, jusqu’à 720 points restent temporairement sur le
téléphone. Ils sont envoyés automatiquement au retour de la connexion.

### États GPS côté direction

| État | Signification | Action conseillée |
|---|---|---|
| `En direct` | point reçu depuis moins de 2 minutes | aucune |
| `Hors ligne` | une ancienne position existe, mais elle n’est plus fraîche | contacter ou attendre le retour réseau |
| `Hors parcours` | écart au GPX supérieur au seuil malgré la précision GPS | vérifier la carte et contacter le coureur |
| `Aucune` | aucun point reçu | vérifier permission, HTTPS et démarrage du suivi |
| `En attente` | code créé mais pas encore de position | terminer l’association sur le téléphone |

Une alerte hors parcours est un indicateur, pas une certitude. Une mauvaise
précision GPS, un GPX simplifié ou une variante autorisée peuvent l’expliquer.

## 11. Assistance et urgence

Le coureur associé peut ajouter une précision puis choisir :

- « Besoin d’aide » pour prévenir l’organisation ;
- « Urgence » pour mettre l’alerte en priorité.

La dernière position connue est attachée à l’alerte. Dans `/ds`, le directeur :

1. ouvre la position sur OpenStreetMap ;
2. clique sur « Acquitter » lorsqu’une personne prend la demande en charge ;
3. applique la procédure de sécurité de la course ;
4. clique sur « Clôturer » une fois la situation terminée.

Le téléphone affiche l’acquittement en quelques secondes. Cette fonction ne
contacte aucun service de secours et ne remplace jamais un appel au 112.

## 12. Carte publique

La carte affiche le GPX et les positions reçues depuis moins de cinq minutes.
Chaque marqueur indique le dossard, le nom, l’heure et la précision. Les
visiteurs ne voient ni l’historique complet, ni les codes, ni les alertes.

## 13. Exports CSV

Depuis `/ds`, quatre exports sont disponibles :

- `Résultats` : classement, statut, boucles, distance et meilleur tour ;
- `Tours` : une ligne par boucle et par coureur ;
- `GPS` : historique conservé des coordonnées et mesures ;
- `Alertes` : demandes, positions, acquittements et résolutions.

Les fichiers utilisent UTF-8 avec séparateur point-virgule et s’ouvrent dans
Excel ou LibreOffice. Les exports GPS et alertes contiennent des données
personnelles : limite leur diffusion et leur conservation.

## 14. Mots de passe

Le lien « Mot de passe oublié » envoie un lien valable une heure. Utilise la
même adresse que celle du compte. Après changement, les anciennes sessions
sont invalidées.

Si aucun e-mail n’arrive : vérifie les indésirables, l’adresse du dossier et la
configuration SMTP, puis demande à la direction de renvoyer l’invitation.

## 15. Problèmes fréquents

### Le GPS ne démarre pas

- utilise HTTPS ou `localhost` ;
- autorise la localisation précise pour le site ;
- recharge la page puis redémarre le suivi ;
- vérifie que le coureur est encore actif ;
- demande un nouveau code si l’appareil a été révoqué.

### Les points restent en attente

- vérifie la connexion mobile ;
- garde la page visible ;
- désactive l’économie de batterie ;
- ne vide pas les données du navigateur avant la resynchronisation.

### La carte ne charge pas

- teste l’accès Internet du poste ;
- vérifie le fournisseur de tuiles ;
- contrôle la console et l’attribution configurée ;
- le GPX et les classements restent disponibles même si les tuiles échouent.

### L’e-mail n’arrive pas

- vérifie l’adresse et les indésirables ;
- contrôle les journaux SMTP ;
- confirme `APP_URL` et `MAIL_FROM` ;
- ne laisse pas `MAIL_PREVIEW=true` en production.
