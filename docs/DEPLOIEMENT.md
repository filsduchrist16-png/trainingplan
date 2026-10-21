# Déploiement sur Cloudflare (Workers Builds)

Le dépôt est connecté au Worker **`trainingplan`** (Cloudflare → Workers & Pages → `trainingplan` → Settings → Builds). Chaque `push` déclenche un build Cloudflare :

- branche de production → **déploiement** sur `https://trainingplan.<ton-sous-domaine>.workers.dev`
- autres branches → **version de preview** (URL affichée dans le check « Workers Builds » de la PR)

La config est dans `wrangler.jsonc` : site 100 % statique servi depuis `dist/`, routage SPA par `not_found_handling`, en-têtes (CSP stricte) par `public/_headers`. Aucun code serveur.

## « Et la base de données ? »

La base principale est **IndexedDB dans le navigateur** (Dexie, `src/data/db.ts`). Elle se crée toute seule sur chaque appareil.

Les comptes, la synchro, le coach et la communauté passent par **Supabase** (optionnel). Mise en place : [`docs/SUPABASE.md`](SUPABASE.md). Il faut ajouter deux variables de build dans Cloudflare : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. Sans elles, l'app reste 100 % locale.

## Réglages du build dans Cloudflare

Workers & Pages → `trainingplan` → **Settings → Builds** :

| Réglage | Valeur |
| --- | --- |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory | `/` |
| Production branch | la branche qui doit aller en ligne (`main` une fois créée) |

Le nom `name` de `wrangler.jsonc` doit rester **identique** au nom du Worker (`trainingplan`), sinon le build échoue.

Variable d'environnement de build conseillée (Settings → Variables and secrets, côté *Build*) : `NODE_VERSION = 22`.

## Vérifier un déploiement en local

```bash
pnpm build
npx wrangler@4 deploy --dry-run   # valide la config sans rien publier
npx wrangler@4 dev                # sert dist/ comme en production (http://localhost:8787)
```

## Domaine personnalisé (optionnel)

`trainingplan` → **Settings → Domains & Routes → Add → Custom domain**. HTTPS est automatique (nécessaire pour installer la PWA sur téléphone).

## Note

La CI GitHub (lint, types, tests, e2e) tourne en parallèle du build Cloudflare et ne le bloque pas. Pour ne jamais publier une version rouge, protège la branche de production sur GitHub (règle « Require status checks: check ») et ne merge que des PR vertes.
