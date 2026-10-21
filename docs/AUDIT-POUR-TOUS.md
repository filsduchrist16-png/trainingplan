# Sentier : audit du moteur et spécification « pour tous »

21 octobre 2026 · Nicolas Girard

> Document de référence pour Claude Code : chaque tâche (T1 à T13) indique les fichiers, la règle chiffrée et les tests d'acceptation.
> Les choix d'interprétation faits pendant l'implémentation sont listés à la fin, dans « Décisions d'implémentation ».

## Résumé

Le moteur de Sentier est solide pour les coureurs qui courent déjà 20 minutes d'affilée, mais le parcours marche/course a 6 défauts qui touchent directement tes clients débutants. Le plus grave : un débutant inscrit à une course reçoit une sortie longue en course continue dès la semaine 1, puis passe en course continue avec strides à la semaine 5, alors qu'il ne court que 5 minutes d'affilée.

Ce document sert de cahier des charges pour Claude Code. Chaque changement a un identifiant (T1, T2…), les fichiers à modifier, la règle chiffrée et les tests d'acceptation.

**Priorités, dans l'ordre :**

1. Corriger le parcours marche/course (T1 à T7) : séances en minutes, échelle validée par le réalisé, pas de sortie longue ni de qualité avant 20 min continues, démarrage jamais tronqué.
2. Ajouter un questionnaire santé et des profils (T8 à T11) : santé cardiaque, médicaments, âge, poids, grossesse, post-partum, blessure récente.
3. Combler les cas de disponibilité et d'objectifs irréalistes (T12, T13).

Audit fait sur le commit `b3b0398` : 314 tests passent, et les défauts ont été reproduits en générant des plans réels avec `generatePlan` et `buildWeekSessions`. Rien ne remplace la validation des seuils par un professionnel : les valeurs marquées *À VALIDER* restent ajustables dans `constants.ts`.

## Audit du moteur

Les fondations sont bonnes : moteur pur et testé, règle des 10 % contre le max des 4 semaines, garde-fous douleur, explication pour chaque décision. Les défauts se concentrent sur la transition marche/course → course continue et sur l'absence de profil santé.

**Méthode.** Plans générés avec `generatePlan` puis `buildWeekSessions` (même chaîne que `src/data/planner.ts`) pour 6 profils : jamais couru (10 et 6 semaines, 3 et 2 jours), jamais couru vers un 5 km en 10 semaines, débutant qui court 4 min vers un 10 km en 12 semaines, régulier sans info de capacité.

### Constats

