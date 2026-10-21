# Comptes, synchro, coach et communauté (Supabase)

Sans configuration, Sentier reste 100 % local. Avec Supabase :

- **Compte optionnel** (courriel + mot de passe) : synchro entre appareils, en gardant le mode hors-ligne.
- **Coach** : l'athlète entre le code de son coach ; le coach peut alors **lire** toutes ses données (sans pouvoir les modifier). L'athlète peut retirer l'accès quand il veut.
- **Amis / communauté** : chacun choisit qui voit ses courses et sorties (personne, amis, tout le monde). On partage seulement un résumé (nom, date, distance, durée, dénivelé, résultat) : jamais la FC, les douleurs ni les notes.

## Comment ça marche

- L'app garde sa base locale (IndexedDB) : rapide, utilisable sans réseau en sentier.
- `src/data/sync.ts` envoie les changements locaux, puis récupère ceux du serveur. En cas de conflit, **la dernière modification gagne**. Les suppressions se propagent aussi.
- Côté serveur, une seule table générique `records` (données en JSON) : ajouter une table à l'app ne demande aucune migration Supabase.
- La sécurité repose sur la **RLS** de Postgres (`supabase/migrations/`). Chaque règle est testée par `scripts/test-db.sh` (Postgres local, aucun compte requis).
- Les données de démo ne quittent jamais l'appareil.
- Se déconnecter efface les données **de l'appareil** (elles restent sur le serveur). Supprimer son compte efface tout, partout.

## Mise en place (une fois, ~10 min)

### 1. Créer le projet

[supabase.com](https://supabase.com) → **New project**.
- Région : **Canada (Central)**, pour garder les données de santé au Canada (Loi 25).
- Note le mot de passe de la base quelque part de sûr. L'app n'en a pas besoin.

### 2. Créer les tables

**SQL Editor → New query**, colle tout le contenu de `supabase/migrations/20261021000000_init.sql`, puis **Run**.

### 3. Régler l'authentification

**Authentication → Sign In / Providers → Email** : activé, avec « Confirm email » activé (recommandé).

**Authentication → URL Configuration** :
- Site URL : `https://trainingplan.filsduchrist16.workers.dev` (ou ton domaine)
- Redirect URLs : ajoute `https://trainingplan.filsduchrist16.workers.dev/**` et `http://localhost:5173/**`

> Le service de courriel inclus avec Supabase est très limité (quelques courriels par heure). Pour plus d'utilisateurs, branche un SMTP (Resend, Postmark…) dans **Authentication → Emails → SMTP Settings**.

### 4. Donner les clés à l'app

**Project Settings → API Keys** (ou bouton **Connect**) : copie l'**URL du projet** et la **clé publique** (*publishable*, `sb_publishable_…`, ou l'ancienne *anon key*).

Ne mets **jamais** la clé *secret* / *service_role* dans l'app.

- **En production**, dans Cloudflare : Workers & Pages → `trainingplan` → Settings → **Variables and secrets** (section *Build*). Ajoute :
  - `VITE_SUPABASE_URL` = l'URL du projet
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = la clé publique

  Puis relance un build (Deployments → *Retry*, ou un push). Ce sont des variables de **build** : Vite les intègre au moment de la compilation.
- **En local** : copie `.env.example` vers `.env.local` et remplis-le.

### 5. Vérifier

Ouvre l'app → **Plus** : une carte **Compte** apparaît. Crée un compte, puis connecte-toi sur un 2e appareil : tes données arrivent.

## Développement

```bash
scripts/test-db.sh   # teste le schéma et toutes les règles d'accès sur un Postgres jetable
pnpm test            # inclut les tests du moteur de synchro (faux serveur)
```

Modifier le schéma : ajoute un **nouveau** fichier dans `supabase/migrations/` (ne jamais modifier un fichier déjà appliqué), ajoute ses tests dans `supabase/tests/rls_test.sql`, puis exécute-le dans le SQL Editor.
