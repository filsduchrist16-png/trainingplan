# Sentier

Générateur de plans d'entraînement **route et trail** (5 km → ultra, ou « courir de zéro »), dans l'esprit de Campus Coach et Runna, avec un moteur de coaching transparent : chaque recommandation a son « Pourquoi? ».

- **Local-first** : les données restent dans le navigateur (IndexedDB). Aucun compte, aucun serveur, aucune donnée de santé envoyée nulle part.
- **PWA** installable sur téléphone, fonctionne hors-ligne.
- **Backup** JSON complet (export/import) dans Réglages.

> Statut : **MVP**. Ce qui est livré et ce qui est reporté : section « MVP » de [`docs/PLAN.md`](docs/PLAN.md). Comment le moteur décide : [`docs/ENGINE.md`](docs/ENGINE.md).

## Ce que fait le MVP

- **Nouvel objectif** à tout moment (5 km → ultra, courir de zéro, garder la forme) : assistant en 9 étapes, aperçu du plan, puis génération par le moteur (phases, décharges, taper, règle des 10 %).
- **Aujourd'hui** : séance du jour ajustée en direct selon la santé et ton état (🟢🟡🔴, nuit courte), version minimale viable, log en moins de 30 s, jauge de charge (ACWR), compte à rebours de course, récup puis nouveau cycle après une course A.
- **Plan** : semaine (glisser-déposer validé par le moteur), mois, bloc ; fiche complète de chaque séance avec son « Pourquoi? ».
- **Import Garmin** FIT/GPX/TCX/CSV, 100 % dans le navigateur, avec debrief par règles (zones, zone grise, dérive cardiaque, cadence).
- **Corps** : déclaration de douleur, garde-fous (STOP course sur douleur tibiale persistante, croisé à la place).
- **Progrès** : volume et D+ des 12 dernières semaines.
- Données de démo réalistes, export/import JSON, PWA hors-ligne, thèmes sombre et clair.

## Démarrer

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # tests unitaires (Vitest)
pnpm e2e          # parcours Playwright (build + preview)
pnpm build        # build de production dans dist/
```

Node 22+ et pnpm 10 requis. Si Playwright ne trouve pas Chromium, définir `PW_CHROMIUM_PATH` vers un exécutable Chromium.

## Architecture

```
src/
  engine/   logique de coaching PURE (aucun import React/Dexie/DOM — vérifié par ESLint), couverture visée 100 %
  data/     Dexie (IndexedDB), backup JSON validé par zod, import Garmin, seed de démo
  ui/       design system, composants, écrans
  app/      routes, coquille, service worker
```

Règle d'or : **aucune règle de coaching dans l'UI**. L'UI affiche ce que le moteur décide, avec son explication.

## Déploiement (Cloudflare Workers)

- Déployé par **Workers Builds** à chaque push (Worker `trainingplan`, config `wrangler.jsonc`). Réglages et vérifications : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
- Commande de build : `pnpm build`, dossier servi : `dist`.
- Le routage SPA est géré par `not_found_handling` dans `wrangler.jsonc` ; `public/_headers` pose une CSP stricte (`connect-src 'self'`) qui empêche techniquement l'app d'envoyer des données ailleurs.

## Avertissement

Sentier n'est pas un avis médical. Une douleur qui persiste, ça se fait voir par un pro.