| ID | Gravité | Constat | Où | Preuve (plan généré) |
| --- | --- | --- | --- | --- |
| F1 | Critique | Pendant le démarrage d'un objectif course, la sortie longue est en course continue | `scheduling.ts`, `buildWeekSessions` : la longue n'est sautée que si `family === 'debuter'`, pas si `phase === 'demarrage'` | Jamais couru, 5 km : S1 = 2 × marche-course 1/1 + « Longue 15 min » continue |
| F2 | Critique | Le démarrage est tronqué au nombre de semaines de base, puis la course continue commence | `periodization.ts` : `dem = min(nb semaines base, weeksToExit)` | Débutant 4 min, 10 km : 4 semaines de démarrage au lieu de 7, puis S5 « Z2 15 min + 6 strides » alors que l'échelle en est à 5 min |
| F3 | Élevée | L'échelle avance d'un cran par semaine de plan, quoi qu'il arrive : décharge, séance ratée, douleur, semaine sautée | `builders.ts`, `runWalk` : index = `runWalkStage + planWeek` ; aucun lien avec le réalisé | S8 (décharge) passe de 10 à 15 min de course |
| F4 | Élevée | Sauts trop brusques et temps de course total irrégulier | `RUN_WALK_LADDER_MIN` (5 → 8, 10 → 15, 20 → 30) et arrondi de `reps` | Course totale par séance : 8, 10, 15, 12, 15, 16, 20, 15, 20, 30 min. S9 → S10 : +50 % |
| F5 | Élevée | « Courir de zéro » en 6 semaines finit à 2 × 8 min, sans avertissement | `periodization.ts`, branche `debuter` | 6 semaines : dernière séance 2 × (8 min course / 2 min marche) |
| F6 | Élevée | Le volume se bloque après le démarrage | `periodization.ts` : `sessionRoom = jours × longue` alors que `longue = part × volume` ; les deux se limitent mutuellement | 5 km et 10 km : plafond de 7,5 km/sem jusqu'à l'affûtage (hors décharges), longue figée à 2,5 km |
| F7 | Moyenne | La longue est plus courte que les sorties faciles | `strides()` impose 15 min + strides, la longue est convertie depuis 2,5 km | « Longue 20 min » vs « Z2 15 min + 8 strides » (25 min) |
| F8 | Moyenne | Séances marche/course dimensionnées en km à 7 min/km : 14 à 19 min, sans échauffement ni retour au calme marchés | `runWalk` : `total = km × allure Z2 × 1,15` | S2 : 5 × (2/1) = 14 min. Référence Couch to 5K : 5 min de marche + 20 min, soit 25 min |
| F9 | Moyenne | Le test de calibration (remplacé par des strides) tombe en semaine 2 même en marche/course | `scheduling.ts` : `needsTest` ignore la phase | Régulier sans info : S2 = « Z2 15 min + 6 strides » au milieu du démarrage |
| F10 | Moyenne | Semaine de course pensée pour un coureur continu | `racePace` et `raceDay` | 5 km après démarrage : « Allure course 2 × 5 min », course en continu sans option marche/course |
| F11 | Moyenne | Aucun dépistage santé ; âge, poids et sexe ne servent qu'à la FCmax | `types.ts` (`Athlete`), `NewGoal.tsx` | Aucun champ grossesse, post-partum, médicaments, maladie cardiaque |
| F12 | Faible | « Je sais pas » fait démarrer un régulier à 1 min de course | `startMode`, source `inconnue` | Prudent mais démotivant ; aucun test de terrain proposé |
| F13 | Faible | 2 jours par semaine progressent aussi vite que 3 | `runWalk` avance par semaine, pas par séance | Jamais couru, 2 j/sem : même échelle qu'à 3 j/sem |

### Ce qui fonctionne et doit rester

- Capacité continue comme critère d'entrée en marche/course (`startMode`), plutôt que le volume.
- Plafonds par séance pour les débutants, règle des 10 % contre le max des 4 dernières semaines.
- Garde-fous douleur et priorité santé > état du jour > charge > plan.
- Explications `Explanation` sur chaque décision : chaque nouvelle règle de ce document doit en produire une.

## Spécification marche/course

Le démarrage devient un parcours à part entière, piloté en **minutes** et en **séances validées**, pas en km ni en numéro de semaine. Personne ne reçoit de course continue, de sortie longue, de strides, de test ou de qualité avant d'avoir couru 20 min d'affilée deux fois sans difficulté.

### Les 4 étapes du parcours

1. **Marche d'abord** (nouveau, niveau 0) : pour qui ne marche pas 30 min d'un bon pas sans gêne. 3 à 5 marches par semaine, de 20 à 40 min, +5 min par séance validée. Sortie : 30 min de marche rapide sans douleur, 2 fois de suite.
2. **Marche/course** : l'échelle ci-dessous, une marche se valide par séance.
3. **Transition continue** : 20 → 22 → 24 → 26 → 28 → 30 min de course continue facile, un palier par 2 séances validées. Strides autorisés seulement à partir de 30 min.
4. **Base normale** : le moteur actuel reprend la main (phases, longue, qualité), avec au moins 4 semaines de base avant toute séance clé.

### L'échelle (remplace `RUN_WALK_LADDER_MIN`)

Chaque séance = 5 min de marche rapide + le bloc principal + 5 min de marche lente, soit 30 à 45 min au total. Le temps de course total ne grimpe jamais de plus de 25 % d'une marche à l'autre.

