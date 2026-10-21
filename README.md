# cardz — Modifier les règles du jeu

Ce guide s’adresse à la personne qui entretient le jeu. Les réglages se modifient dans des fichiers de texte : suivez les noms indiqués ci-dessous et changez une seule chose à la fois.

## 1. Trouver le bon fichier

| Ce que vous voulez modifier | Fichier à ouvrir |
| --- | --- |
| Les consignes, les catégories, les chances de tirage, le tour de parole ou la capsule de fin | `config.json` |
| Le texte des questions supplémentaires, leur catégorie ou leur activation | `data/questions.additional.json` |

Sur GitHub, le premier fichier se trouve sur la page principale du projet. Pour le second, ouvrez d’abord le dossier `data`.

**Conservez les questions originales dans `data/questions.original.json`. Faites vos ajouts dans le fichier des questions supplémentaires pour garder les deux ensembles distincts.**

Les noms de réglages sont parfois en anglais. Ce sont des repères utilisés par le jeu : conservez leur orthographe. Les tableaux de ce guide donnent leur signification en français.

## 2. Faire une modification et l’enregistrer

1. Ouvrez le fichier concerné sur GitHub.
2. Cliquez sur le crayon, en haut du fichier, pour ouvrir la modification.
3. Avant de changer quoi que ce soit, copiez tout le contenu dans un document texte sur votre ordinateur. Cette copie servira à revenir en arrière.
4. Recherchez le nom de la rubrique avec **Ctrl + F**, ou **⌘ + F** sur Mac. Par exemple, cherchez `closure` pour trouver la capsule de fin.
5. Modifiez uniquement la valeur souhaitée. Certains noms reviennent dans plusieurs rubriques : vérifiez toujours le nom de la rubrique qui les contient.
6. Cliquez sur le bouton d’enregistrement. Dans la fenêtre qui s’ouvre, écrivez une courte description, par exemple « Capsule accessible après sept jours ».
7. Pour le projet publié directement depuis la branche `main`, choisissez d’y enregistrer le changement directement, puis confirmez. Si cette possibilité est bloquée par les permissions du projet, demandez à la personne qui les gère de valider la modification.
8. Attendez la mise à jour du site, puis actualisez la page du jeu et commencez une nouvelle partie pour vérifier le résultat.

**Exemple :** pour passer le délai de la capsule de cinq à sept jours, trouvez la rubrique `closure`, puis le réglage `delayDays`. Remplacez seulement le nombre `5` par `7`.

Une modification des règles ou des questions peut empêcher la reprise d’une partie déjà enregistrée. Prévoyez ces changements entre deux parties. Les capsules déjà créées conservent leurs propres réglages.

## 3. Reconnaître les valeurs sans abîmer le fichier

| Ce que vous voyez | Ce que cela signifie | Comment le modifier |
| --- | --- | --- |
| Du texte entre guillemets droits doubles | Un nom, une phrase ou un choix précis | Changez le texte en gardant les guillemets autour. |
| Un nombre, comme `5` | Une quantité ou une durée | Remplacez le nombre, sans ajouter de guillemets. |
| `true` | Oui, activé | Remplacez par `false` pour désactiver. |
| `false` | Non, désactivé | Remplacez par `true` pour activer. |
| `null`, pour `maxQuestions` | Aucune limite supplémentaire de cartes | Remplacez par un nombre pour fixer une limite. |

Ces fichiers utilisent une présentation appelée **JSON**. Quelques précautions suffisent :

- Gardez les noms des réglages, à gauche des deux-points.
- Conservez les accolades `{ }`, les crochets `[ ]` et les virgules qui entourent les valeurs.
- Les éléments d’une liste sont séparés par une virgule ; le dernier n’en porte pas avant la fermeture de la liste.
- Les guillemets qui encadrent le texte doivent rester des guillemets droits doubles, comme `"`. Dans vos phrases, utilisez plutôt « ces guillemets » si vous devez citer des mots.
- Écrivez `true`, `false` et `null` exactement ainsi, en minuscules et sans guillemets.
- N’ajoutez pas de commentaire personnel entre les réglages.

Pour une première modification, remplacez une valeur existante plutôt que d’ajouter ou de supprimer des lignes.

## 4. Modifier les consignes affichées aux joueurs

Dans `config.json`, cherchez la rubrique `rules`.

| Réglage | Ce que vous modifiez |
| --- | --- |
| `title` | Le titre de la fenêtre des règles. |
| `items` | La liste des consignes. Chaque phrase entre guillemets correspond à une consigne. |
| `howTo` → `title` | Le titre de chaque étape d’explication. |
| `howTo` → `text` | Le texte de cette étape. |

Remplacez les phrases en conservant leurs guillemets et leur ponctuation extérieure. Laissez au moins une consigne et une étape d’explication.

