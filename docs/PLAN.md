# Sentier — Phase 0 : plan

> Statut : **validé (révision 2, 21 oct. 2026).** La section « Révision 2 » ci-dessous a priorité sur le reste du document.

## Révision 2 — décisions après les réponses

### Ce qui change
Sentier devient un **générateur de plans générique, route ET trail**, qu'on peut lancer vers un objectif à tout moment, dans l'esprit de Campus Coach et Runna. Nicolas n'est plus codé en dur : son profil devient un **profil de démo** parmi d'autres. L'app est pensée pour une publication publique éventuelle.

### Ce qu'on reprend de Campus / Runna (d'après leurs descriptions publiques)
| Inspiration | Ce qu'ils font | Dans Sentier |
|---|---|---|
| Runna — onboarding | Questionnaire : niveau, expérience, jours de course, distance et date, volume/difficulté réglables, terrain local | Assistant « Nouvel objectif » en 8 étapes (ci-dessous), avec aperçu du plan avant de confirmer |
| Runna — une estimation de forme | Un seul temps estimé fixe les allures de toutes les séances ; le modifier recalcule tout | Un **niveau de forme** (VDOT, via les équations publiques de Daniels-Gilbert) calculé depuis un temps de course récent, une VMA ou un test. Il fixe les allures E/M/T/I/R en route. |
| Runna — adaptation | Les allures changent si on rate ou dépasse la cible **de façon répétée** (pas sur une seule séance) ; les répétitions aberrantes sont ignorées | Règle « 3 séances qualité concordantes » avant d'ajuster le VDOT, en excluant les répétitions aberrantes |
| Runna — « Not Feeling 100% » | Adapter la séance si malade, douleur ou pressé, puis revenir au plan proprement | Sélecteur d'état du jour 🟢🟡🔴, nuit courte, douleur, « pas le temps » → version minimale viable |
| Runna — calendrier de courses | Plusieurs courses dans le calendrier | Courses A/B/C ; les B/C deviennent des mini-tapers ou des séances dans le bloc |
| Runna — changer la date | Changer la date de course ou rater une séance ajuste le plan | Régénération des semaines futures seulement ; le passé est figé |
| Campus — plans par objectif | 10 km, semi, marathon, trail, ultra ; de 6 semaines à 12 mois | Catalogue : 5 km, 10 km, semi, marathon, trail court (<30 km), trail moyen (30-60 km), ultra (60 km+), « courir de zéro », « garder la forme » (sans course) |
| Campus — trail | Prise en compte du dénivelé ; effort cible (pas une allure) en trail | En trail : prescription en **FC/RPE** avec une allure indicative ; D+ cible par semaine ; côtes, descentes, back-to-back |
| Campus — difficulté réglable | Le coureur ajuste le niveau de difficulté | Niveau « prudent / équilibré / ambitieux », qui module le volume de pointe et la densité de qualité, **jamais** la règle des 10 % |
| Campus — paliers nutrition | Paliers progressifs pour entraîner le ventre | Planificateur de gut training (déjà prévu au §5.7 du brief) |
| Les deux — renfo, échauffements | Séances de renforcement intégrées au plan | Muscu par phase (déjà prévu) |

### Assistant « Nouvel objectif »
1. **Objectif** : route (5 km / 10 km / semi / marathon), trail (distance + D+), « courir de zéro » (0 → 30 min continues), « garder la forme » (sans course).
2. **Course** : nom, date (ou pas de date → durée choisie de 6 à 24 semaines), distance, D+, priorité.
3. **Expérience** : jamais couru / débutant / régulier / avancé.
4. **Point de départ** : volume actuel (0 accepté) et plus longue sortie récente. Ces valeurs sont **pré-remplies depuis l'historique importé** s'il existe.
5. **Forme** : temps récent sur une distance, ou VMA, ou « je sais pas » → test de calibration planifié en semaine 1.
6. **Disponibilités** : jours de course par semaine (2-7), jours possibles, jour de la sortie longue, temps max en semaine et la fin de semaine.
7. **Options** : renfo (0-2 par semaine), dénivelé accessible près de chez soi, bâtons, difficulté.
8. **Santé** : blessures passées (zone), douleur actuelle. Une douleur actuelle active les garde-fous dès le départ.