| Marche | Course | Marche | Répétitions | Course totale |
| --- | --- | --- | --- | --- |
| 1 | 30 s | 60 s | 14 | 7 min |
| 2 | 60 s | 90 s | 8 | 8 min |
| 3 | 60 s | 60 s | 10 | 10 min |
| 4 | 90 s | 60 s | 8 | 12 min |
| 5 | 2 min | 60 s | 7 | 14 min |
| 6 | 3 min | 60 s | 5 | 15 min |
| 7 | 4 min | 60 s | 4 | 16 min |
| 8 | 5 min | 60 s | 4 | 20 min |
| 9 | 7 min | 60 s | 3 | 21 min |
| 10 | 10 min | 60 s | 2 | 20 min |
| 11 | 12 min | 60 s | 2 | 24 min |
| 12 | 15 min | 60 s | 2 | 30 min |
| 13 | 20 min | — | 1 | 20 min continues |

Les valeurs sont *À VALIDER* par un professionnel ; elles suivent l'esprit du Couch to 5K (semaine 1 : 60 s de course / 90 s de marche après 5 min de marche rapide).

### Point d'entrée

- On garde `startMode` (capacité continue × expérience). Le premier palier est le plus haut dont l'intervalle de course est ≤ 50 % de la capacité continue déclarée.
- Capacité < 1 min ou « Je sais pas » chez un `jamais` : palier 1.
- Nouvelle question au questionnaire : « Peux-tu marcher 30 min d'un bon pas sans gêne ? » Non → niveau 0 (marche d'abord).
- « Je sais pas » chez un `regulier` ou `debutant` : proposer une **séance d'évaluation** (5 min de marche, puis course facile jusqu'à 10 min maximum, arrêt dès que parler devient difficile). La durée tenue fixe le palier.

### Progression : la règle de validation

Une séance est **validée** si les 3 conditions sont réunies :

- tous les intervalles de course ont été faits (case « J'ai tout fait », ou déduit de l'activité importée) ;
- RPE de la séance ≤ 5 sur 10 (« je pouvais parler ») ;
- aucune douleur ≥ 3 déclarée dans les 24 h, et aucun garde-fou santé actif.

Règles d'avancement (constantes *À VALIDER* dans `constants.ts`) :

| Situation | Décision |
| --- | --- |
| 2 séances validées de suite au même palier | Palier suivant |
| Séance faite mais RPE 6-7 | On répète le palier |
| Séance non terminée ou RPE ≥ 8 | On répète le palier ; si 2 échecs de suite, on recule d'un palier |
| Douleur 1-2 (garde-fou « avertissement ») | On répète le palier, pas d'avancement |
| Douleur ≥ 3 ou STOP du garde-fou | Règles existantes de `guards.ts`, puis reprise un palier plus bas |
| Aucune séance pendant 7 à 13 jours | On répète le dernier palier validé |
| Aucune séance pendant 14 à 27 jours | On recule de 2 paliers |
| Aucune séance pendant 28 jours ou plus | On recalcule le point d'entrée avec `startMode` |
| Profil « lent » (voir spécification pour tous) | 3 séances validées au lieu de 2 |

Conséquence : la vitesse de progression découle du nombre de séances, ce qui règle aussi le cas 2 jours/semaine (F13).

### Règles de semaine pendant le démarrage

- Toutes les séances de course sont des marche/course au palier courant, **y compris le jour de la longue** (corrige F1). Le jour de la longue peut ajouter 10 min de marche.
- Volume hebdo exprimé en **minutes** (durée des séances), les km sont seulement affichés, estimés avec une allure marche/course réaliste.
- 3 séances par semaine recommandées, jamais 2 jours de suite. Au-delà de 3 jours disponibles, les jours en plus deviennent de la marche ou du croisé.
- Pas de semaine de décharge en km : l'échelle tient déjà compte de la fatigue (répétitions de palier). Une semaine « allégée » est réduite à 2 séances au palier courant, sans avancer.
- Ni séance clé, ni strides, ni sprints, ni test, ni muscu pliométrique. La muscu générale reste permise (poids du corps).

