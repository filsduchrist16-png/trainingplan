# Sentier

Générateur de plans d'entraînement **route et trail** (5 km → ultra, ou « courir de zéro »), dans l'esprit de Campus Coach et Runna, avec un moteur de coaching transparent : chaque recommandation a son « Pourquoi? ».

- **Local-first** : les données restent dans le navigateur (IndexedDB). Aucun compte, aucun serveur, aucune donnée de santé envoyée nulle part.
- **PWA** installable sur téléphone, fonctionne hors-ligne.
- **Backup** JSON complet (export/import) dans Réglages.

> Statut : Phase 1 (fondations) terminée. Voir [`docs/PLAN.md`](docs/PLAN.md) pour la feuille de route.

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

## Déploiement (Cloudflare Pages)

- Déploiement automatique par GitHub Actions après une CI verte : `main` → production, autres branches → preview. Mise en place (jeton + 2 secrets GitHub) : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
- Commande de build : `pnpm build`, dossier de sortie : `dist` (voir `wrangler.toml`).
- `public/_redirects` gère le routage SPA ; `public/_headers` pose une CSP stricte (`connect-src 'self'`) qui empêche techniquement l'app d'envoyer des données ailleurs.

## Avertissement

Sentier n'est pas un avis médical. Une douleur qui persiste, ça se fait voir par un pro.