Pour changer une règle appliquée automatiquement par le jeu, modifiez aussi son réglage dans les rubriques suivantes. Par exemple, autoriser les autres personnes à répondre se règle avec `allowAdditionalResponders` ; adaptez ensuite la consigne pour qu’elle corresponde au comportement choisi.

## 5. Changer les chances de tirage

Cherchez la rubrique `ratioStages`. Elle contient plusieurs groupes de réglages, un pour chaque étape de la partie.

| Réglage | Signification |
| --- | --- |
| `from` | Numéro de la première carte de cette étape, inclus. |
| `to` | Numéro de la dernière carte de cette étape, inclus. |
| `weights` | Importance donnée à chaque catégorie lors du tirage. |

Les catégories utilisent les repères suivants :

| Repère dans le fichier | Catégorie |
| --- | --- |
| `ouverture` | Questions pour commencer. |
| `intermediaire` | Questions intermédiaires. |
| `deep` | Questions profondes. |
| `miam` | Questions d’attirance et d’intimité. |

### Comprendre les nombres

Un poids de `0` exclut une catégorie de cette étape. Plus son poids est élevé par rapport aux autres, plus elle a de chances d’être choisie.

Pour faciliter vos calculs, gardez un total de **100** par étape. Par exemple, **50 / 40 / 10 / 0** donne davantage de place aux ouvertures qu’un réglage de **20 / 70 / 10 / 0**. Une somme différente de 100 fonctionne aussi : ce sont les proportions qui comptent.

Ces nombres décrivent des chances à chaque tirage, pas un nombre garanti de cartes. Une catégorie absente du jeu choisi, ou dont toutes les questions ont déjà été utilisées, est écartée. Ses chances sont réparties entre les autres catégories encore disponibles dont le poids est supérieur à zéro. Une catégorie à zéro reste exclue.

**Exemple :** avec des poids de 70 pour les questions intermédiaires, 20 pour les questions profondes et 10 pour les questions d’intimité, un jeu qui exclut l’intimité répartit le tirage entre 70 et 20 : environ 78 % d’intermédiaires et 22 % de questions profondes.

### Valeurs de départ

| Numéros des cartes | Ouverture | Intermédiaire | Profondes | Intimité |
| --- | --- | --- | --- | --- |
| 1 | 100 | 0 | 0 | 0 |
| 2 à 10 | 80 | 20 | 0 | 0 |
| 11 à 25 | 20 | 70 | 10 | 0 |
| 26 à 40 | 0 | 70 | 20 | 10 |
| 41 à 50 | 0 | 30 | 50 | 20 |

Ce tableau rappelle les valeurs initiales. Les valeurs réellement utilisées sont celles du fichier.

Pour modifier une étape, repérez ses nombres `from` et `to`, puis changez les poids dans **ce même groupe**. Gardez au moins une catégorie de poids positif pour chacun des jeux disponibles.

### Modifier les bornes des étapes

La première étape commence à `1`. Les suivantes doivent se suivre sans trou ni chevauchement : une étape finissant à `10` doit être suivie d’une étape commençant à `11`.

Si vous changez une borne de fin, ajustez aussi le début de l’étape suivante. Les numéros progressent à chaque carte tirée, y compris lorsqu’une carte est passée.

## 6. Régler les participants et le tour de parole

Cherchez la rubrique `game`.

| Réglage | Valeurs à utiliser | Effet |
| --- | --- | --- |
| `minPlayers` | Un nombre de 2 à 20 | Minimum de personnes pour une partie. |
| `maxPlayers` | Un nombre de 2 à 20, au moins égal au minimum | Maximum de personnes pour une partie. |
| `firstAsker` | `"first"` ou `"random"` | `"first"` fait commencer le premier prénom ; `"random"` choisit au hasard la personne qui commence. |
| `allowAdditionalResponders` | `true` ou `false` | Autorise ou désactive le choix de répondants supplémentaires. |
| `skipAdvancesAsker` | `true` ou `false` | Avec `true`, passer une carte fait aussi avancer la personne qui pose la question. Avec `false`, elle garde son tour. |
| `noRepeatText` | `true` ou `false` | Avec `true`, deux questions de même formulation ne sont pas proposées dans une partie, même si elles existent à plusieurs endroits. |

Le tour continue dans l’ordre des prénoms après le choix de la première personne. Une même entrée de question ne revient jamais dans la partie ; `noRepeatText` règle seulement le cas de plusieurs entrées de même formulation.

**Exemple :** pour limiter les parties à six personnes, remplacez le `20` de `game` → `maxPlayers` par `6`.

Chaque jeu possède aussi ses propres minimum et maximum dans `decks`. Les limites les plus restrictives s’appliquent. Tous les jeux doivent rester compatibles avec les limites générales. Si vous gardez un jeu réservé à deux personnes, conservez un minimum général de deux personnes.

