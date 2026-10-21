# Déploiement sur Cloudflare Pages

Chaque `push` lance la CI (lint, types, tests, build, e2e). Si tout est vert, le job `deploy` publie `dist/` sur Cloudflare Pages :

- branche `main` → **production** : `https://sentier.pages.dev`
- toute autre branche → **preview** : `https://<branche>.sentier.pages.dev`

Le projet Pages `sentier` est créé automatiquement au premier déploiement.

## « Et la base de données ? »

Rien à configurer en v1. Sentier est local-first : la base, c'est **IndexedDB dans le navigateur** (Dexie, `src/data/db.ts`). Elle se crée toute seule au premier lancement, sur chaque appareil. Pas de serveur, pas de compte, pas de secret de BD. La sauvegarde passe par l'export/import JSON dans Réglages.

La synchro multi-appareils (Supabase, opt-in) est prévue plus tard — voir `docs/PLAN.md`.

## Configuration (une seule fois, ~5 min)

### 1. Récupérer l'Account ID Cloudflare

Tableau de bord Cloudflare → **Workers & Pages** → l'**Account ID** est affiché dans la colonne de droite (ou dans l'URL : `dash.cloudflare.com/<account-id>/…`).

### 2. Créer un jeton d'API

**My Profile → API Tokens → Create Token → Create Custom Token** :

- Permissions : `Account` · `Cloudflare Pages` · `Edit`
- Account Resources : `Include` · ton compte
- Créer, puis copier le jeton (il ne s'affiche qu'une fois).

### 3. Ajouter les secrets dans GitHub

Dépôt → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | le jeton de l'étape 2 |
| `CLOUDFLARE_ACCOUNT_ID` | l'ID de l'étape 1 |

### 4. Déployer

Pousse sur n'importe quelle branche (ou relance le dernier workflow dans l'onglet **Actions**). L'URL du déploiement apparaît dans les logs du job `deploy`.

Sans ces secrets, le job `deploy` est simplement ignoré (avertissement dans les logs) : la CI reste verte.

## Déployer à la main (optionnel)

```bash
pnpm build
npx wrangler@4 login
npx wrangler@4 pages deploy           # lit wrangler.toml (projet « sentier », dossier dist)
```

## Domaine personnalisé (optionnel)

Workers & Pages → `sentier` → **Custom domains** → ajouter le domaine. HTTPS est automatique (nécessaire pour installer la PWA sur téléphone).

## À ne pas faire

Ne connecte pas *aussi* le dépôt via l'intégration Git du tableau de bord Cloudflare : on aurait deux déploiements par push, dont un qui ne passe pas par les tests.