### Objectif course avec un coureur en marche/course

- Le démarrage n'est **jamais tronqué** (corrige F2) : durée estimée = (paliers restants × 2 séances ÷ séances par semaine) + 3 semaines de transition + 4 semaines de base minimum.
- Si la date de course arrive avant : avertissement `plan.runwalk.short` et 2 choix proposés à la personne : courir l'épreuve en marche/course (stratégie valable, affichée comme telle), ou décaler l'objectif.
- Si la course a lieu pendant le démarrage, le jour de course est une marche/course au palier courant, et la semaine de course n'a pas de séance « allure course » (corrige F10).
- Les phases spécifiques ne commencent qu'après 30 min continues + 4 semaines de base.

### Plan « Courir de zéro »

- Durée calculée à partir du palier d'entrée, pas fixée : depuis le palier 1 à 3 séances par semaine, environ 9 semaines pour courir 20 min (26 séances validées) et 12 semaines pour 30 min.
- Si la personne choisit une durée plus courte : avertissement explicite « ton plan finira au palier X » (corrige F5), sans accélérer l'échelle.
- Fin de plan : bilan (« tu cours 30 min ») et proposition d'un objectif 5 km ou « garder la forme ».

## Spécification « pour tous »

Pour couvrir tout le monde, le moteur a besoin d'un profil santé à l'inscription et de règles par profil qui **restreignent** le plan, jamais l'inverse. La priorité existante est conservée : santé > état du jour > charge > plan.

### Questionnaire santé à l'inscription

Inspiré du PAR-Q+ et de l'algorithme de dépistage de l'ACSM, qui croisent l'activité actuelle, les antécédents ou symptômes cardiovasculaires, métaboliques ou rénaux, et l'intensité visée. Les questions sont reformulées dans l'app, sans reprendre le texte officiel mot pour mot ; vérifier les conditions d'utilisation du PAR-Q+ avant de s'en inspirer de près.

| Code | Question (oui/non) | Si oui |
| --- | --- | --- |
| Q1 | Un médecin t'a déjà parlé d'un problème cardiaque ou d'hypertension ? | Plan prudent + recommandation forte de consulter |
| Q2 | Douleur ou serrement dans la poitrine, au repos ou à l'effort ? | **Blocage** : pas de plan avant confirmation « un médecin m'autorise » |
| Q3 | Étourdissement avec perte d'équilibre ou perte de connaissance dans les 12 derniers mois ? | **Blocage** comme Q2 |
| Q4 | Autre maladie chronique (diabète, asthme, maladie rénale…) ? | Plan prudent + conseils spécifiques (voir tableau des profils) |
| Q5 | Médicament régulier pour une maladie chronique ? | Si bêtabloquant ou médicament qui modifie la FC : zones au RPE |
| Q6 | Problème d'os, d'articulation, de muscle ou de tendon dans les 12 derniers mois ? | Profil « retour de blessure » |
| Q7 | Un médecin t'a dit de ne faire que de l'activité supervisée ? | **Blocage** comme Q2 |
| Q8 | Es-tu enceinte, ou as-tu accouché dans les 12 derniers mois ? | Profil grossesse ou post-partum |
| Q9 | Peux-tu marcher 30 min d'un bon pas sans gêne ? | Non → niveau 0 « marche d'abord » |

- **Plan prudent** = difficulté forcée à `prudent`, aucune intensité au-dessus de Z2 (RPE 5) pendant les 4 premières semaines, pas de test à fond, marche/course d'office pour `jamais` et `debutant`.
- **Blocage** = le moteur renvoie `ok: false` avec l'explication `health.clearance`. La personne débloque en cochant « Un médecin m'autorise », date enregistrée. Le plan reste alors « prudent ».
- Questionnaire à refaire tous les 12 mois, ou dès qu'une réponse change.

### Profils et règles

