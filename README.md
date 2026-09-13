# Klip

Klip est un SaaS de publication automatique de contenu vidéo sur **TikTok** et **YouTube**, pensé pour les agences et équipes de contenu (non-développeurs).

**Promesse** : connecte tes comptes, charge tes vidéos, Klip publie automatiquement — zéro serveur à gérer.

## Fonctionnalités

- **Multi-comptes** : connecte plusieurs comptes TikTok / YouTube via OAuth, gérés par organisation (multi-tenant).
- **Upload & stockage** : glisser-déposer une vidéo, stockage sur Cloudflare R2.
- **Planification** : choisis une vidéo, un compte, une date — Klip s'occupe du reste.
- **Composer conforme** : réglages de confidentialité, duet/stitch/commentaires, contenu de marque, tout choisi explicitement par l'utilisateur (aucune valeur imposée par défaut).
- **Publication automatique** : un worker traite la file de publication et publie sur la plateforme cible au moment prévu.
- **Analytics** : suivi des publications (succès/échecs) par organisation.

## Stack technique

| Composant | Techno |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind |
| Auth + DB | Supabase (PostgreSQL + Auth par lien magique) |
| Files d'attente | Upstash Redis + BullMQ |
| Stockage vidéo | Cloudflare R2 |
| Déploiement | Vercel |
| TikTok | Content Posting API (OAuth 2.0) |
| YouTube | Data API v3 (OAuth 2.0) |

## Démarrer en local

### Prérequis

- Node.js 18+
- Un projet Supabase (PostgreSQL + Auth)
- Une base Upstash Redis
- Un bucket Cloudflare R2
- Une app développeur TikTok (Content Posting API) et/ou un projet Google Cloud (YouTube Data API v3)

### Installation

```bash
npm install
cp .env.local.example .env.local
# renseigner les variables dans .env.local (voir ci-dessous)
npm run dev
```

L'app est disponible sur [http://localhost:3000](http://localhost:3000).

### Variables d'environnement

Voir `.env.local.example` pour la liste complète (Supabase, Upstash, Cloudflare R2, TikTok, YouTube). Aucun secret n'est fourni dans ce dépôt — chaque variable doit être renseignée avec tes propres identifiants.

### Worker de publication

Le worker qui traite la file de publication tourne en process séparé :

```bash
npm run worker
```

### Tests

```bash
npm test
```

## Structure du projet

```
klip/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Pages authentifiées
│   ├── api/                # API routes (auth OAuth, comptes, vidéos, planification)
│   └── (public)/           # Landing page, conditions, confidentialité
├── lib/                    # Clients Supabase/R2, wrappers OAuth par plateforme
│   ├── tiktok/
│   └── youtube/
├── services/
│   └── publisher/          # Worker de publication (BullMQ)
├── components/              # Composants UI (dashboard, formulaires)
└── docs/                   # Specs et plans de développement
```

## Statut

Projet en développement actif. La publication TikTok en usage public (au-delà de son propre compte) dépend de l'approbation de l'audit "Direct Post" de TikTok, en cours.

## Licence

Projet non encore sous licence publique — tous droits réservés.
