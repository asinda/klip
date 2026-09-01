# KLIP — CLAUDE.md

> Fichier de contexte projet pour Claude. À placer à la racine du repo.
> Mis à jour : avril 2026

---

## 🎯 Vision Produit

**KLIP** est un SaaS de publication automatique de contenu sur TikTok et YouTube.

**Cible** : agences et équipes contenu (non-développeurs)

**Promesse** : "Connecte tes comptes, charge tes vidéos, KLIP publie automatiquement. Zéro serveur à gérer."

---

## 🏗️ Architecture

### Stack technique

```
Frontend      : Next.js 14 (App Router)
Backend       : Node.js / Express (monolithe modulaire)
Auth + DB     : Supabase (PostgreSQL + Auth)
Queues        : Upstash Redis + BullMQ
Stockage      : Cloudflare R2
Deploy        : Railway
IA contenu    : ElevenLabs (voix) + GPT-4 (scripts)
TikTok        : Content Posting API (OAuth 2.0)
YouTube       : Data API v3 (OAuth 2.0)
```

### Structure du projet

```
klip/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Pages authentifiées
│   ├── api/                # API routes
│   │   ├── auth/           # OAuth TikTok + YouTube
│   │   ├── accounts/       # Gestion comptes sociaux
│   │   ├── videos/         # Upload + scheduling
│   │   └── analytics/      # Métriques
│   └── (public)/           # Landing page
├── lib/
│   ├── supabase/           # Client Supabase
│   ├── upstash/            # Client Redis
│   ├── tiktok/             # TikTok API wrapper
│   ├── youtube/            # YouTube API wrapper
│   └── queue/              # BullMQ workers
├── services/
│   ├── publisher/          # Logique publication
│   ├── scheduler/          # Scheduling 30 jours
│   └── storage/            # Upload R2
└── CLAUDE.md
```

---

## 🔌 Intégrations

### TikTok
- API : Content Posting API v2
- Auth : OAuth 2.0 (flow guidé 3 clics)
- Rate limit : 6 req/min
- Format vidéo : MP4, 1080x1920 (9:16), 60-90s minimum
- Quota : pas de limite stricte sur les uploads

### YouTube
- API : Data API v3
- Auth : OAuth 2.0
- Rate limit : 10 000 units/jour
- Coût upload : ~1 600 units → max 6 uploads/jour/projet
- ⚠️ 1 projet Google Cloud par chaîne YouTube
- Format vidéo : MP4, 1080p, 16:9, 10min+ pour monétisation
- Thumbnail obligatoire pour performance

---

## 💰 Modèle Business

| Plan | Prix | Comptes | Vidéos/mois |
|---|---|---|---|
| Starter | 49€/mois | 2 | 30 |
| Agency | 149€/mois | 10 | 200 |
| White-label | 499€/mois | illimités | illimités |

---

## 🗄️ Schéma Base de Données (Supabase)

```sql
-- Organisations (multi-tenant)
organizations (id, name, plan, created_at)

-- Users
users (id, org_id, email, role)

-- Comptes sociaux connectés
social_accounts (
  id, org_id, platform, -- 'tiktok' | 'youtube'
  account_id, username,
  access_token, refresh_token, token_expires_at,
  theme, is_active, created_at
)

-- Vidéos uploadées
videos (
  id, org_id, title,
  r2_url, thumbnail_url,
  duration, format, -- 'short' | 'long'
  status, -- 'uploaded' | 'scheduled' | 'published' | 'failed'
  created_at
)

-- Jobs de publication
publish_jobs (
  id, video_id, account_id,
  scheduled_at, published_at,
  status, error_message,
  platform_post_id
)
```

---

## ⚙️ Variables d'Environnement

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=klip-videos

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=

# IA
OPENAI_API_KEY=
ELEVENLABS_API_KEY=

# App
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

---

## 🚀 Priorités de Développement

### Phase 1 — MVP vendable (objectif : 60 jours)
- [ ] Auth Supabase (email + magic link)
- [ ] Dashboard minimal : liste comptes + vidéos
- [x] Upload vidéo drag & drop → Cloudflare R2
- [ ] OAuth TikTok guidé (3 clics)
- [ ] Scheduling simple : date/heure par vidéo
- [ ] Worker BullMQ + publication TikTok
- [ ] Page analytics basique

### Phase 2 — YouTube + IA
- [ ] OAuth YouTube guidé
- [ ] Publication YouTube longues vidéos
- [ ] Génération script GPT-4
- [ ] Génération voix ElevenLabs
- [ ] Assemblage vidéo auto (FFmpeg serverless)

### Phase 3 — Scale agences
- [ ] Multi-tenant complet
- [ ] White-label (custom domain + branding)
- [ ] API publique
- [ ] Webhooks

---

## 📋 Conventions de Code

```typescript
// Nommage
// - Composants React : PascalCase
// - Fonctions/variables : camelCase
// - Constantes : UPPER_SNAKE_CASE
// - Fichiers : kebab-case

// Réponses API
type ApiResponse<T> = {
  data: T | null
  error: string | null
}

// Erreurs : toujours loggées + retournées proprement
// Pas de try/catch silencieux
```

---

## 🚨 Règles Importantes

1. **Ne jamais commiter** les fichiers `.env` ou credentials
2. **Un projet Google Cloud par chaîne YouTube** (quota API)
3. **Rate limit TikTok** : max 6 req/min → toujours passer par la queue
4. **Vidéos TikTok** : 60s minimum pour le Creativity Program
5. **Vidéos YouTube** : 10min minimum pour la monétisation YPP
6. **Tokens OAuth** : refresh automatique avant expiration
7. **Multi-tenant** : toujours filtrer par `org_id` dans les queries

---

## 🔗 Ressources

- TikTok API docs : https://developers.tiktok.com/doc/content-posting-api-get-started
- YouTube API docs : https://developers.google.com/youtube/v3
- Supabase docs : https://supabase.com/docs
- Upstash docs : https://upstash.com/docs/redis
- BullMQ docs : https://docs.bullmq.io
- Cloudflare R2 : https://developers.cloudflare.com/r2

---

## 📍 État Actuel

- Prototype v1 : publisher TikTok multi-comptes fonctionnel (stack locale)
- En cours : migration vers stack cloud (Supabase + Upstash + R2)
- Bloquant : approbation TikTok Developer App — **planning révisé (recherche 2026-09) : compter 4 à 8 semaines, avec au moins un cycle de rejet/resoumission** (le chiffre initial de "2-3 jours" n'était pas fiable ; l'API "unaudited" reste utilisable en attendant, mais force tous les posts en `SELF_ONLY`, donc invendable en l'état à un client agence). Voir points de vigilance ci-dessous.
- Prochaine étape : setup infra cloud + dashboard Next.js
- Publication TikTok : privacy_level actuellement fixé à SELF_ONLY (app TikTok non auditée) — à revoir une fois l'app approuvée pour du posting public
- Points de vigilance identifiés pour l'audit "Direct Post" (issus de rejets réels documentés sur un projet open-source équivalent, avril/mai 2026) : le composer doit afficher le nom/avatar du créateur connecté, le champ de confidentialité (privacy_level) doit être un menu déroulant sans valeur par défaut choisie par l'app, les toggles duet/stitch/commentaires doivent être décochés par défaut (opt-in utilisateur), un toggle "Branded Content" doit être présent, les contraintes renvoyées par l'API (durée max vidéo, etc.) doivent être réellement appliquées dans l'UI, et il faut une confirmation explicite + un suivi du statut de publication visible pour l'utilisateur. Prévoir la vidéo de démo du flow complet (login → consentement → composer → publication) avant soumission.