### Choisir combien de personnes répondent

Dans `game`, trouvez la liste `targetCounts`.

Chaque groupe contient un seuil `minPlayers` et un nombre de répondants `count`. Le jeu utilise le dernier seuil atteint. Au départ :

| Nombre de personnes autour de la table | Nombre de répondants choisis |
| --- | --- |
| 2 ou 3 | 1 |
| À partir de 4 | 2 |

Pour choisir deux répondants dès trois personnes, repérez le groupe contenant `minPlayers` égal à `4` et `count` égal à `2`, puis remplacez son `4` par `3`.

Gardez les seuils dans l’ordre croissant. Le premier doit couvrir le minimum général. Dans chaque groupe, `count` doit être au moins égal à 1 et inférieur à `minPlayers` : la personne qui pose la question ne fait pas partie des répondants tirés au sort.

## 7. Fixer la durée d’une partie

Toujours dans `game` :

| Votre choix | Modification |
| --- | --- |
| Arrêter après 30 cartes tirées | Mettez `30` à la place de `null` dans `maxQuestions`. |
| Ne pas ajouter de limite de cartes | Mettez `null` dans `maxQuestions`. |
| Continuer après la dernière étape de tirage | Mettez `"repeat-last"` dans `afterLastStage`. Le dernier mélange de catégories sera réutilisé. |
| Arrêter à la fin des étapes prévues | Mettez `"stop"` dans `afterLastStage`. |

Ces limites se cumulent : la première atteinte arrête la pioche. Elle peut aussi s’arrêter plus tôt s’il ne reste aucune question disponible dans les catégories autorisées à cette étape.

## 8. Modifier les jeux proposés

Cherchez la rubrique `decks`. Chaque groupe décrit un jeu :

| Repère `id` | Nom initial |
| --- | --- |
| `base` | Entre nous |
| `miam` | Un peu plus… |
| `couple` | Toi & moi |

Dans le groupe souhaité :

- `label` change le nom affiché ; `description` change sa présentation.
- `categories` indique les catégories autorisées dans ce jeu. Utilisez les repères présentés à la section 5.
- `excludedTags` indique les étiquettes de questions à exclure. Par exemple, l’étiquette `couple` écarte les questions réservées au couple.
- `minPlayers` et `maxPlayers` fixent ses limites de participants. Le jeu « Toi & moi » est initialement réservé à deux personnes.

Pour ajouter une catégorie à une liste ou en retirer une, gardez les guillemets autour de chaque repère et les virgules entre les éléments. Le jeu doit conserver au moins une catégorie de poids positif à chaque étape.

Pour changer le jeu sélectionné à l’ouverture, cherchez `defaultDeck`, en dehors de la liste `decks`, et choisissez `"base"`, `"miam"` ou `"couple"`. Le jeu choisi doit accepter le nombre minimum général de participants.

### Régler l’intensité des questions de couple

Cherchez la rubrique `categoryMappings`, puis son réglage `couple`. Sa valeur initiale est `"deep"` : les questions de couple utilisent les chances de tirage des questions profondes.

Pour les tirer comme des questions intermédiaires, remplacez cette valeur par `"intermediaire"`. Leur étiquette de couple est conservée : elles restent exclues des jeux qui excluent cette étiquette.

## 9. Modifier ou ajouter une catégorie

Pour simplement renommer une catégorie, cherchez son groupe dans `categories`, puis modifiez `label`. **Gardez son `id` : les questions et les chances de tirage utilisent ce repère.** Vous pouvez également remplacer son `symbol`.

Le réglage `color` contient une couleur sous forme de six caractères précédés de `#`. Pour un changement simple, vous pouvez reprendre l’une des couleurs existantes. Choisissez une teinte claire afin de garder le texte sombre lisible.

Pour créer une catégorie supplémentaire :

1. Dans `categories`, copiez un groupe entier, de son accolade ouvrante à son accolade fermante, et placez la copie à côté des autres groupes. Séparez les groupes par des virgules.
2. Donnez à la copie un nouvel `id`, par exemple `argent`, puis changez son `label`, sa `description` et son `symbol`.
3. Dans `decks`, ajoutez ce nouveau repère à la liste `categories` des jeux qui doivent le proposer.
4. Dans `ratioStages`, ajoutez ce repère à `weights` pour les étapes souhaitées, avec un poids supérieur à zéro lorsqu’il doit sortir. Rééquilibrez les autres poids si vous voulez conserver un total de 100.
5. Ajoutez des questions de cette catégorie dans le fichier des questions supplémentaires, puis activez ce paquet comme expliqué ci-dessous.

