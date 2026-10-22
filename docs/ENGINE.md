# Comment le moteur de Sentier décide

Le moteur (`src/engine/`) est de la logique pure, sans UI, stockage ni réseau, et couverte à 100 % par les tests.
Toute décision renvoie une **`Explanation`** (`ruleId`, gravité, titre, pourquoi, valeurs). C'est ce qui alimente les « Pourquoi? » de l'interface.

Les seuils sont dans [`constants.ts`](../src/engine/constants.ts). Chaque constante est nommée et commentée. Celles marquées **À VALIDER** sont des ordres de grandeur issus de la pratique courante : elles n'ont pas de consensus scientifique net, et on peut les ajuster sans toucher à la logique.

## Ordre de priorité

1. **Santé** (`guards.ts`) : douleur, red flags. Elle l'emporte toujours.
2. **État du jour** (`readiness.ts`) : 🟢 🟡 🔴, nuit courte, sommeil.
3. **Progression et charge** (`progression.ts`, `load.ts`) : 10 %, ACWR.
4. **Plan** (`periodization.ts`, `scheduling.ts`).

Quand le moteur doit choisir, il choisit la santé et le dit.

## Zones et allures

- **Zones cardiaques** en % de la FCmax : bornes 64,7 / 75,3 / 85,3 / 92,6 %. Pour une FCmax de 190, on obtient Z1 < 123, Z2 123-143, Z3 143-162, Z4 162-176, Z5 au-delà. Une variante Karvonen (réserve cardiaque) existe aussi.
- **FCmax** : estimée par l'âge (Tanaka, 208 − 0,7 × âge). Le moteur la marque « estimée » et planifie un test de 3 km en semaine 2. La FCmax retenue est la plus haute FC **soutenue** pendant le test, pas un pic d'artefact du capteur.
- **Niveau de forme (VDOT)** : calculé avec les équations publiées de Daniels et Gilbert à partir d'un temps de course ou d'une VMA. Il fixe toutes les allures (E, M, T, I, R). Comme dans Runna, un seul niveau gouverne tout.
- **Ajustement du niveau** : il faut **3 séances qualité concordantes** (toutes plus rapides que la cible sans être à bloc, ou toutes plus lentes). Une bonne journée isolée ne change rien.

## Charge et ACWR

- **Charge Sentier** = Σ minutes × poids de zone (1 à 5, type TRIMP d'Edwards) + 12 par 100 m de D+. Si les données manquent, le moteur se rabat sur la FC moyenne, puis sur le RPE, puis sur la durée (hypothèse « facile »). Le moteur n'utilise qu'**une** méthode par fenêtre : mélanger le Training Load de Garmin et la charge Sentier fausserait le ratio.
- **ACWR** = charge des 7 derniers jours ÷ moyenne hebdomadaire des 28 derniers jours. La zone verte va de 0,8 à 1,3. Sa valeur prédictive pour les blessures est **débattue** ; l'app la présente comme une tendance, jamais comme une prédiction.
- **Avant 28 jours de données**, le statut est « calibration ». Le moteur ne prétend rien.

## Progression

- **Volume** : au plus +10 % par semaine, mesuré contre le **maximum des 4 dernières semaines**. Comparer à la semaine précédente pénaliserait à tort la remontée après une décharge.
- **Un seul nouveau stress à la fois** : volume OU intensité. À l'entrée d'une phase plus intense, le volume est tenu.

## Marche-course : qui commence comment (`startMode`)

Ce n'est **pas** le volume hebdo qui décide (3 × 4 km est de la course continue, 10 × 1 km n'en est pas), mais ce que la personne peut **courir d'une traite**.

