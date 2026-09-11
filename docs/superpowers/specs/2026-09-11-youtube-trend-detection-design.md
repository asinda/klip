# Détection de tendances YouTube — Design Spec

> Deux volets indépendants mais construits sur la même infrastructure : (1) détecter quand une vidéo publiée via Klip devient elle-même virale, (2) une page de veille affichant les vidéos externes en tendance sur YouTube, filtrées par catégorie. Périmètre v1 : YouTube uniquement pour les deux volets — TikTok n'a pas d'API officielle de tendances et reste hors scope de cette itération.

## Contexte

La page analytics actuelle (`app/(dashboard)/dashboard/analytics/page.tsx`, `lib/analytics.ts`) ne suit que des compteurs de publication (vidéos uploadées, taux de succès) — aucune métrique de vues/likes n'est récupérée nulle part aujourd'hui. Cette fonctionnalité part donc de zéro côté données de performance vidéo.

Le quota YouTube (10 000 units/jour) est déjà mutualisé projet-entier et surveillé par `lib/youtube/quota.ts` (`getYouTubeQuotaUsageGlobal`, `todayPacificDateKey`) — les deux nouveaux jobs de cette feature consomment ce même pool, en plus de la planification de publication existante.

## Volet 1 — Suivi des vidéos Klip (auto-détection de virilité)

**Objectif** : alerter l'utilisateur quand une vidéo publiée via Klip sur YouTube décolle, en comparant sa vitesse de vues à la moyenne historique du compte connecté (pas de seuil absolu — un petit et un gros compte n'ont pas la même échelle).

### Calcul de vélocité

À chaque exécution du job `metrics-sync` (toutes les 30-60 min) :