Un repère doit commencer par une lettre minuscule, ne contenir que des lettres minuscules sans accent, des chiffres, des tirets ou des traits de soulignement, et rester unique. Ne réutilisez pas `couple` pour une nouvelle catégorie tant que ce nom est déjà présent dans `categoryMappings`.

## 10. Choisir les questions supplémentaires

Dans `config.json`, cherchez la rubrique `sources`, puis le groupe dont le repère `id` est `additional`.

- Pour cocher ce paquet par défaut dans l’accueil du jeu, mettez `defaultEnabled` sur `true`.
- Pour laisser aux joueurs le choix de l’activer, gardez `defaultEnabled` sur `false`.

Ce choix ne supprime aucune question. Les joueurs peuvent modifier les cases avant de commencer une partie.

### Modifier ou désactiver une question supplémentaire

Ouvrez `data/questions.additional.json`, puis repérez la question dans la liste `questions`.

| Réglage de la question | Modification possible |
| --- | --- |
| `text` | Remplacez la phrase, en gardant les guillemets autour. |
| `category` | Choisissez le repère d’une catégorie existante. |
| `enabled` | `true` autorise cette question ; `false` la retire de la pioche. |
| `minPlayers` | Fixez le nombre minimum de personnes pour cette question. |
| `tags` | Ajoutez une étiquette, par exemple `"couple"`, si la question doit être exclue de certains jeux. |

Pour ajouter une question, copiez un groupe de question entier à l’intérieur de la liste `questions`, donnez-lui un nouvel `id`, puis remplacez son texte et sa catégorie. Gardez les virgules entre les groupes et aucune virgule après le dernier. Une question activée peut sortir seulement si son paquet est coché et si sa catégorie est autorisée par le jeu et l’étape de tirage.

Ne changez pas `origin`, `schemaVersion` ou les chemins des fichiers pour une simple modification de question.

## 11. Modifier la capsule de fin à deux

Dans `config.json`, cherchez la rubrique `closure`.

| Réglage | Ce que vous pouvez choisir |
| --- | --- |
| `enabled` | `true` propose la capsule à la clôture d’une partie à deux ; `false` retire cette possibilité. |
| `prompt` | La dernière question à laquelle les deux personnes répondent par écrit. |
| `delayDays` | Un nombre entier de jours, de 0 à 3 650. |
| `maxAnswerLength` | La longueur maximale d’une réponse, entre 100 et 12 000 caractères. |

Conservez `playerCount` à `2` : cette fonctionnalité est prévue pour deux réponses.

Pour essayer une ouverture immédiate, mettez `delayDays` sur `0`, puis créez une **nouvelle** capsule. Remettez ensuite le délai souhaité pour les prochaines parties.

Le nouveau délai s’applique aux capsules créées après le changement. Une capsule existante garde sa date d’ouverture. Le délai repose sur l’horloge de l’appareil : présentez-le comme une règle du jeu, sans promettre un verrouillage impossible à contourner.

## 12. Vérifier le résultat ou revenir en arrière

Après chaque modification :

1. Attendez la mise à jour du site et actualisez sa page.
2. Commencez une nouvelle partie, puis vérifiez le réglage que vous venez de changer.
3. Si un message d’erreur apparaît, relevez le nom du fichier et du réglage indiqués.
4. Pour annuler la modification, ouvrez à nouveau le même fichier sur GitHub, remplacez son contenu par votre copie de sauvegarde, puis enregistrez et actualisez le jeu après sa mise à jour.

| Problème | Vérification à faire |
| --- | --- |
| Le fichier ne peut plus être lu | Cherchez une virgule manquante ou en trop, un guillemet supprimé, une accolade ou un crochet déplacé. |
| Une catégorie est inconnue | Comparez son repère dans la question, les jeux et les étapes de tirage. Les accents, majuscules et espaces comptent. |
| Une étape de tirage est refusée | Vérifiez que les plages se suivent et que chaque jeu conserve une catégorie de poids positif. |
| Aucun jeu ne convient au nombre de personnes | Comparez les minimums et maximums dans `game` et dans `decks`. |
| La pioche s’arrête plus tôt que prévu | Vérifiez la limite de cartes, la fin des étapes et les questions encore disponibles dans les catégories de poids positif. |
| Le paquet supplémentaire n’apparaît plus | Vérifiez le fichier des questions supplémentaires et le message d’erreur affiché à l’accueil. |
| La nouvelle consigne s’affiche, mais le comportement attendu ne suit pas | Modifiez aussi le réglage correspondant dans `game`, `decks`, `ratioStages` ou `closure`. |

Si vous souhaitez une règle qui n’a aucun réglage correspondant dans ce guide, demandez à la personne qui fait évoluer l’application d’ajouter cette possibilité avant de l’annoncer aux joueurs.
