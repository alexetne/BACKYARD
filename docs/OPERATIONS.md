# Exploitation le jour J

## 1. Répartition minimale des rôles

- un directeur supervise `/ds`, les alertes et les décisions ;
- un chronométreur utilise `/admin` ;
- une personne gère les appels et interventions terrain ;
- une personne vérifie l’écran public et la connectivité si l’équipe le permet.

Évite d’utiliser le même compte sur tous les postes. Chaque personne doit avoir
le rôle minimal correspondant à sa mission.

## 2. Checklist J-7 à J-1

- sauvegarde et mise à jour terminées avant la veille ;
- événement, heure, distance, limites et GPX vérifiés ;
- liste des coureurs et dossards contrôlée ;
- invitations envoyées et profils facultatifs validés ;
- SMTP testé avec une vraie boîte ;
- HTTPS et certificat contrôlés ;
- carte testée avec le réseau du site ;
- codes GPS testés sur iPhone et Android représentatifs ;
- seuil hors parcours adapté à la largeur et aux variantes du tracé ;
- consignes de confidentialité communiquées ;
- procédure d’urgence et numéros locaux imprimés ;
- sauvegarde récente disponible hors du serveur.

## 3. Checklist avant le départ

1. ouvre `/api/health` et confirme l’état `ok` ;
2. ouvre `/`, `/admin`, `/ds` et `/display` ;
3. vérifie l’heure système du serveur et des postes ;
4. passe le vidéoprojecteur en plein écran ;
5. génère et distribue les codes GPS individuellement ;
6. demande aux coureurs d’activer localisation précise et écran maintenu ;
7. contrôle les premiers points sur `/ds` ;
8. réalise un tour ou déplacement de test hors zone si possible ;
9. vérifie que l’équipe sait acquitter et clôturer une alerte ;
10. branche les postes et prépare une connexion de secours.

## 4. Supervision pendant la course

### Toutes les heures

- compare le nombre de coureurs en lice avec le registre officiel ;
- observe les GPS silencieux et hors parcours ;
- contrôle l’espace disque et les journaux du service ;
- vérifie que le prochain départ et la boucle sont cohérents ;
- confirme que le vidéoprojecteur se rafraîchit ;
- note toute correction manuelle dans le journal d’organisation.

### Priorités visuelles

1. alerte urgente ouverte ;
2. demande d’assistance ouverte ;
3. coureur attendu à moins de dix minutes du départ ;
4. position hors parcours ;
5. GPS silencieux ;
6. problème de profil ou d’affichage public.

Le GPS web est un outil d’information complémentaire. Le chronométrage au camp
et les procédures humaines restent la référence opérationnelle.

## 5. Traitement d’une alerte

1. un membre désigné clique sur « Acquitter » ;
2. il note dossard, nom, type, heure, message et position ;
3. il tente de contacter le coureur selon la procédure convenue ;
4. il envoie l’équipe terrain si nécessaire ;
5. en danger immédiat, il appelle les secours sans attendre l’application ;
6. il garde l’alerte acquittée pendant l’intervention ;
7. il clôture uniquement après confirmation de la fin de situation ;
8. il exporte les alertes après la course pour le compte-rendu sécurisé.

Une alerte sans position doit être traitée comme une information incomplète,
pas ignorée.

## 6. Position hors parcours

Avant de déclencher une intervention :

1. regarde l’âge du point ;
2. regarde l’écart annoncé ;
3. tiens compte de la précision du téléphone ;
4. compare avec les variantes autorisées et zones de mauvaise réception ;
5. observe un ou deux points supplémentaires ;
6. contacte le coureur si le doute persiste.

Augmente `GPS_OFF_ROUTE_THRESHOLD_M` si les faux positifs sont fréquents, mais
ne change pas ce seuil au milieu d’une situation en cours sans le noter.

## 7. Perte de réseau

### Téléphone d’un coureur

Les points restent dans la file locale puis repartent au retour du réseau. La
position publique devient silencieuse entre-temps. Ne régénère pas le code sauf
si l’appareil doit réellement être remplacé, car cela révoque l’ancien.

### Connexion du camp

- bascule sur la connexion de secours ;
- garde une saisie papier temporaire des passages ;
- ne multiplie pas les rechargements ;
- confirme `/api/health` lorsque le réseau revient ;
- ressaisis les tours manquants dans l’ordre.

### Serveur indisponible

- conserve les horaires sur papier ;
- consulte `systemctl status` et les journaux ;
- vérifie disque, mémoire et droits de la base ;
- redémarre une seule fois si la cause est comprise ;
- restaure uniquement après sauvegarde de l’état courant.

## 8. Corrections de chronométrage

L’interface actuelle privilégie l’ajout de tours et le statut du coureur. Toute
correction directe en base doit être réalisée hors course ou par une personne
technique, après sauvegarde et avec une trace écrite. Ne modifie jamais la base
avec plusieurs outils en parallèle.

## 9. Confidentialité

- recueille l’accord des participants pour le suivi public ;
- explique que la position fraîche est visible sans compte ;
- réserve les exports GPS et alertes aux personnes habilitées ;
- évite d’envoyer ces fichiers par messagerie non sécurisée ;
- supprime ou archive selon la politique annoncée ;
- ne réutilise pas les données à une autre fin sans base légale ;
- réponds aux demandes d’accès ou de suppression selon la réglementation
  applicable à l’organisation.

La valeur `GPS_RETENTION_DAYS` purge les points anciens lors de nouveaux envois.
Si aucun nouveau point n’arrive après l’événement, effectue la purge ou
l’archivage prévu manuellement.

## 10. Fin de course

1. confirme le dernier résultat et le statut de tous les participants ;
2. clôture les alertes ;
3. télécharge résultats et tours ;
4. exporte GPS et alertes uniquement si nécessaire ;
5. crée une sauvegarde finale de SQLite ;
6. limite ou coupe l’accès public selon la politique de l’événement ;
7. révoque les accès temporaires inutiles ;
8. conserve les journaux d’incident dans un emplacement protégé ;
9. planifie la suppression des positions ;
10. réalise un retour d’expérience avec l’équipe.

## 11. Test de reprise conseillé

Avant chaque saison, simule sur une base séparée :

- panne du réseau mobile pendant dix minutes ;
- redémarrage du serveur ;
- restauration d’une sauvegarde ;
- expiration d’un code GPS ;
- alerte urgente sans position ;
- fausse alerte hors parcours ;
- indisponibilité du SMTP ;
- perte du poste de chronométrage.

Le but est que l’équipe connaisse la procédure papier et puisse continuer la
course même si l’outil numérique devient temporairement indisponible.