Seuils *À VALIDER* par un professionnel, tous dans `constants.ts`.

| Profil | Détection | Règles |
| --- | --- | --- |
| Niveau 0 (sédentaire) | Q9 = non | Marche d'abord, puis marche/course au palier 1 ; profil « lent » |
| Profil lent | Âge ≥ 60 ans, IMC ≥ 30, Q1 ou Q4 = oui, ou retour de blessure | 3 séances validées par palier au lieu de 2 ; cycle de décharge 2:1 au lieu de 3:1 après le démarrage |
| 50 ans et plus | Âge | Cycle 2:1 proposé par défaut ; au plus 1 séance clé la 1re année pour `jamais`/`debutant` ; muscu 2×/sem conseillée |
| 65 ans et plus | Âge | Marche/course par défaut si capacité < 20 min ; ajout d'équilibre dans la muscu ; pas de VO2max sans 6 mois de base |
| Surpoids important (IMC ≥ 30) | Taille + poids | Profil lent ; séances en minutes ; conseil surfaces souples ; jamais 2 jours de suite |
| Bêtabloquants ou FC non fiable | Q5 | Zones au RPE et au test de la parole ; pas de FCmax estimée ni de test FCmax ; debrief FC désactivé |
| Diabète | Q4 | Note sur chaque séance > 45 min : avoir du sucre rapide, contrôle de glycémie selon le médecin |
| Asthme | Q4 | Note : inhalateur sur soi ; échauffement de 10 min minimum |
| Retour de blessure | Q6, ou blessure `active`/`dormante` dans `injuries` | Blessure active : pas de plan de course, croisé seulement. Récente (< 12 sem.) : expérience rétrogradée d'un niveau, marche/course si capacité < 20 min |
| Grossesse | Q8 | Pas d'objectif course ni de plan qui augmente le volume ; « garder la forme » au RPE ≤ 5-6 ; qui ne courait pas avant : marche seulement ; liste de signaux d'arrêt ; validation par le suivi de grossesse |
| Post-partum | Q8 + date d'accouchement | Pas de course avant 3 mois ; test de reprise avant la 1re course (marche 30 min, équilibre sur une jambe 10 s, 10 squats sur une jambe, 1 min de jogging sur place, 10 sauts sur chaque jambe…) ; un symptôme (fuites, lourdeur pelvienne, douleur) → marche seulement + physio périnéale ; sinon marche/course quelle que soit l'expérience passée |
| Mineur | Âge < 18 | Pas de marathon, trail moyen ni ultra ; difficulté au plus `equilibre` |

### Disponibilité et objectifs irréalistes

