# Schedule Page — Design Spec

> Sous-projet A de 3 (Schedule, Analytics, Worker) pour terminer le Phase 1 du CLAUDE.md, hors auth (mise de côté) et hors vraies clés externes (TikTok Developer App non approuvé, Redis/R2 en placeholder).

## Contexte

`/dashboard/schedule` est lié dans `Sidebar.tsx` mais renvoie 404 — aucune page n'existe. Le besoin CLAUDE.md est "Scheduling simple : date/heure par vidéo". La table `publish_jobs` existe déjà (`video_id, account_id, scheduled_at, published_at, status, error_message, platform_post_id, retry_count`), sans colonne `org_id` propre — le scope multi-tenant passe par `videos.org_id`.

La direction visuelle (calendrier avec miniatures, design calme) a été validée en amont dans cette session via le compagnon de brainstorming (mockup "H").

## Objectif

Permettre de planifier la publication d'une vidéo déjà uploadée sur un compte connecté, à une date/heure donnée, et de visualiser/annuler ces planifications — sans toucher à la publication réelle (sous-projet C).

## Portée

- Vue calendrier **semaine courante uniquement** (pas de navigation mois/semaine précédente — "simple" au sens du CLAUDE.md). Chaque case jour affiche les vidéos planifiées ce jour-là (miniature + heure + point coloré plateforme via `getPlatformBadge`).
- Dialog "Planifier une vidéo" : Select vidéo (parmi les vidéos de l'org, statut `uploaded`), Select compte (parmi les comptes actifs de l'org), champ date/heure (`<input type="datetime-local">` natif — pas de date-picker custom), validation date future.
- Annulation d'une planification (Dialog de confirmation, réutilise le pattern déjà établi dans `AccountCard`).
- Hors scope : édition d'une planification existante (annuler + recréer suffit pour "simple"), drag & drop de déplacement, vue mois.

## Nouveaux primitifs `ui/`

- `components/ui/select.tsx` — wrapper Radix Select (pattern shadcn standard, `@radix-ui/react-select` déjà installé).
- `components/ui/input.tsx` — wrapper standard shadcn (`@radix-ui/react-label` déjà installé pour un `Label` compagnon si besoin, sinon `<label>` natif suffit).

Ces deux primitifs étaient explicitement différés dans le plan précédent faute de consommateur — celui-ci existe maintenant.

## Modèle de données

Aucune migration nécessaire. `publish_jobs.status` reste `'pending'` à la création (le passage à `processing`/`published`/`failed` est la responsabilité du worker, sous-projet C). Créer une planification met aussi à jour `videos.status` à `'scheduled'` (déjà une valeur valide de `VideoStatus`).

## API

- `POST /api/schedule` : body `{ video_id, account_id, scheduled_at }`. Vérifie que `video_id` et `account_id` appartiennent bien à l'org de l'appelant (comme le fait déjà `/api/videos`), insère la ligne `publish_jobs`, met à jour `videos.status = 'scheduled'`. Réponse `ApiResponse<PublishJob>`.
- `DELETE /api/schedule/[id]` : vérifie l'appartenance à l'org via le join `videos.org_id`, supprime la ligne (ou passe le statut à un état annulé — **décision** : suppression pure, plus simple, cohérent avec "simple scheduling" ; pas de notion d'historique d'annulation en Phase 1).

## Multi-tenant

Toute requête sur `publish_jobs` passe par le join `videos!inner(org_id)` + `.eq('video.org_id', orgId)`, comme déjà établi dans `app/(dashboard)/dashboard/page.tsx` lors du sous-projet précédent.

## Auth

Utilise `getCurrentUserRow` de `lib/supabase/dev-org.ts` (contournement dev déjà en place), comme les 3 pages existantes.

## Tests

Vitest pour toute logique pure ajoutée (ex: calcul des bornes de la semaine courante, regroupement des jobs par jour). Pas de tests de composants React (convention déjà établie).
