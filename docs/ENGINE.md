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

## Semaine type (`buildWeekSessions`)

- **Choix des jours** : le jour de la longue d'abord, puis les jours les plus espacés possible.
- **Séances clés** : au plus 2 (3 en phase pic pour un coureur avancé et ambitieux), espacées de 48 h, jamais la veille de la longue. En trail, la longue spécifique compte comme séance clé dès la phase spécifique.
- **Contenu** :
  - **Base pyramidale** : Z2, strides, sprints en côte, un seuil léger à partir de la semaine 3.
  - **Spécifique** : seuil, côtes longues, VO2max (au plus une fois par semaine, pas avant 4 semaines de base), descentes (trail, pas la veille d'une séance dure), back-to-back (trail moyen et ultra, en phase pic).
  - **Pré-compétition** : allure ou effort de course, plyométrie.
- **Muscu** : greffée aux jours durs (« jours durs durs, jours faciles faciles »), jamais la veille de la longue ni d'une course.
- **Volume restant** : il va aux sorties faciles, avec un plafond horaire par jour. Si le temps manque, le moteur laisse du volume de côté plutôt que d'allonger tout, et le dit.

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