- **1 jour par semaine** : pas de plan de course ; proposer « garder la forme » ou marche/course avec un message honnête sur la progression lente.
- **2 jours par semaine** : la progression marche/course par séance règle le rythme ; aucune séance clé tant que la course continue < 30 min.
- **Objectif trop ambitieux** (ex. jamais couru, marathon dans 16 semaines) : avertissement `plan.unrealistic` avec la durée minimale estimée (démarrage + transition + base + phases de l'objectif) et 2 propositions : objectif intermédiaire, ou date plus lointaine.

### Nouveaux champs de données

- `Athlete` : `heightCm?`, `health?: { answers: Record<'q1'…'q9', boolean>; answeredAt: ISODate; clearance?: ISODate; hrUnreliable?: boolean; conditions: ('diabete' | 'asthme' | 'cardio' | 'autre')[]; pregnancy?: { status: 'enceinte' | 'post_partum'; dueOrBirthDate: ISODate }; canWalk30?: boolean }`.
- `Athlete` : `runWalk?: { stage: number; validatedAtStage: number; failsAtStage: number; lastSessionDate?: ISODate }` (état persistant de l'échelle).
- `Subjective` : `completed?: boolean` (« j'ai fait tous les intervalles »).
- Migration Dexie et schéma zod du backup à mettre à jour (`src/data/db.ts`, `src/data/backup.ts`).

## Plan d'implémentation pour Claude Code

13 tâches en 3 lots, à faire dans l'ordre : une tâche = une branche ou un commit, tests verts avant de passer à la suivante.

### Consignes à donner à Claude Code

```markdown
Tu travailles sur Sentier (repo trainingplan). Lis d'abord README.md, docs/ENGINE.md et docs/AUDIT-POUR-TOUS.md.
Implémente les tâches T1 à T13 de docs/AUDIT-POUR-TOUS.md, dans l'ordre, une tâche par commit.
Règles du projet à respecter :
- src/engine reste PUR (aucun import React, Dexie ou DOM ; vérifié par ESLint), couverture 100 %.
- Aucune règle de coaching dans l'UI : l'UI affiche ce que le moteur décide.
- Toute décision nouvelle renvoie une Explanation (ruleId, severity, title, why, values) en français.
- Tout seuil va dans src/engine/constants.ts, nommé et commenté, marqué « À VALIDER » s'il vient de la pratique courante.
- Mets à jour docs/ENGINE.md à chaque règle ajoutée ou modifiée.
- Avant chaque commit : pnpm lint, pnpm typecheck, pnpm test ; pnpm e2e pour les tâches qui touchent l'UI.
Si une règle du document est ambiguë ou contredit le code, arrête-toi et pose la question au lieu de deviner.
```

### Lot 1 : parcours marche/course

- [ ] **T1. Échelle en minutes et séance complète.**
    - `constants.ts` : remplacer `RUN_WALK_LADDER_MIN` par `RUN_WALK_LADDER` (tableau de `{ runSec, walkSec, reps }`, les 13 paliers de la spécification) ; ajouter `RUN_WALK_WARMUP_MIN = 5`, `RUN_WALK_COOLDOWN_MIN = 5`, `CONTINUOUS_TRANSITION_MIN = [20, 22, 24, 26, 28, 30]`.
    - `builders.ts`, `runWalk(stage, ctx)` : prend un palier, plus des km. Étapes = marche rapide 5 min + répétitions + marche 5 min. Distance estimée avec une allure de marche (`WALK_PACE_MIN_PER_KM = 11`, À VALIDER).
    - Tests : chaque palier dure entre 30 et 45 min ; le temps de course total ne monte jamais de plus de 25 % d'un palier à l'autre ; le palier 13 est continu.
- [ ] **T2. État de l'échelle et règle de validation.**
    - Nouveau module pur `src/engine/runwalk.ts` : `nextRunWalkState(state, sessions, painLogs, today)` qui applique le tableau « Progression » (2 validées → palier suivant, échecs, douleur, trous de 7, 14 et 28 jours, profil lent).
    - Chaque décision renvoie une Explanation (`runwalk.advance`, `runwalk.repeat`, `runwalk.back`, `runwalk.gap`, `runwalk.restart`).
    - Tests : un cas par ligne du tableau, plus le cas 2 jours/semaine (12 séances validées → 6 paliers, quel que soit le nombre de semaines).
- [ ] **T3. Pas de longue, de qualité, de strides ni de test pendant le démarrage.**
    - `scheduling.ts` : si `week.phase === 'demarrage'` ou transition continue, toutes les sorties sont `runWalk(stage)` y compris le jour de la longue ; `needsTest` exige `phase !== 'demarrage'` ; strides et sprints interdits avant 30 min continues.
    - Tests (régression F1, F9) : jamais couru + 5 km en 10 semaines → aucune séance `longue_facile`, `strides`, `test` ou clé pendant le démarrage.
- [ ] **T4. Démarrage jamais tronqué, objectif course adapté.**
    - `periodization.ts` : durée du démarrage = estimation de la spécification (paliers restants × séances requises ÷ séances par semaine) + transition ; les phases de l'objectif se placent après, plus 4 semaines de base minimum.
    - Si la course tombe avant : `plan.runwalk.short` (attention) et un champ `options: ['course_en_marche_course', 'decaler']` dans `PlanDraft`.
    - Course pendant le démarrage : `raceDay` en marche/course au palier courant, pas de `racePace` dans la semaine.
    - Tests (régression F2, F10) : débutant 4 min + 10 km en 12 semaines → avertissement, aucune séance continue avant le palier 13.
- [ ] **T5. Débloquer le volume après le démarrage.**
    - `periodization.ts` : supprimer la boucle `sessionRoom = jours × longue` / `longue = part × volume`. Calculer d'abord la longue (croissance de 10 % de la plus longue récente), puis plafonner le volume à `jours × longue`, puis faire croître la longue même si le volume est plafonné.
    - Garantir que la longue est la sortie la plus longue de la semaine (corrige F7 : ajuster `strides()` pour ne pas imposer 15 min si la longue est plus courte).
    - Tests (régression F6) : 5 km en 16 semaines depuis 0 → le volume augmente au moins toutes les 3 semaines hors décharge ; pour chaque semaine, durée de la longue ≥ durée de toute autre sortie.
- [ ] **T6. Plan « Courir de zéro » à durée calculée.**
    - Durée par défaut = estimation depuis le palier d'entrée ; durée plus courte choisie → `plan.debuter.short` avec le palier de fin prévu (régression F5).
- [ ] **T7. Brancher l'échelle sur le réalisé (data + UI).**
    - `src/data/planner.ts` et le log rapide (`QuickLogSheet.tsx`) : case « J'ai fait tous les intervalles » + RPE ; après chaque log, appeler `nextRunWalkState`, persister `athlete.runWalk`, régénérer les séances marche/course futures de la semaine.
    - Écran Aujourd'hui : afficher le palier (« Palier 5 sur 13 ») et l'Explanation de la dernière décision.
    - Test e2e : log de 2 séances validées → la séance suivante passe au palier suivant ; log d'une séance RPE 8 → palier répété.

### Lot 2 : santé et profils

- [ ] **T8. Questionnaire santé.** Champs `Athlete.health` et `heightCm` (types, Dexie, zod du backup) ; nouvelle étape dans `NewGoal.tsx` et dans Réglages ; module pur `src/engine/screening.ts` : `screen(health, today)` → `{ level: 'ok' | 'prudent' | 'bloque', explanations }`. Tests : un cas par question Q1 à Q9, et le déblocage par `clearance`.
- [ ] **T9. Appliquer le dépistage au plan.** `generatePlan` reçoit le résultat de `screen` : `bloque` → `ok: false` + `health.clearance` ; `prudent` → difficulté `prudent`, pas de test, aucune séance clé les 4 premières semaines.
- [ ] **T10. Profils âge, IMC, FC non fiable, maladies, mineurs.** Module pur `src/engine/profiles.ts` qui dérive les ajustements du tableau des profils (`slow`, `deloadCycle`, `maxKeySessions`, `hrUnreliable`, `sessionNotes`, `forbiddenGoals`) ; `scheduling.ts` et `periodization.ts` les consomment. Zones au RPE si `hrUnreliable` (`zones.ts`, `debrief.ts`). Tests : un cas par ligne du tableau.
- [ ] **T11. Grossesse et post-partum.** Règles du tableau ; test de reprise post-partum comme liste à cocher dans l'UI ; symptôme coché → plan de marche + Explanation qui conseille une physio périnéale. Tests : post-partum à 8 semaines → aucune séance de course ; à 14 semaines sans symptôme → marche/course au palier 1.

### Lot 3 : cas limites

- [ ] **T12. Disponibilité 1 ou 2 jours.** 1 jour → objectifs course refusés avec explication ; 2 jours → aucune séance clé tant que la course continue < 30 min.
- [ ] **T13. Objectif irréaliste et séance d'évaluation.** `plan.unrealistic` avec durée minimale et alternatives ; séance d'évaluation pour « Je sais pas » chez `debutant`/`regulier` (régression F12).

### Tests de régression globaux

Ajouter `src/engine/personas.test.ts` qui génère un plan complet (plan + séances de chaque semaine) pour ces personas et vérifie les invariants ci-dessous :

| Persona | Objectif |
| --- | --- |
| Jamais couru, 3 j/sem, ne marche pas 30 min | Courir de zéro |
| Jamais couru, 3 j/sem | 5 km dans 10 et 20 semaines |
| Débutant, court 4 min, 3 j/sem | 10 km dans 12 semaines |
| Jamais couru, 2 j/sem | Courir de zéro |
| 62 ans, IMC 32, bêtabloquant | Garder la forme, puis 5 km |
| Post-partum 4 mois, ancienne coureuse régulière | 10 km |
| Régulier, « Je sais pas » | Semi-marathon |

Invariants vérifiés pour chaque persona :

1. Aucune séance continue, longue, clé, strides ou test avant le palier 13 validé.
2. Temps de course par séance : jamais plus de +25 % d'une séance à la suivante en marche/course, +10 % ensuite.
3. La longue est toujours la plus longue sortie de la semaine.
4. Volume hebdo jamais au-delà de +10 % du max des 4 dernières semaines.
5. Toute restriction (blocage, prudent, avertissement) est accompagnée d'une Explanation.

## Sources

- Code audité : [filsduchrist16-png/trainingplan](https://github.com/filsduchrist16-png/trainingplan), commit `b3b0398`, en particulier `docs/ENGINE.md` et `src/engine/`.
- [Couch to 5K, plan semaine par semaine (RCT Council)](https://www.rctcbc.gov.uk/EN/Events/NosGalan/RelatedDocuments/couchto5k.pdf) : 5 min de marche rapide, puis 60 s de course / 90 s de marche en semaine 1, 3 séances par semaine.
- [ACSM, nouveau dépistage avant l'exercice](https://www.acsm.org/blog-detail/acsm-certified-blog/2018/02/01/exercise-preparticipation-screening-removing-barriers-initiating-exercise) : activité actuelle, antécédents ou symptômes cardiovasculaires, métaboliques ou rénaux, intensité visée.
- [PAR-Q+ 2025 (formulaire)](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf) : les 7 questions générales dont s'inspire le questionnaire (Q1 à Q7).
- [Returning to running postnatal, Goom, Donnelly et Brockwell (2019)](https://athleticsni.org/download/files/Returning_to_running_postnatal_guideline_for_medical_health_and_fitness_professionals_managing_this_population.05.pdf) : pas de course avant 3 mois, tests de charge et d'impact, signaux d'alerte pelviens.

Les règles grossesse, âge, IMC et maladies chroniques sont des ordres de grandeur prudents, non tirés d'une source unique : à faire valider par un médecin du sport ou un physio avant la mise en production.

## Décisions d'implémentation

Points ambigus tranchés avec Nicolas avant de coder (21 oct. 2026) :

1. **Invariant 2, « +10 % ensuite »** : appliqué à la **plus longue séance de la semaine** (pas séance par séance dans l'ordre chronologique), **pour tout le monde**. Conséquences : plus de pas minimum de 1,5 km pour la sortie longue (croissance de 10 % pure), longues arrondies à la minute et au 0,1 km inférieur. Pendant la marche/course, la règle « +25 % » se lit séance par séance, comme l'échelle est construite.
2. **Séance importée sans RPE** : on répète le palier (pas d'avancement) et le debrief demande le RPE ; la séance est réévaluée dès qu'il est noté.
3. **Transition continue (20 → 30 min)** : comptée en séances validées (un palier par 2 séances, 3 en profil lent), soit ≈ 4 semaines à 3 séances/sem, ce qui donne bien les 12 semaines annoncées pour 30 min depuis le palier 1.
4. **« Garder la forme »** : même règle d'entrée que les autres objectifs ; sous le seuil de capacité continue, le plan commence en marche/course (ou marche d'abord).
5. **Volume hebdo pendant le démarrage** : piloté par l'échelle et exprimé en minutes, comme le dit la spécification ; la règle des 10 % en km (invariant 4) s'applique à partir de la base normale.