1. **Capacité continue** (minutes), dans l'ordre : ce que la personne déclare ; sinon plus longue sortie × allure facile (7 min/km par défaut) ; sinon volume hebdo ÷ 3 sorties × allure ; sinon *inconnue*.
2. **Seuil selon l'expérience** : marche-course si la capacité est **sous** ce seuil. Jamais couru : 30 min · débutant : 20 min · régulier : 10 min (reprise après une grosse pause) · avancé : jamais. Capacité inconnue : prudence (marche-course, sauf avancé). Seuils marqués *À VALIDER*.
3. **Niveau de départ** : le palier le plus haut dont l'intervalle de course est ≤ 50 % de la capacité continue (palier 1 au minimum).
4. **Le parcours** (`runwalk.ts`, un seul nombre de 0 à 19) :
   - **0 · marche d'abord** : 20 → 30 min de marche rapide, +5 min par séance validée ;
   - **1 à 13 · échelle de marche/course** en minutes (esprit Couch to 5K) : 30 s / 60 s × 14 → … → 15 min / 1 min × 2 → **20 min continues** (palier 13). Chaque séance = 5 min de marche rapide + bloc + 5 min de marche lente, soit 30 à 45 min ; le temps de course ne monte jamais de plus de 25 % d'un palier au suivant ;
   - **14 à 18 · transition continue** : 22, 24, 26, 28, 30 min ;
   - **19 · terminé** : la base normale reprend la main.
   Les km affichés sont estimés (course à l'allure facile, marche à 11 min/km) ; le parcours se pilote en minutes.
5. **Progression par séance validée** (`nextRunWalkState`), pas par semaine. Une séance est validée si tous les intervalles sont faits, RPE ≤ 5 et aucune douleur le jour même ou le lendemain (et aucun garde-fou actif).

   | Situation | Décision |
   |---|---|
   | 2 validées de suite (3 en profil lent) | palier suivant |
   | RPE 6-7, ou douleur 1-2 | on répète (la série repart) |
   | non terminée ou RPE ≥ 8 | on répète ; 2 échecs de suite → un palier plus bas |
   | douleur ≥ 3 ou garde-fou actif | un palier plus bas (après les règles de `guards.ts`) |
   | RPE ou complétion inconnus (import) | on attend, sans pénalité : le RPE noté plus tard réévalue la séance |
   | pause de 7-13 j / 14-27 j / 28 j et plus | on répète / 2 paliers plus bas / point d'entrée recalculé |

   L'état se **recalcule depuis le point d'entrée en rejouant toutes les séances** (journal) : idempotent, et une correction est prise en compte. En « marche d'abord », un échec garde les minutes acquises. Comme tout se compte en séances, 2 jours par semaine progressent simplement plus lentement.
6. **Semaines de démarrage** (`buildJourneyWeek`) : chaque semaine porte le palier prévu de ses séances (projection si toutes sont validées). Toutes les séances sont au palier courant, **y compris le jour de la longue** (+10 min de marche). Au plus 3 séances, **jamais deux jours de suite** ; les jours disponibles en plus deviennent marche ou vélo facultatifs. Ni séance clé, ni strides, ni sprints, ni test, ni plyo (muscu générale permise). Volume exprimé en minutes. Une course qui tombe pendant le démarrage se fait en marche/course au palier courant, sans « allure course ».
7. Le démarrage dure jusqu'à 30 min de course continue (séances à faire ÷ séances par semaine) : il n'est **jamais tronqué**. Viennent ensuite **au moins 4 semaines de base sans séance clé**, puis les phases de l'objectif (spécifiques seulement après).
   Si la course tombe avant « démarrage + 4 semaines de base » : avertissement `plan.runwalk.short` et 2 options (`course_en_marche_course`, `decaler`). Si le démarrage ne finit pas avant l'affûtage, il n'y a pas d'affûtage : la course se fait en marche/course au palier courant.
8. Strides et sprints en côte : seulement quand la sortie longue fait au moins 30 min, pour tout le monde.
9. « Courir de zéro » est toujours évalué comme un premier départ.
10. **Durée de « Courir de zéro »** : calculée, pas fixée. Sans durée choisie, le plan dure le temps du parcours depuis le palier d'entrée (séances à valider ÷ séances par semaine : 12 semaines depuis le palier 1 à 3 séances/sem, 18 à 2 séances/sem). Si la personne choisit une durée plus courte, l'échelle n'est **jamais accélérée** : avertissement `plan.debuter.short` (attention) avec le palier de fin prévu (F5). Plus longue : des semaines de base suivent le parcours. Si la personne court déjà 30 min, durée par défaut de l'objectif.
11. **Bilan de fin** (`plan.debuter.end`, sur la dernière semaine et dans l'aperçu) : « tu cours 30 min », puis proposition d'un objectif 5 km ou « Garder la forme » ; sinon le palier atteint et l'invitation à enchaîner un nouveau plan, qui repart de ce palier.
12. **Branché sur le réalisé** : le plan garde l'état d'entrée (`PlanDraft.runWalkStart`, stocké sur le bloc). Après chaque séance marche/course notée (log rapide avec la case « J'ai fait tous les intervalles » et le RPE, import d'une activité, RPE ajouté au debrief), la couche data rejoue tout le journal avec `nextRunWalkState` (idempotent), enregistre l'état et la dernière décision dans `athlete.runWalk`, puis `rescheduleJourney` re-projette les séances marche/course à venir depuis l'état réel (même règle qu'à la génération, +10 min de marche le jour de la longue sauf semaine de course). Séance importée sans RPE : on répète, et elle compte dès que le RPE est noté. L'écran Aujourd'hui affiche le palier (« Palier 5 sur 13 ») et l'explication de la dernière décision.

## Protection des débutants (longueur de chaque sortie)

Le volume hebdomadaire ne suffit pas : 15 km répartis sur 3 sorties, c'est 5 km chacune, ce qui est trop pour quelqu'un dont la plus longue sortie est de 3 km. Le moteur ajoute donc des règles **par séance** :

- la **sortie longue est calculée avant le volume** (`longRunFor`) : la plus grande de « part de la phase × volume voulu », « volume ÷ jours de course » et « ce que les autres sorties ne peuvent pas contenir » (temps dispo en semaine), plafonnée par le temps dispo le week-end et la durée max de l'objectif ;
- elle ne grimpe que de **10 %** par semaine par rapport à la plus longue sortie récente, **sans pas minimum** (décision : « +10 % » sur la plus longue séance de la semaine, pour tout le monde) ; arrondie au **0,1 km inférieur** et à la **minute inférieure** ;
- le volume de la semaine est ensuite plafonné par ce que les sorties peuvent contenir (`longue + (jours − 1) × min(longue, temps dispo en semaine)`, règle `week.sessioncap`, avec explication) ; la longue continue de croître même quand le volume est plafonné, donc le volume se débloque (F6) ;
- **la longue est la plus longue sortie de la semaine** (F7) : sorties faciles, strides, sprints et descentes sont plafonnés à sa durée (`easyRun`/`strides` prennent un `maxMin` ; sous 10 min de Z2, des strides deviennent une sortie facile, `STRIDES_MIN_BASE_MIN`) ;
- une **séance dure** (échauffement et retour au calme inclus) plus longue que la longue est remplacée par du facile (avec strides si la longue fait 30 min), règle `week.quality.light`. En **décharge et à l'affûtage**, l'intensité est gardée : la longue est allongée jusqu'à la séance dure, sans dépasser la plus longue sortie déjà faite (`longestRunKm` de la semaine) ;
- seules les semaines de course échappent à la règle (la course est la sortie la plus longue) ;
- le **test 3 km chrono** est réservé aux coureurs réguliers et avancés ;
- sans plus longue sortie déclarée, elle est estimée à `volume hebdo ÷ 3`, jamais « illimitée ».

## Périodisation (`generatePlan`)

- **Objectifs** : 5 km, 10 km, semi, marathon, trail court, trail moyen, ultra, « courir de zéro », « garder la forme ».
- **Phases** : base → spécifique 1 → spécifique 2 (pic) → pré-compétition → taper. Pour 25 semaines hors taper, la répartition est 9 / 7 / 6 / 3. Un bloc court comprime d'abord la base, et le taper n'est jamais coupé.
- **Décharge** : à 65 % du volume courant, après 3 semaines de développement (cycle 3:1).
- **Taper** : 2 semaines à 60 % puis 40 % du pic (1 semaine pour 5 km, 10 km et trail court ; 3 pour l'ultra). L'intensité est maintenue.
- **Course B** : la semaine de course est ramenée à 75 % (mini-taper) et la semaine suivante à 80 %, avec une seule séance clé.
- **Après une course A** : 1 à 3 semaines de récupération selon la distance, puis un nouveau cycle.
- **Démarrage** : sous 10 km/semaine, le plan commence par une phase de marche-course.
- **Plafonds** : le pic est limité par le temps disponible. Si le pic visé est inatteignable en respectant les 10 %, le moteur **plafonne et le dit**.

## Disponibilité réduite (1 ou 2 jours)

- **1 sortie par semaine** : objectif course (route, trail) refusé (`plan.oneday`, sévérité `stop`) avec deux propositions, « Garder la forme » ou « Courir de zéro » ; pour ceux-ci, le plan est fait avec un message honnête sur la lenteur (`plan.oneday.slow`, avec la durée estimée du parcours).
- **2 sorties par semaine** : la progression marche/course se fait séance par séance (elle règle le rythme) ; aucune séance clé tant que la sortie longue fait moins de `TWO_DAYS_KEY_MIN_CONTINUOUS` (30 min) de course continue (`week.twodays`).

## Objectif irréaliste et séance d'évaluation

- **Objectif irréaliste** (`plan.unrealistic`, attention) : avec un parcours de démarrage, si démarrage + 4 semaines de base + préparation minimale de l'objectif (`GOALS[goal].minWeeks`) ne tiennent pas avant la course, et que l'épreuve dépasse `RUNWALK_RACE_MAX_KM` (10 km : au-delà, la faire en marche/course n'est pas raisonnable). L'explication donne la durée minimale et 2 propositions (`options: ['objectif_intermediaire', 'decaler']`) : l'objectif le plus long qui tient à cette date (`PlanDraft.alternative`, 5 km sinon) ou une date plus lointaine. Jusqu'à 10 km, c'est `plan.runwalk.short` qui s'applique (course en marche/course).
- **Séance d'évaluation** (`start.evaluation`, régression F12) : « Je sais pas » chez un `debutant` ou un `regulier` → la 1re séance du plan est une évaluation (5 min de marche, puis course facile jusqu'à 10 min, arrêt dès que parler devient difficile ; `evaluationRun`, constantes `EVALUATION_*`). Les minutes tenues, saisies au log rapide, deviennent la capacité déclarée et le plan est régénéré dès le lendemain (`applyEvaluation`, couche data). En attendant, le départ est provisoire (palier 1) : l'objectif n'est pas jugé (ni `plan.unrealistic` ni `plan.runwalk.short`).
- Quand la santé ou le profil impose la marche/course à quelqu'un qui court déjà assez longtemps, l'explication de départ le dit (`start.runwalk.profile`) au lieu de « course continue ».

## Régression globale (`personas.test.ts`)

Un plan complet (plan + séances de chaque semaine) par persona de l'audit (jamais couru, ne marche pas 30 min ; 5 km en 10 et 20 semaines ; débutant 4 min, 10 km ; 2 j/sem ; 62 ans, IMC 32, bêtabloquant ; post-partum 4 mois ; régulier « Je sais pas », semi), et 5 invariants vérifiés : (1) rien de continu, long, clé, strides ou test avant le palier 13 ; (2) temps de course +25 % au plus d'une séance à l'autre en marche/course, +10 % ensuite sur la plus longue séance ; (3) la longue est la plus longue sortie ; (4) volume hebdo ≤ +10 % du max des 4 dernières semaines hors démarrage ; (5) toute restriction a son explication.

## Semaine type (`buildWeekSessions`)

- **Choix des jours** : le jour de la longue d'abord, puis les jours les plus espacés possible.
- **Séances clés** : au plus 2 (3 en phase pic pour un coureur avancé et ambitieux), espacées de 48 h, jamais la veille de la longue. En trail, la longue spécifique compte comme séance clé dès la phase spécifique.
- **Contenu** :
  - **Base pyramidale** : Z2, strides, sprints en côte, un seuil léger à partir de la semaine 3.
  - **Spécifique** : seuil, côtes longues, VO2max (au plus une fois par semaine, pas avant 4 semaines de base), descentes (trail, pas la veille d'une séance dure), back-to-back (trail moyen et ultra, en phase pic).
  - **Pré-compétition** : allure ou effort de course, plyométrie.
- **Muscu** : greffée aux jours durs (« jours durs durs, jours faciles faciles »), jamais la veille de la longue ni d'une course.
- **Volume restant** : il va aux sorties faciles, avec un plafond horaire par jour. Si le temps manque, le moteur laisse du volume de côté plutôt que d'allonger tout, et le dit.

## Dépistage santé (`screen`)

Questionnaire à l'inscription (étape de l'assistant et écran « Questionnaire santé » dans Plus), inspiré du PAR-Q+ et du dépistage ACSM, questions reformulées (`HEALTH_QUESTIONS`). `screen(health, today)` renvoie `{ level: 'ok' | 'prudent' | 'bloque', explanations }` ; il **restreint** le plan, jamais l'inverse :

- Q2 (douleur thoracique), Q3 (malaise, perte de connaissance), Q7 (activité supervisée seulement) → **`bloque`** (`health.clearance`, sévérité `stop`) tant que « Un médecin m'autorise » n'est pas coché ; l'autorisation ne compte que si elle est postérieure aux réponses (une réponse qui change la rend caduque). Débloqué → `prudent` (`health.cleared`).
- Q1 (cœur, hypertension) → `prudent` + conseil fort de consulter (`health.cardio`) ; Q4 (maladie chronique) → `prudent` (`health.chronic`, maladies nommées).
- Q5 avec médicament qui modifie la FC → zones au RPE (`health.hr_unreliable`) ; Q6 → retour de blessure (`health.injury`) ; Q8 → grossesse ou post-partum (`health.pregnancy`) ; Q9 = non → marche d'abord (`health.walk_first`). Ces profils sont appliqués par les règles de profil.
- Sans questionnaire : `ok` + invitation à le remplir (`health.missing`). Réponses de plus de 12 mois (`HEALTH_RENEW_DAYS`) : à refaire (`health.renew`).
- **Appliqué au plan** (`PlanRequest.screening`, calculé par la couche data à la création si l'appelant ne l'a pas fait) : `bloque` → `generatePlan` renvoie `ok: false` avec les explications (`health.clearance` en tête) ; `prudent` → difficulté forcée à `prudent` (`plan.prudent`), semaines `easyOnly` les `HEALTH_PRUDENT_EASY_WEEKS` (4) premières semaines, affûtage compris : ni séance clé, ni strides ni sprints, ni longue spécifique, ni test à fond ; et marche/course d'office pour `jamais` et `debutant` (au plus haut palier que permet leur capacité).
- Données : `Athlete.health` (réponses, date, autorisation, maladies, FC non fiable, grossesse) et `Athlete.heightCm` ; champs non indexés, donc pas de nouvelle version Dexie ; validés par le schéma zod du backup.

## Profils (`deriveProfile`)

`deriveProfile({ experience, birthYear, heightCm, weightKg, health, injuries, today })` dérive les ajustements qui **restreignent** le plan (seuils `PROFILE_*` dans `constants.ts`, tous À VALIDER). La couche data les calcule à la création du plan (`PlanRequest.profile`) ; `generatePlan` et `buildWeekSessions` (`WeekContext.profile`) les consomment.

| Profil | Détection | Effet |
| --- | --- | --- |
| Niveau 0 | Q9 = non | Marche d'abord (palier 0), profil lent (`profile.walk_first`) |
| Profil lent | ≥ 60 ans, IMC ≥ 30, Q1 ou Q4, retour de blessure, niveau 0 | 3 séances validées par palier (journal et projection), décharge toutes les 3 semaines (`profile.slow`) |
| 50 ans et plus | âge | Décharge 2:1, au plus 1 séance clé pour `jamais`/`debutant`, muscu 2×/sem conseillée (`profile.masters`) |
| 65 ans et plus | âge | Marche/course si capacité < 20 min, note « équilibre » sur la muscu, pas de VO2max pour qui débute (`profile.senior`) |
| IMC ≥ 30 | taille + poids | Profil lent, jamais deux jours de course de suite (jours non consécutifs, pas de back-to-back, volume calculé sur ces jours), note « surfaces souples » (`profile.bmi`) |
| FC non fiable | Q5 + médicament qui modifie la FC | Zones au RPE et au test de la parole (`zoneTarget`), pas de test FCmax, debrief sans FC (`debrief.hr_unreliable`) |
| Diabète | Q4 | Note « sucre rapide, glycémie » sur les séances de 45 min et plus |
| Asthme | Q4 | Note « inhalateur, 10 min d'échauffement » sur chaque sortie |
| Blessure active | `injuries` active | Pas de plan (`profile.injury.active`, sévérité `stop`) : croisé seulement |
| Blessure récente | dormante depuis < 12 sem. | Expérience rétrogradée d'un niveau, marche/course si capacité < 20 min (`profile.injury.recent`) |
| Mineur | < 18 ans | Marathon, trail moyen et ultra refusés (`profile.goal.forbidden`), difficulté au plus « équilibré » |

**Grossesse et post-partum** (Q8 + `health.pregnancy`) :

- **Grossesse** : seul « Garder la forme » est permis (`profile.goal.pregnancy` sinon) ; tout le plan `easyOnly` (RPE 5-6 au plus, aucune séance clé), le volume ne monte pas ; qui ne courait pas avant (`jamais`) : marche seulement ; note « signaux d'arrêt » sur chaque sortie ; validation par le suivi de grossesse (`profile.pregnancy`).
- **Post-partum** : pas de course avant `POSTPARTUM_NO_RUN_DAYS` (≈ 13 semaines) → marche seulement (`profile.postpartum.early`). Ensuite, **test de reprise** (liste à cocher, `POSTPARTUM_RETURN_TEST`) : pas fait ou incomplet → marche (`profile.postpartum.test`) ; un symptôme (`POSTPARTUM_SYMPTOMS`) → marche + physio périnéale (`profile.postpartum.physio`) ; réussi → marche/course au palier 1 quelle que soit l'expérience d'avant (`profile.postpartum.ready`).
- **Marche seulement** : l'échelle est plafonnée au palier 0 (`maxStage`, dans la projection et dans le journal : `runwalk.hold`) ; un objectif course est refusé (`profile.walk_only.goal`) ; « Courir de zéro » et « Garder la forme » deviennent des plans de marche rapide (20 → 30 min).

**« Garder la forme »** suit la même règle d'entrée que les autres objectifs (décision 4) : sous le seuil de capacité continue, le plan commence par le parcours de démarrage, puis passe en maintien.

Les notes de profil sont ajoutées aux séances (`SessionDraft.notes`) et affichées dans le détail de la séance (« Pour toi »).

## Muscu (`strength.ts`)

- **Programme** (`strengthProgram`) selon le type de séance, la phase et le niveau. Phases de **fondation** (démarrage, base, maintien, récup) : 8-12 reps, tempo 3-1-1, repos 60 s ; phases de **force** (spécifique 1 et 2) : 5-8 reps, repos 120 s, RPE 8 ; phases de **maintien** (pré-compétition, affûtage) : 2 séries, RPE 6. Un débutant (`jamais`, `debutant`) garde les fourchettes hautes et au plus `STRENGTH_NOVICE_MAX_SETS` (3) séries. Trail : descentes de banc excentriques (4-1-1) ; 65 ans et plus : équilibre sur une jambe ; grossesse : bird-dog à la place de la planche. Mollets 2×/sem dans tous les programmes.
- **Pliométrie** : seulement pour qui a de la base (ni `jamais`, ni `debutant`) et jamais pendant la grossesse (`strength.plyo.skip`).
- **Double progression** (`nextTarget`) : les reps montent jusqu'au haut de la fourchette, puis la charge (+`STRENGTH_LOAD_STEP_KG`, 2,5 kg) ; pas de montée si un RPE dépasse `STRENGTH_PROGRESS_MAX_RPE` (8) ; une série sous le bas de la fourchette → même charge ; au poids du corps, on propose une charge ou une variante. Chaque décision a son Explanation (`strength.*`).
- **Données** : `strengthSessions` (séries : exercice, reps, charge, RPE, tempo), lues par exercice pour calculer la prochaine cible. L'écran `/muscu` affiche le programme, la technique, le tempo guidé et le minuteur de repos ; il coche la séance prévue.

## Progrès (`progress.ts`)

Tendances calculées par règles ; chaque « découverte » est une Explanation (`progress.*`). Seuils `PROGRESS_*`, À VALIDER.

- **Efficacité aérobie** (`aerobicEfficiency`) : sorties **faciles** seulement (≥ 70 % du temps en Z1-Z2, ≤ 25 m D+/km, avec FC). Efficacité = vitesse ÷ FC, ramenée à une **allure à FC de référence** (milieu de Z2) ; semaine après semaine. Les 4 dernières semaines sont comparées aux 4 d'avant (3 sorties minimum de chaque côté) : « Ton Z2 est 18 s/km plus rapide » (`progress.efficiency.up`), ou plus lent (`.down`, ton prudent : fatigue, chaleur, sommeil). Écart < 5 s/km : du bruit, aucune découverte. Désactivée si la FC n'est pas fiable (médicament).
- **Distribution des zones** (`zoneDistribution`, 4 dernières semaines) vs 80/10/10, tolérance 10 points : trop de soutenu (`.hard`, la zone grise), que du facile (`.easy`, > 95 %), ou bonne répartition (`.ok`).
- **Cadence** hebdomadaire pondérée par la durée, avec la zone cible ; **VO2max** lissée sur 3 mesures ; **FC repos** : moyenne 7 jours contre la base des 28 jours d'avant (+5 bpm → `.restinghr.up`, attention ; −5 bpm → `.down`) ; **VFC** : jours déséquilibrés sur 7 jours.
- L'écran Progrès affiche les courbes (Sparkline) et la phrase du moteur ; il ne contient aucune règle.

## Équipement (`gear.ts`)

- **Km d'une paire** = km initiaux + km des sorties associées (`shoesWithKm`, couche data). La paire se choisit au log rapide et dans le debrief d'une activité importée ; ★ marque la paire conseillée pour la sortie.
- **État** (`shoeStatus`, seuils `SHOE_*` À VALIDER) : *rodage* (neuve : 50 km, `gear.breakin`), *ok*, *usure* (moins de 15 % de la durée de vie restante, `gear.wear`), *retraite* (700 km par défaut, `gear.retire`).
- **Paire conseillée** (`suggestShoe`) : active, adaptée au terrain (sentier pour le trail, route pour la route), jamais une paire à remplacer, ni en rodage pour une séance dure ; parmi les paires adaptées, la moins usée (la rotation se fait d'elle-même).
- **Rotation** (`gearAdvice`) : une seule paire active depuis 100 km ou plus → conseil d'en alterner deux (`gear.rotation`) ; aucune paire → invitation à en ajouter (`gear.none`).

## Nutrition d'effort (`nutrition.ts`)

Repères prudents (pratique courante, À VALIDER par un nutritionniste du sport) ; rien de nouveau le jour de la course (`fuel.golden`).

- **Cible de glucides** (`carbTarget`) : 0 sous 1 h, 60 g/h jusqu'à 2 h 30, 90 g/h au-delà.
- **Gut training** (`gutPlan`) depuis le journal de tolérance (`nutritionLogs`, sorties de plus de 75 min seulement) : départ à 30 g/h ; dernière sortie sans inconfort (0-1) → +10 g/h, jusqu'à l'objectif de course (`gut.up`, `gut.goal`) ; inconfort 2 → on garde (`gut.hold`) ; 3 et plus → −10 g/h, sans passer sous 30 (`gut.down`). Au-delà de 60 g/h, un mélange glucose et fructose (≈ 2:1) est conseillé.
- **Plan de course** (`racePlan`) : une prise toutes les 30 min vers la cible (jamais une demi-dose), liquides selon la température (400 / 550 / 750 mL/h), sodium (400, 700 mg/h au-dessus de 22 °C), caféine 3 mg/kg dans le dernier tiers d'une course de 3 h et plus (si déjà testée), avertissements (`fuel.dual`, `fuel.none`, `fuel.hot`).
- **Carbo-loading** (`carboLoading`) : au-delà de 90 min, 8 g/kg/jour pendant 2 jours ; sinon un bon repas la veille (6 g/kg).
- L'écran Nutrition affiche ce que décide le moteur ; la saisie se fait au log rapide (glucides, liquide, inconfort 0-5) pour les sorties de 75 min et plus. Le journal de tolérance est local : rien n'est envoyé.

## Prévention et carte du corps (`prevention.ts`)

- **Routines** (`ROUTINES`, À VALIDER par un physio) : de base, mollets et soléaire 2×/sem, fessiers et hanches 2×/sem, mobilité des chevilles 3×/sem. **Ciblées** : toute douleur déclarée dans les 28 derniers jours, ou blessure non résolue, ajoute la routine de sa zone (tibias, Achille, genou, bandelette, pied, dos…, `ROUTINE_FOR_ZONE`). `preventionPlan` compte les jours cochés de la semaine (lundi à dimanche, une coche par jour) et dit ce qui reste (`prevention.due`, `.targeted`, `.done`).
- **Carte du corps** (`bodyMap`) : niveau de chaque zone sur 28 jours selon la douleur la plus forte : gêne (< 3/10), douleur (3-5), forte (≥ 6). La carte est cliquable : toucher une zone la sélectionne pour la déclarer. La carte informe, les garde-fous santé décident (les règles de blocage restent dans `guards.ts`).
- Données : `preventionChecks` (routine, date), `painLogs` ; tout reste local.

## Jalons (`milestones.ts`)

De vrais premiers, sobres (un jalon, une phrase, la date), sans confettis. `newMilestones(activités, clés connues)` renvoie seulement les nouveaux (idempotent) ; la clé est unique par athlète, et le premier appel rattrape tout l'historique avec les vraies dates.

- **Premiers** : première sortie, **30 min d'affilée** (cap du parcours de démarrage), premier 5 km, 10 km, semi, marathon, 50 km (on compte à 98 % de la distance), 1000 m de D+ en une sortie.
- **Cumuls** : 100, 250, 500, 1000, 2000, 5000 km, à la sortie qui franchit le seuil.
- **Régularité** : 4, 8, 12, 26, 52 semaines de suite avec au moins 2 sorties de course (une semaine ratée remet à zéro).
- **Plus longue sortie** : le dernier record seulement (≥ 5 km, jamais pour la toute première sortie).
- Affichage : carte « Bravo » sur Aujourd'hui (jalons des 7 derniers jours) et liste datée dans Progrès. Enregistrés après un log, un import et à l'ouverture de Progrès (`syncMilestones`).

## Garde-fous santé (`evaluateHealth`)

| Signal | Effet |
|---|---|
| Douleur tibia ou soléaire ≥ 1 | Avertissement, aucune hausse de volume, aucune séance dure |
| Douleur tibiale ≥ 3, ou 2 jours de suite | **STOP course** : vélo ou natation à la place |
| Reprise après douleur | Z1/Z2 seulement jusqu'à 3 jours sans douleur |
| 5 jours de douleur ou plus sur 2 semaines | Suggestion de voir un physio |
| Douleur au tendon d'Achille > 48 h ou ≥ 3 | Red flag, STOP course |
| Body Battery < 20 plusieurs matins, VFC basse > 3 jours, FC repos ≥ base + 5, fatigue persistante | Red flags |
| Malade | Aucune qualité |
| 1 flag | Journée légère |
| 2 flags ou plus | Journée off |
| Flag + symptôme | Décharge anticipée |
| 4 nuits courtes sur 7 | Semaine maintien suggérée (65 % du volume, zéro qualité) |

## État du jour (`adjustToday`)

- **Santé** : une course bloquée est remplacée par de l'entraînement croisé (ou du repos s'il n'y en a pas). Un signal santé transforme une séance dure en Z2 court.
- **🔴** : repos.
- **Nuit courte** : la qualité est déplacée plus tard dans la semaine (`findMoveTarget` respecte les 48 h) et le moteur propose un Z2 de 30 min. Sous 4 h de sommeil, c'est repos.
- **🟡** : environ une répétition de moins, ou 20 % plus court.
- **🟢** : on fait la séance prévue.

## Debrief (`debrief`)

- **Facile trop dur** : plus de 15 % du temps au-dessus de Z2. Le moteur propose un plafond de FC.
- **Zone grise** : plus de 20 % du temps entre 76 et 82 % de la FCmax (environ 145-155 bpm pour 190).
- **Dérive cardiaque** : découplage FC/allure entre les deux moitiés, échauffement exclu. Sous 5 %, c'est bon. Elle n'est calculée que sur terrain roulant et au-delà de 40 min.
- **Dérive Z2 → Z3 en fin de longue** : le dernier quart est comparé à la première moitié.
- **Cadence** : comparée à la cible, avec un conseil de progression graduelle (+2-3 pas/min).
- **Durée** : plus court que prévu, aucun reproche. Plus long, le moteur conseille une séance facile ensuite.
- **Sans FC** : le moteur le dit et n'invente rien.