Ensuite : **aperçu** (frise des phases, volume par semaine, pic, séances clés, avertissements du moteur s'il ne peut pas tout respecter) → confirmer.

### Départ de zéro ou avec historique
- **De zéro** : aucun historique requis. Le plan démarre au volume déclaré, l'ACWR reste en « calibration » 4 semaines, et les zones sont estimées puis recalibrées par un test.
- **Avec historique** : import de fichiers FIT/GPX/TCX/CSV. Le moteur en tire le volume réel, la plus longue sortie et une estimation de forme (meilleurs efforts), qui pré-remplissent l'assistant.

### Question 3 tranchée
L'ACWR utilise **la charge calculée par Sentier** (durée × intensité par zone + bonus D+) pour toutes les activités. Le Training Load Garmin est affiché à côté quand il existe, sans entrer dans le calcul. Le réglage reste modifiable.

### Hébergement et futur public
- **v1 : Cloudflare Pages** (site statique, HTTPS, gratuit, CDN). Les données restent 100 % sur l'appareil.
- **Plus tard : Supabase** (comptes + synchronisation multi-appareils, **opt-in**, Postgres avec RLS), avec consentement explicite pour les données de santé. Le code passe dès maintenant par une couche « repos » pour qu'on puisse brancher la synchro sans réécrire l'UI.
- **Prêt pour le public** : textes centralisés (fr-CA par défaut, prêt pour l'anglais), avertissement « ceci n'est pas un avis médical », aucune donnée personnelle codée en dur.

## 0. Constat de départ

- Dépôt vide. Date du jour : **mercredi 21 octobre 2026**.
- **Le Trail du Grand-Duc est dans 3-4 jours** (24-25 oct.). Lac Beauport 30 km (6 juin) est passé.
- Conséquence : quand l'app sera utilisable (fin des phases 1-3), Nicolas sera en **récup post-course A**. Le premier vrai parcours utilisateur est « course passée → récup → nouveau bloc », pas « 27 semaines vers Grand-Duc ». Le moteur et le seed sont conçus pour ça d'abord ; le bloc Grand-Duc sert de données de démo réalistes (historique), pas de plan actif.

## 1. Stack finale : Vite + React + TypeScript (pas Next.js)

| Besoin | Choix | Pourquoi |
|---|---|---|
| Build / dev | **Vite 6 + React 19 + TS strict** | Sentier est 100 % client : pas de serveur, pas de SEO, pas de SSR. Avec Next.js App Router on paierait le RSC/l'hydratation et les contournements « client-only » pour Dexie et le service worker, sans rien gagner. Vite donne un bundle statique, un démarrage instantané et une intégration PWA mature. |
| Routing | **React Router 7** (mode bibliothèque) | Standard, découpage du code par route (`lazy`) pour la perf. |
| PWA / offline | **vite-plugin-pwa** (Workbox) | Précache de toute l'app, manifeste, invite de mise à jour. Polices auto-hébergées (`@fontsource`) pour que tout marche hors-ligne. |
| Styles | **Tailwind v4 + shadcn/ui** (Radix) | Les composants Radix gèrent le focus, le clavier et l'ARIA ; on ne copie que ceux qu'on utilise. |
| Données | **Dexie 4 + dexie-react-hooks** (`useLiveQuery`) | IndexedDB typé, migrations versionnées, l'UI se met à jour quand les données changent. |
| Validation | **Zod** | Valide l'import JSON (backup) et les fichiers parsés avant d'écrire en base. Un backup corrompu ne doit jamais casser la base. |
| Animations | **motion** (ex-Framer Motion) | Demandé ; respecte `prefers-reduced-motion` via `MotionConfig reducedMotion="user"`. |
| Graphiques | **Recharts** pour les séries (progrès) ; **SVG maison** pour profils de dénivelé, anneaux, jauge ACWR | Recharts suffit pour les courbes classiques. Les visuels « signature » sont plus beaux et plus légers en SVG écrit à la main. Recharts est chargé seulement sur l'écran Progrès. |
| Glisser-déposer | **dnd-kit** | Accessible au clavier et tactile, contrairement au DnD HTML5 natif. Un menu « Déplacer vers… » sert d'alternative. |
| FIT | **@garmin/fitsdk** (SDK JS officiel de Garmin) ; `fit-file-parser` en repli si problème | Officiel, maintenu, décode les messages propres au Fenix 7. Je vérifierai sur un vrai fichier Fenix 7 avant de m'engager. |
| GPX / TCX | `DOMParser` natif | Aucune lib nécessaire. |
| CSV Garmin Connect | **papaparse** | Champs entre guillemets, virgules décimales, BOM : pas la peine de réécrire un parseur CSV. |
| Dates | **date-fns** | Fonctions pures, tree-shakable. La semaine commence le lundi et le fuseau est celui de l'appareil. |
| Tests | **Vitest** (+ couverture v8, seuil 100 % sur `/engine`), **Playwright** (Chromium préinstallé) | Comme demandé. |
| Gestionnaire de paquets | pnpm | Rapide, lockfile strict. |

Aucune autre dépendance non triviale sans justification dans le commit qui l'ajoute.

## 2. Arborescence

```
sentier/
├─ src/
│  ├─ engine/                 # LOGIQUE PURE — zéro import React/Dexie/DOM, 100 % testé
│  │  ├─ constants.ts         # tous les seuils nommés, commentés, marqués CONFIGURABLE / À VALIDER
│  │  ├─ types.ts             # types du domaine (partagés avec /data)
│  │  ├─ explain.ts           # type Explanation { rule, why, severity, data } — base du « Pourquoi? »
│  │  ├─ zones.ts             # zones FC (%FCmax, Karvonen, calibration 3 km / paliers), temps par zone
│  │  ├─ load.ts              # charge par activité (maison + Garmin), aiguë/chronique, ACWR (rolling + EWMA)
│  │  ├─ progression.ts       # règle ≤10 %, « volume OU intensité », référence = max des 4 dernières sem. hors décharge
│  │  ├─ periodization/       # génération de bloc, phases, semaines, taper, course B, récup post-course, nouveau cycle
│  │  ├─ library/             # fiches par type de séance (prescription, adaptations, pourquoi, signe, erreur, MVV)
│  │  ├─ scheduling.ts        # placement hebdo + validation des déplacements (48 h entre qualités, veille de séance clé…)
│  │  ├─ guards/              # périostite, red flags, protocole 1 flag / 2+ flags / flag+symptôme, semaine maintien
│  │  ├─ readiness.ts         # état du jour (🟢🟡🔴 + nuit courte) → garder / alléger / remplacer
│  │  ├─ debrief.ts           # analyse post-séance par règles (cible, dérive cardiaque, zone grise, cadence)
│  │  ├─ strength.ts          # programmes par phase, double progression
│  │  ├─ nutrition.ts         # cibles g/h, glucose:fructose, sodium, carbo-loading, plan de course
│  │  ├─ gear.ts              # km souliers, rodage, usure, rotation
│  │  ├─ milestones.ts        # jalons réels, série de semaines cohérentes
│  │  └─ index.ts             # API publique du moteur
│  ├─ data/
│  │  ├─ db.ts                # schéma Dexie + migrations
│  │  ├─ repos/               # accès typé par entité
│  │  ├─ import/              # fit.ts, gpx.ts, tcx.ts, csv.ts → ParsedActivity normalisée ; dédoublonnage
│  │  ├─ backup.ts            # export/import JSON complet (versionné, validé par Zod)
│  │  └─ seed/                # données de démo réalistes + effacement
│  ├─ ui/
│  │  ├─ design/              # tokens, thème, polices, primitives shadcn
│  │  ├─ components/          # ElevationProfile, Rings, AcwrGauge, WhyDisclosure, StateSelector…
│  │  └─ screens/             # today, plan, session, debrief, progress, body, strength, nutrition, gear, profile
│  ├─ app/                    # routes, providers, service worker, shell
│  └─ main.tsx
├─ tests/e2e/                 # Playwright
├─ docs/                      # PLAN.md, ENGINE.md (comment le moteur décide)
└─ README.md
```

Règle d'architecture vérifiée par un test (lint `no-restricted-imports`) : `/engine` n'importe ni `react`, ni `dexie`, ni `/data`, ni `/ui`. L'UI appelle le moteur, et le moteur ne fait que retourner des données et des `Explanation`.

## 3. Schéma de données (Dexie)

Toutes les entités ont `id` (UUID), `athleteId`, `createdAt`, `updatedAt`. Une seule athlète actif en v1, mais le schéma est prêt pour plusieurs. Les dates sont des chaînes ISO `YYYY-MM-DD` (jour local) pour tout ce qui est « calendrier », et ISO datetime pour les horodatages.

| Table | Champs clés | Index |
|---|---|---|
| `athletes` | nom, sexe, naissance, poids (kg), fcMax, fcRepos, fcMaxSource (`estimée`/`test`), zones (`auto`/`override` + bornes), vo2maxHistory[], cadenceCible [172,176], injuryHistory[], baselinePainFreeKm, dispo (jours, minutes/jour, jours longs), substitutions dispo (vélo/natation/elliptique), settings (unités, thème, méthode de charge) | `id` |
| `races` | nom, date, distanceKm, dPlus, terrain, priorité A/B/C, objectif (`effort_test`/`chrono`/`finir`), notes, profil (points ou GPX), résultat | `date`, `priority` |
| `blocks` | raceId (nullable : bloc sans course), début, fin, volumeDépart, statut (`actif`/`archivé`), paramètres de génération | `status`, `raceId` |
| `weeks` | blockId, index, début (lundi), phase (`base`/`spec1`/`spec2`/`precomp`/`taper`/`recup`/`maintien`), type (`build`/`decharge`/`taper`/`maintien`/`recup`), volumeCible, dPlusCible, clésCibles, override manuel | `[blockId+index]`, `start` |
| `sessions` (planifiées) | weekId, date, type (clé de bibliothèque), duréeMin, distanceCible?, dPlusCible?, zonesCibles, structure (blocs échauffement/intervalles/RàC), rpeCible, mvv (version minimale viable), clé (bool), statut (`prévue`/`faite`/`allégée`/`remplacée`/`sautée`), activityId?, ajustements[] (avec Explanation) | `date`, `weekId`, `status` |
| `activities` (réalisées) | source (`fit`/`gpx`/`tcx`/`csv`/`manuel`), empreinte (dédoublonnage), début, durée, distance, d+/d-, fcMoy/Max, allure, cadence, tempsParZone (recalculé avec MES zones), garminTrainingLoad?, chargeMaison, terrain, météo?, shoeId?, séries temporelles (FC/allure/altitude/cadence, sous-échantillonnées à 5 s) | `start`, `fingerprint`, `shoeId` |
| `subjectives` | activityId? / date, rpe, sensations, sommeil h + qualité 1-5, nutrition pendant, douleurs[] (zone + 0-10), contexte (nuit courte, stress, malade) | `date`, `activityId` |
| `wellness` | date, bodyBattery matin, hrvStatus (`balanced`/`unbalanced`/`low`/`poor`), fcRepos, sommeil h, état du jour (🟢🟡🔴), nuitCourte | `date` (unique) |
| `painLogs` | date, zone (`tibia_g`, `tibia_d`, `soleaire_g/d`, `achille_g/d`, `itb_g/d`, `genou_g/d`, `autre`), intensité 0-10, moment (pendant/après/matin), note | `date`, `zone` |
| `strengthSessions` | date, programme/phase, exercices[] → setLogs[] (charge, reps, rpe, tempo) | `date` |
| `exercises` | bibliothèque : nom, catégorie, cues, tempo par défaut, unilatéral | `id` |
| `shoes` | nom, modèle, kmInitial, objectifRodage (200), kmRetraite (ex. 700, configurable), actif, terrain | `active` |
| `nutritionLogs` | activityId, produits[] (g glucides, sodium, caféine), g/h, ml/h, tolérance GI 0-5, température | `activityId` |
| `preventionChecks` | date, routine (mollets bent/straight, soléaire…) | `date` |
| `milestones` | clé, date obtenue, donnée | `key` |
| `meta` | schemaVersion, seedPresent, dernier backup | — |

Le format de backup est `{ app: "sentier", schemaVersion, exportedAt, tables: {...} }`. L'import valide avec Zod, puis passe par les migrations, puis remplace tout dans une transaction unique (aucun état à moitié importé).

## 4. Le moteur : décisions de conception importantes

1. **Tout est une `Explanation`.** Chaque sortie (ajustement, alerte, validation de déplacement, debrief) porte `{ ruleId, titre, pourquoi, sévérité, valeurs }`. L'UI se contente d'afficher, ce qui garantit que chaque recommandation a son « Pourquoi? ».
2. **Priorité des règles (ordre strict) :** blessure active → red flags → état du jour → progression/ACWR → préférences. La sécurité gagne toujours, et le texte le dit explicitement.
3. **Règle des 10 %** : la référence est le **max des 4 dernières semaines hors décharge**, pas la semaine précédente. Sinon, remonter après une décharge serait faussement signalé (+40 %). « Volume OU intensité » : l'intensité se mesure en minutes Z4+ et en nombre de séances clés. Une semaine qui augmente les deux est refusée.
4. **Charge** : une seule métrique cohérente dans une fenêtre ACWR. Mélanger le Training Load Garmin (basé sur l'EPOC) et une charge maison (TRIMP par zones : minutes × poids de zone + facteur D+) fausse le ratio. Voir la question 3.
5. **ACWR** : fenêtres 7/28 j, zone verte 0,8-1,3, calcul glissant + option EWMA. Sa valeur prédictive pour les blessures est **débattue** dans la littérature, donc l'app le présente comme un indicateur de tendance et jamais comme une prédiction. Il ne s'affiche qu'avec ≥ 28 jours de données ; avant, l'app affiche « calibration en cours » (honnêteté, §6.7).
6. **Périodisation** : on génère à partir de (date de course, volume de départ, dispo, historique). Les phases sont proportionnelles au bloc de 27 semaines ; un bloc court comprime d'abord la base, ne coupe jamais le taper et ne saute jamais la règle des 10 %. Si l'objectif de volume n'est pas atteignable sans dépasser 10 %, le moteur **plafonne et le dit** (« pic visé 65 km, atteignable 52 km d'ici la course »).
7. **Constantes non certaines** : chaque chiffre dont je ne suis pas sûr est une constante nommée marquée `// À VALIDER` et éditable dans Réglages avancés. Par exemple : poids des zones pour la charge, équivalence D+ → km, km de retraite des souliers, durée de la récup post-course, seuils Body Battery/HRV. Aucune référence scientifique inventée dans le code ou l'UI.
8. **Garde-fou périostite** : une douleur tibiale ≥ 1 déclenche un avertissement et interdit toute hausse cette semaine. Une douleur persistante (≥ 2 jours consécutifs ou ≥ 3/10) déclenche **STOP course** : séances de course remplacées par vélo/natation, génération de séances dures bloquée, suggestion de physio à partir de 5 jours. Le blocage se lève après N jours sans douleur, puis une reprise progressive (constantes configurables).

## 5. Ordre de livraison (commits atomiques, tests à chaque fin de phase)

**Phase 1 — Fondations**
1. Échafaudage Vite/TS strict/ESLint/Prettier/Vitest/Playwright, CI GitHub Actions (lint + typecheck + tests).
2. Design system : tokens (palette ci-dessous), thèmes sombre (défaut) et clair, typographie, primitives shadcn, page « kitchen sink ».
3. Schéma Dexie + repos + migrations.
4. Export/import JSON + tests.
5. PWA (manifeste, icônes, précache, `navigator.storage.persist()`, invite de mise à jour).
6. Seed de démo + bouton « Effacer la démo ».

**Phase 2 — Moteur (TDD)** : zones → charge/ACWR → progression → bibliothèque de séances → périodisation (cas limites : course passée, bloc de 3 semaines, aucune course A, blessure active, nouveau cycle) → planification/validation → garde-fous et red flags → état du jour → debrief → muscu/nutrition/équipement/jalons. Puis `docs/ENGINE.md`.

**Phase 3 — Écrans cœur** : shell + navigation, Aujourd'hui, Plan (semaine/mois/bloc + DnD validé), détail de séance, import Garmin (FIT/GPX/TCX/CSV, doublons, association), debrief.

**Phase 4** : Progrès, Corps, Muscu, Nutrition, Équipement, Profil/calibration.

**Phase 5 — Polish** : animations, états vides et erreurs, audit a11y (axe), Lighthouse > 90, 3 parcours Playwright (créer un bloc · importer un FIT → debrief · douleur tibiale → plan bloqué), README.

## 6. Identité visuelle (proposition)

Palette « Jacques-Cartier, fin octobre » :
- **Sapin** `#16302A` (fond sombre) / `#1F4537`
- **Brume** `#D9DED8` (texte sur fond sombre, fond en clair)
- **Feuille mouillée** `#C8642B` (accent, actions, séance du jour)
- **Mélèze** `#D9A441` (alerte douce, zone jaune)
- **Pierre** `#7A7A70` (texte secondaire)
- **Lichen** `#8FA98A` (OK, zone verte)
- **Petits fruits** `#9E3B3B` (rouge, red flags)

Toutes les paires texte/fond seront vérifiées AA par un test automatisé. Les zones FC ont leur propre gradient (brume → lichen → mélèze → feuille → petits fruits).

Typographie : **Fraunces** (display, titres, avec du caractère) + **Inter** avec `font-variant-numeric: tabular-nums` pour les chiffres. Les deux sont auto-hébergées pour fonctionner hors-ligne.

## 7. Risques identifiés

| Risque | Mitigation |
|---|---|
| Les fichiers FIT d'**activité** ne contiennent ni Body Battery ni statut HRV, et le Training Load n'y est pas toujours. | Saisie bien-être matinale en 3 taps ; import de l'export complet Garmin (GDPR) envisagé en v1.1. Voir la question 2. |
| ACWR inutilisable les 28 premiers jours. | Import de l'historique au démarrage (question 4) + état « calibration » honnête. |
| Règle des 10 % très contraignante à bas volume (20 → 22 km). | La référence est le max sur 4 semaines (§4.3). Je ne mets **pas** de plancher absolu sans ton accord. |
| IndexedDB peut être purgé par iOS Safari (PWA inactive environ 7 jours sans `persist`). | `navigator.storage.persist()`, rappel de backup si le dernier export date de plus de 14 jours, export en un tap. |
| Retour haptique : `navigator.vibrate` n'existe pas sur iOS Safari. | Utilisé sur Android quand disponible ; dégradation silencieuse ailleurs. |
| Portée très large (10 écrans + moteur). | Livraison par phases, chaque phase utilisable ; je coupe le décoratif avant le moteur ou la sécurité. |
| Lighthouse > 90 avec motion + Recharts. | Découpage par route, Recharts chargé seulement sur Progrès, polices en sous-ensemble. |
| Fuseau horaire / heure d'été qui décalent une séance d'un jour. | Dates calendrier en `YYYY-MM-DD` local, tests sur les changements d'heure. |

## 8. Questions bloquantes (5 max)

Chacune a un **défaut proposé** : si tu réponds « go avec les défauts », j'avance avec ceux-là.

1. **Après Grand-Duc, c'est quoi la prochaine course A ?** (nom/date/distance/D+ si connus). *Défaut : aucune course A. L'app démarre en « récup post-course » (environ 2 semaines, reprise inversée) puis en bloc « base ouverte » sans date, et passe en périodisation complète dès qu'une course A est ajoutée.*
2. **Bien-être quotidien (Body Battery, HRV, FC repos)** : ça ne vient pas des fichiers FIT d'activité. OK pour une saisie manuelle le matin (3 champs, moins de 10 s, valeurs pré-remplies avec la veille) en v1 ? *Défaut : oui, et l'import de l'export complet Garmin vient plus tard.*
3. **Métrique de charge** : je propose d'utiliser **toujours la charge maison** (transparente, calculable sur 100 % des activités, y compris GPX et manuelles) pour l'ACWR, et d'afficher le Training Load Garmin à côté quand il est présent, plutôt que de les mélanger. *Défaut : charge maison pour l'ACWR, Garmin affiché à titre informatif.* (Ça diffère légèrement de §6.2 du prompt, d'où la question.)
4. **Historique pour amorcer** : peux-tu exporter tes 6-8 dernières semaines d'activités (FIT « original » depuis Garmin Connect, ou le CSV de la liste d'activités) ? Ça rend l'ACWR et les zones fiables dès le jour 1, au lieu des données de démo. *Défaut : seed de démo réaliste, tes vraies données remplacent la démo quand tu importes.*
5. **Hébergement de la PWA** (HTTPS requis pour l'installer sur ton téléphone) : GitHub Pages via Actions sur ce dépôt, ou autre chose (Netlify/Vercel/Cloudflare Pages) ? *Défaut : GitHub Pages, déployé à chaque push sur `main`.* Le site ne fait que servir les fichiers ; tes données restent sur l'appareil.

Infos non bloquantes que je mettrai dans le Profil avec des valeurs à corriger : poids (pour les g/kg du carbo-loading), substitutions disponibles (vélo/home trainer, piscine, elliptique), taux de sudation.