1. Récupérer les `publish_jobs` YouTube publiés (`status = 'published'`, `published_at` ≤ 30 jours).
2. Grouper leurs `platform_post_id` (id vidéo YouTube) par batchs de 50, un appel `videos.list?part=statistics&id=id1,id2,...` par batch (1 unit de quota par appel, quel que soit le nombre d'ids).
3. Pour chaque vidéo : insérer un `video_metrics_snapshots` (views, likes, comments, captured_at = maintenant).
4. Vélocité de la vidéo = `(views_dernier_snapshot − views_snapshot_précédent) / heures_écoulées`. Impossible à calculer avec un seul snapshot — dans ce cas, rien à comparer, on attend le prochain cycle.
5. Vélocité de référence du compte = moyenne des vélocités des 10 dernières vidéos du même `account_id` (en excluant la vidéo évaluée). Si le compte a moins de 3 vidéos avec un historique suffisant, pas de détection possible — ignoré silencieusement, pas une erreur.
6. Si vélocité vidéo > 3 × vélocité de référence → `publish_jobs.is_trending = true`, `trending_since = now()` (si pas déjà `true`).

**Pas de dé-marquage automatique** : un burst qui retombe reste marqué comme "a été en tendance" — information jugée utile même après coup, garde le calcul simple pour cette v1.

### Alerte

Badge visuel sur la vidéo/le job concerné dans le dashboard existant, plus une section dédiée dans la nouvelle page `app/(dashboard)/dashboard/trends/page.tsx` listant les `publish_jobs` où `is_trending = true`. Pas d'email dans cette v1 (pas de service d'envoi d'email dans la stack actuelle).

## Volet 2 — Veille externe (inspiration)

**Objectif** : afficher les vidéos YouTube actuellement en tendance, filtrées par les catégories que chaque organisation choisit de suivre.

### Configuration

Chaque org choisit une ou plusieurs catégories YouTube (`videoCategoryId` — Gaming, Beauté, Business, etc.). Il n'existe pas de page de paramètres dans le repo actuel (seulement `accounts`, `analytics`, `schedule`, `videos`) — le sélecteur de catégories vit directement en haut de la nouvelle page `trends` (pas de nouvelle page de settings pour cette itération). Stocké dans `org_trend_categories`.

### Récupération

Job `trend-fetch` (toutes les quelques heures) :
1. Lister les `youtube_category_id` distincts actuellement suivis par au moins une org (peu importe le nombre d'orgs qui suivent la même catégorie).
2. Un appel `videos?chart=mostPopular&videoCategoryId={id}&regionCode=FR` par catégorie distincte (1 unit de quota par appel) — **partagé entre toutes les orgs qui suivent cette catégorie**, pas un appel par org.
3. Upsert du résultat dans `trending_videos_cache`, remplaçant les entrées précédentes de cette catégorie.

La page `trends` affiche ce cache filtré par les catégories suivies par l'org courante — lecture pure, aucun appel API au chargement de la page.

`regionCode` fixé à `FR` pour cette v1 — extensible par org plus tard si besoin, hors scope ici.

## Modèle de données

```sql
-- Instantanés de statistiques (un point dans le temps par job de publication)
create table video_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  publish_job_id uuid not null references publish_jobs(id) on delete cascade,
  views integer not null,
  likes integer,
  comments integer,
  captured_at timestamptz not null default now()
);
create index on video_metrics_snapshots (publish_job_id, captured_at);

-- Catégories YouTube suivies par organisation (volet 2)
create table org_trend_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  youtube_category_id text not null,
  category_label text not null,
  created_at timestamptz not null default now(),
  unique (org_id, youtube_category_id)
);

-- Cache partagé des vidéos tendance externes (volet 2)
create table trending_videos_cache (
  id uuid primary key default gen_random_uuid(),
  youtube_category_id text not null,
  region_code text not null default 'FR',
  youtube_video_id text not null,
  title text not null,
  channel_title text not null,
  thumbnail_url text,
  view_count bigint not null,
  fetched_at timestamptz not null default now()
);
create index on trending_videos_cache (youtube_category_id, region_code);
```

Et sur `publish_jobs` : `is_trending boolean not null default false`, `trending_since timestamptz`.

Les métriques sont rattachées à `publish_job_id`, pas à `video_id` : les stats sont propres à une publication précise (un id vidéo YouTube donné), et une même vidéo Klip peut en théorie être publiée sur plusieurs comptes.

Pas de table séparée pour la "moyenne du compte" — recalculée à chaque run à partir des snapshots existants, pour éviter une donnée dérivée à tenir synchronisée.

## Architecture (jobs)

Même pattern que l'existant (`lib/queue/publish-queue.ts` + `services/publisher/worker.ts`) :

- `lib/queue/metrics-queue.ts` + `services/metrics/worker.ts` — job répétable BullMQ (`repeat: { every }`), 30-60 min.
- `lib/queue/trend-queue.ts` + `services/trends/worker.ts` — job répétable BullMQ, quelques heures.

## Gestion des erreurs & quota

- Avant chaque batch (`metrics-sync`) ou chaque appel `mostPopular` (`trend-fetch`), vérifier le quota global restant du jour (même mécanisme que `/api/schedule`) ; si insuffisant, sauter ce cycle et réessayer au suivant — pas d'échec bruyant.
- Un id vidéo qui échoue dans un batch `videos.list` (vidéo supprimée/privée depuis) : logger et continuer sur le reste du batch, ne pas faire échouer tout le cycle.
- Coût `metrics-sync` : ~1 unit par 50 vidéos, indépendant du nombre d'orgs. Coût `trend-fetch` : 1 unit par catégorie distincte réellement suivie, indépendant du nombre d'orgs qui la suivent — les deux jobs sont conçus pour ne pas scaler avec le nombre de clients.

## Tests

Sur le modèle déjà en place (Vitest, `fetch` mocké via `vi.stubGlobal`, jamais d'appel réseau réel) :

- Fonctions pures isolées dans `lib/trends.ts` (ou équivalent) : calcul de vélocité, calcul de la moyenne glissante de référence, décision de dépassement de seuil — testées indépendamment (0 snapshot, 1 snapshot, historique insuffisant, dépassement, non-dépassement).
- Découpage des ids en batchs de 50 : test unitaire dédié.
- `metrics-sync`/`trend-fetch` (workers) : pas de test unitaire du worker lui-même, comme pour `services/publisher/worker.ts` existant — vérification via `tsc --noEmit`/`npm run build`.

## Hors scope (cette itération)

- TikTok (aucune API officielle de tendances — scraping ou provider tiers à évaluer séparément si besoin plus tard).
- Email/notification externe pour l'alerte de tendance — badge dashboard uniquement.
- Dé-marquage automatique d'une vidéo qui n'est plus en tendance.
- `regionCode` configurable par org (fixé à `FR` pour tous).
- Toute génération de contenu à partir des tendances détectées (lien possible avec un futur outil de génération IA, mais pas construit ici).
