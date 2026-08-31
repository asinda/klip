# Publish Worker (BullMQ + TikTok) — Design Spec

> Sous-projet C de 3, et le seul qui ne peut pas être vérifié de bout en bout localement : il nécessite une vraie connexion Redis et de vraies clés TikTok (bloquées par l'approbation TikTok Developer App, cf. CLAUDE.md "État Actuel"). Portée volontairement limitée à TikTok — YouTube est explicitement Phase 2 dans le CLAUDE.md.

## Contexte

`package.json` a déjà un script `"worker": "tsx services/publisher/worker.ts"` qui pointe vers un fichier inexistant. `bullmq` (^5.7.0) et `@upstash/redis` (^1.31.0) sont installés mais jamais utilisés dans le code. `lib/tiktok/oauth.ts` a déjà `refreshTikTokToken`, mais aucun wrapper de publication n'existe.

## Point technique corrigé par rapport au CLAUDE.md

BullMQ nécessite une connexion Redis compatible `ioredis` (TCP), pas le client REST `@upstash/redis` déjà installé (qui sert à des lectures/écritures simples, pas à une queue de jobs). Upstash propose un endpoint Redis TCP séparé (URL `rediss://...`) en plus de son API REST. **Décision** : ajouter une nouvelle variable d'environnement `REDIS_URL` (documentée dans `.env.local.example`), utilisée uniquement par le worker via `ioredis`. `@upstash/redis` (REST) reste inutilisé pour l'instant — aucun code de ce sous-projet ne le consomme, ce n'est pas une régression, juste un constat.

## Objectif

Un worker qui traite les `publish_jobs` planifiés : à l'heure prévue, uploade la vidéo sur TikTok via son API Content Posting v2, et met à jour le statut.

## Architecture

```
lib/queue/
  connection.ts     — instancie la connexion ioredis à partir de REDIS_URL (échoue clairement si absente, même pattern que le fail-fast déjà établi sur R2)
  publish-queue.ts  — définit la Queue BullMQ 'publish-jobs'

lib/tiktok/
  publish.ts        — nouveau : uploadVideoToTikTok(accessToken, videoUrl, caption) → { publishId } via PULL_FROM_URL (l'API TikTok va chercher la vidéo à l'URL R2 publique, on n'a pas besoin de re-uploader le fichier)
                       getTikTokPublishStatus(accessToken, publishId) → statut de traitement TikTok

services/publisher/
  worker.ts          — BullMQ Worker consommant 'publish-jobs' : charge le publish_job (+ video, + social_account), rafraîchit le token si expiré (refreshTikTokToken), appelle uploadVideoToTikTok, marque le job 'processing' → poll → 'published' (avec platform_post_id, published_at) ou 'failed' (avec error_message), incrémente retry_count sur échec.
```

## Déclenchement des jobs

`POST /api/schedule` (sous-projet A), après avoir inséré la ligne `publish_jobs`, appelle `publishQueue.add(...)` avec un `delay` calculé (`scheduled_at - now()`, jamais négatif — si la date est dans le passé, délai 0, le job part immédiatement). Pas de poller cron séparé : BullMQ gère nativement les jobs différés.

## Ce qui reste non vérifiable localement

- Aucune connexion Redis réelle disponible (`REDIS_URL` restera un placeholder tant que l'utilisateur ne configure pas Upstash) → le worker ne peut pas être lancé de bout en bout.
- Aucune clé TikTok réelle → `uploadVideoToTikTok`/`getTikTokPublishStatus` ne peuvent pas être appelées contre la vraie API.
- Vérification prévue : `npx tsc --noEmit` + `npm run build` (le worker n'est pas importé par l'app Next.js donc ne doit pas casser son build), et des tests Vitest sur la logique pure isolable (calcul du délai, construction du corps de requête TikTok avec un `fetch` mocké — cohérent avec le fait que ce projet ne teste jamais des appels réseau réels).

## Multi-tenant / sécurité

Le worker utilise `createServiceClient()` (déjà existant dans `lib/supabase/server.ts`, clé service-role) puisqu'il tourne hors contexte de requête utilisateur — pas de session à scoper, mais chaque job ne touche que la ligne `publish_jobs`/`videos`/`social_accounts` dont il a l'id, jamais de requête large.

## Hors scope

- YouTube (Phase 2 CLAUDE.md).
- Nouvelle tentative automatique après échec (retry_count est incrémenté mais rien ne relance automatiquement — un futur sous-projet pourra ajouter un bouton "Réessayer" dans l'UI Schedule/Analytics).
- Notifications (email/Slack) sur échec de publication.
