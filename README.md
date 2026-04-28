# Bilnov — Déploiement Vercel

## Architecture

Ce projet est un **Next.js standalone** (pas de monorepo) :
- **Frontend** : Next.js 14 App Router
- **API** : Next.js Route Handlers (dans `src/app/api/`)
- **BDD** : Prisma + Neon PostgreSQL
- **Storage** : Cloudflare R2
- **Déploiement** : Vercel

## Déploiement sur Vercel — 4 étapes

### 1. Migrer la base de données

Dans Codespaces ou en local, avec l'URL Neon directe :

```bash
DIRECT_DATABASE_URL="postgresql://..." DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

### 2. Connecter GitHub à Vercel

- vercel.com → New Project → importer ce repo
- **Framework Preset** : Next.js
- **Root Directory** : `.` (racine, laisser vide)
- **Build Command** : `next build` (par défaut)
- **Output Directory** : `.next` (par défaut)

### 3. Variables d'environnement Vercel

Copier depuis `.env.example` et remplir les valeurs réelles :

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL pooler Neon (pour les requêtes) |
| `DIRECT_DATABASE_URL` | URL directe Neon (pour les migrations) |
| `JWT_SECRET` | Secret aléatoire min. 32 chars |
| `STORAGE_ENDPOINT` | `https://<ID>.r2.cloudflarestorage.com` |
| `STORAGE_ACCESS_KEY` | Clé R2 Access |
| `STORAGE_SECRET_KEY` | Secret R2 |
| `STORAGE_BUCKET` | `bilnov-files` |
| `STORAGE_REGION` | `auto` |
| `NODE_ENV` | `production` |

### 4. Déployer

Cliquer **Deploy** — Vercel détecte automatiquement Next.js.

## Développement local

```bash
# Installer les dépendances
npm install

# Copier les variables
cp .env.example .env.local

# Lancer les migrations
npx prisma migrate dev

# Démarrer
npm run dev
```
