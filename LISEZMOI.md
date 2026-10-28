# Statistiques Inter Ligue — Salon de Quilles Montmorency

Extrait tous les tournois « Inter Ligue » publiés sur EZ Lexer / Bowl4U et calcule,
pour chaque joueur, sa moyenne de référence, sa moyenne jouée et l'écart entre les deux.

## Sur iPhone, iPad ou tout navigateur (sans le Mac)

Le rapport est mis à jour automatiquement **chaque nuit vers 4 h** par GitHub et publié ici :

**https://jeanml250.github.io/stats-inter-ligue/**

Sur l'iPhone ou l'iPad : ouvrir l'adresse dans Safari, puis Partager → **Sur l'écran d'accueil**.
En bas de la page : téléchargement des fichiers Excel et du guide.

- **Mise à jour immédiate** (après un tournoi) : sur github.com, dépôt `stats-inter-ligue`,
  onglet **Actions** → **Mise à jour** → **Run workflow**. Le rapport est en ligne 3 à 5 minutes plus tard.
- **Modifier `correspondances.tsv`, `homonymes.tsv` ou `evenements.tsv`** : sur github.com, ouvrir
  le fichier, crayon ✏️ (Edit), puis **Commit changes**. La mise à jour se relance d'elle-même.
- La page est **publique** : toute personne qui connaît l'adresse peut la consulter.

## Utilisation sur le Mac

Ouvrir le Terminal dans ce dossier, puis :

```bash
node extraire.mjs
```

Le programme lit les tournois et les ligues sur Lexer, puis produit dans `resultats/` :

- **rapport.html** : à ouvrir dans un navigateur (double-clic). Onglet *Tournois* (choix du
  tournoi, joueurs, ligues, moyennes, écart, regroupement par équipe) et onglet *Joueur*
  (recherche par nom : tournois joués, ligues représentées, moyenne de référence et jouée
  à chaque tournoi, résultat de l'équipe).
- **participations.csv** : une ligne par joueur par équipe, s'ouvre dans Excel.
- **donnees.json** : toutes les données brutes.

Interroger un joueur directement dans le Terminal :

```bash
node extraire.mjs joueur "Guy Pelletier"
```

## Mise à jour

Relancer `node extraire.mjs` après chaque nouveau tournoi. Les pages déjà lues sont gardées
dans `cache/`. Seules les pages récentes (saison en cours, tournois de l'année) sont relues ;
la mise à jour prend donc quelques minutes au plus. `--rafraichir` force la relecture de tout.

Les nouveaux tournois (`interligue<mois><année>`, `interliguefinale<année>`) et les nouvelles
saisons des ligues connues sont trouvés automatiquement. Si un événement a une adresse
inhabituelle, il suffit de l'ajouter à **evenements.tsv** (nom, adresse Lexer, type :
`interligue`, `ligue` ou `autre`). L'adresse est la fin du lien « Résultats » sur Bowl4U, par
exemple `https://bowling.lexerbowling.com/salondequillesmontmorency/`**`interligueavril2026`**.

## Moyenne de référence

Lexer ne publie que la moyenne déclarée de l'équipe, pas celle de chaque joueur. Pour chaque
joueur et chaque tournoi :

1. dans chaque ligue de la saison en cours, moyenne cumulative du joueur **avant la première
   journée du tournoi**, si elle compte au moins 20 parties ; on garde la plus haute ;
2. sinon, la plus haute moyenne finale de la **saison précédente** (minimum 20 parties) ;
3. la moyenne retenue est tronquée à l'entier ; écart = moyenne jouée − moyenne de référence.

## Noms écrits différemment

Si un nom du tournoi n'existe pas tel quel en ligue, le logiciel cherche un nom très proche
(1 ou 2 lettres de différence), de préférence dans la ligue de l'équipe. Pour un nom avec
précision entre parenthèses (« Richard Lapointe (Bot) »), il se limite à la ligue désignée
(Bot → Bottines Roulantes) ou à celle de l'équipe. Ces cas sont listés dans
`resultats/noms-a-verifier.csv`.

Pour imposer ou bloquer une correspondance, ajouter une ligne à **correspondances.tsv** :
nom au tournoi, tabulation, nom en ligue (vide = pas de rapprochement). Ces lignes ont priorité.

Le guide complet est dans `Guide-utilisateur-Stats-Inter-Ligue.pdf` (régénérable avec
`zsh guide/generer-guide.sh`).

## Homonymes

Un même nom dans plusieurs ligues = une seule personne, sauf s'il est déclaré dans
**homonymes.tsv** : nom, tabulation, ligues de cette personne (séparées par des virgules).
Les ligues non citées appartiennent à l'autre personne du même nom. Les homonymes probables
(horaires de ligues en conflit, écart de moyenne de 30 et plus) sont signalés dans
`resultats/noms-a-verifier.csv`.
