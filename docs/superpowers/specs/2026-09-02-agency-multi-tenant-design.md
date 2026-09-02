# Multi-tenant agence (Phase 3, noyau) — Design Spec

> Sous-projet de la feuille de route de rattrapage concurrentiel (`docs/superpowers/specs/2026-09-01-competitive-catchup-roadmap-design.md`, section "Phase 3"). Périmètre volontairement réduit au noyau du critère de sortie officiel : **clients + rôle client restreint + workflow d'approbation**. Marque blanche, reporting/facturation par client, invitation email/lien et vraie authentification client sont explicitement hors scope — voir "Hors scope" en fin de document.

## Contexte

Après la Phase 1 (déblocage TikTok/YouTube, mergée sur `master`), le schéma est : `organizations` → `users`/`social_accounts`/`videos` → `publish_jobs`, tout scopé par `org_id` avec RLS `org_id in (select org_id from users where id = auth.uid())` (voir `supabase/migrations/001_init.sql`, `002_youtube_quota_and_tiktok_composer.sql`, `003_hardening_and_backfill.sql`). L'authentification réelle reste reportée — le dev-auth-bypass (`lib/supabase/dev-org.ts`, `ALLOW_DEV_AUTH_BYPASS=1`) est le seul mécanisme d'accès actif en développement.

## Objectif

Construire le fossé défendable identifié par les recherches concurrentielles cette session : aucun concurrent "faceless channel" (Faceless.so, AITuber, AICUT, FlowShorts) n'a de vrai multi-tenant agence (sous-comptes clients, permissions restreintes, workflow d'approbation). Ce sous-projet construit le schéma et la logique — pas encore l'authentification client réelle, reportée séparément.

## Décision de conception clé

**Approche retenue : `clients` comme table additive nichée sous `organizations`**, plutôt qu'un modèle "client = organisation enfant". Alternative écartée : faire d'un client une organisation avec `parent_org_id`, réutilisant tout le RLS existant par `org_id` — plus élégant sur le papier, mais ça change la relation de base de chaque RLS déjà durcie et vérifiée en Phase 1 (`social_accounts`, `videos`, `publish_jobs`), un risque de régression sur du multi-tenant qui vient d'être soigneusement revu. L'approche additive n'ajoute que des tables/colonnes nouvelles ; aucune policy existante n'est retirée, seulement complétée par une clause `or`.

## Schéma

```sql
create table clients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now()
);

alter table social_accounts add column client_id uuid references clients(id) on delete set null;
alter table videos add column client_id uuid references clients(id) on delete set null;

create table client_members (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(client_id, user_id)
);

alter table publish_jobs add column approval_status text not null default 'not_required'; -- 'not_required' | 'pending' | 'approved' | 'rejected'
alter table publish_jobs add column approved_by uuid references users(id);
alter table publish_jobs add column approved_at timestamptz;

-- users.role gagne 'client' en plus de 'owner' | 'member' (contrainte applicative, pas de check constraint DB existant à modifier — role est déjà juste `text`)
```

**`client_id` est nullable partout** : un compte/vidéo peut rester interne à l'agence, sans client (décision explicite — pas de client fantôme obligatoire pour l'usage interne).

**Les deux `client_id` (social_accounts, videos) ont des rôles différents** : celui de `social_accounts` sert à organiser/filtrer la liste des comptes par client dans l'UI et à restreindre la visibilité d'un compte à un `client_member`. Celui de `videos` est **l'autorité pour le déclenchement de l'approbation** — un `publish_job` requiert une approbation si la vidéo qu'il publie a un `client_id` dont le client a `requires_approval = true`, indépendamment du `client_id` du compte social ciblé.

## Rôles et RLS

Un contact client appartient à l'org de l'agence (même `org_id`, FK existante inchangée), avec `role = 'client'`. Son accès réel passe par `client_members`, pas par l'appartenance à l'org.

RLS mise à jour sur `social_accounts`, `videos`, `publish_jobs` : le comportement `owner`/`member` actuel est préservé à l'identique (aucune régression), une clause `or` additionnelle donne l'accès à un `client`-role scopé à son client :

```sql
drop policy "org_members_see_accounts" on social_accounts;
create policy "org_access_accounts" on social_accounts
  for all using (
    org_id in (select org_id from users where id = auth.uid() and role in ('owner', 'member'))
    or client_id in (select client_id from client_members where user_id = auth.uid())
  );

drop policy "org_members_see_videos" on videos;
create policy "org_access_videos" on videos
  for all using (
    org_id in (select org_id from users where id = auth.uid() and role in ('owner', 'member'))
    or client_id in (select client_id from client_members where user_id = auth.uid())
  );

drop policy "org_members_see_jobs" on publish_jobs;
create policy "org_access_jobs" on publish_jobs
  for all using (
    video_id in (
      select id from videos where org_id in (select org_id from users where id = auth.uid() and role in ('owner', 'member'))
    )
    or video_id in (
      select v.id from videos v
      join client_members cm on cm.client_id = v.client_id
      where cm.user_id = auth.uid()
    )
  );

alter table clients enable row level security;
create policy "org_staff_manage_clients" on clients
  for all using (org_id in (select org_id from users where id = auth.uid() and role in ('owner', 'member')));
create policy "client_sees_own_client" on clients
  for select using (id in (select client_id from client_members where user_id = auth.uid()));

alter table client_members enable row level security;
create policy "org_staff_manage_client_members" on client_members
  for all using (
    client_id in (select id from clients where org_id in (select org_id from users where id = auth.uid() and role in ('owner', 'member')))
  );
create policy "client_sees_own_membership" on client_members
  for select using (user_id = auth.uid());
```

**Garde-fou colonne vs ligne** : la RLS ci-dessus autorise l'UPDATE de toute la ligne `publish_jobs` à un `client`-role scopé sur son client — RLS protège l'isolation par ligne, pas par colonne. C'est la route API d'approbation (voir plus bas) qui limite strictement ce qu'un contact client peut modifier : uniquement `approval_status`/`approved_by`/`approved_at`, jamais `scheduled_at` ou les autres champs, en construisant l'update côté serveur avec un payload fixe plutôt qu'en relayant le body de la requête.

## Workflow d'approbation

1. **Planification** (`app/api/schedule/route.ts`, POST) : après avoir résolu la vidéo (déjà fait, sélection étendue à `client_id`), si `video.client_id` est non-null et que le client correspondant a `requires_approval = true` : insérer le `publish_job` avec `approval_status: 'pending'` et **ne pas appeler `enqueuePublishJob`**. Sinon (pas de client, ou client sans approbation requise) : `approval_status: 'not_required'`, comportement actuel inchangé (enqueue immédiat).
2. **Nouvelle route** `PATCH /api/schedule/[id]/approve`, body `{ decision: 'approved' | 'rejected' }` :
   - Résout le job (`select *, video:videos!inner(client_id, org_id)`), vérifie que `approval_status === 'pending'` (sinon 409 — déjà tranché).
   - Autorisé si l'utilisateur courant est `owner`/`member` de l'org du job **ou** `client_member` du client de la vidéo. Le staff agence peut approuver/rejeter au nom du client tant que la vraie authentification client n'existe pas — c'est intentionnel, pas un oubli.
   - `decision: 'approved'` → update `approval_status='approved', approved_by=<user>, approved_at=now()`, puis `enqueuePublishJob(job.id, job.scheduled_at)` (réutilise `computeDelayMs` tel quel — si `scheduled_at` est déjà passé, part immédiatement, cohérent avec le comportement existant).
   - `decision: 'rejected'` → update `approval_status='rejected'` uniquement, jamais enqueue. Le job reste en base, visible, mais mort — distinct d'une suppression (`DELETE /api/schedule/[id]`, qui reste inchangée et continue de fonctionner sur un job en attente d'approbation : comme il n'a jamais été enqueue, il n'y a aucun job BullMQ orphelin à nettoyer, plus simple que le cas général déjà connu).
3. **Pas de nouveau statut vidéo** : `videos.status` reste `'scheduled'` dès la planification, comme aujourd'hui. `publish_jobs.approval_status` porte seule l'information "en attente d'accord" — évite de dupliquer un état sur deux tables.
4. **UI** (`app/(dashboard)/dashboard/schedule/`) : les cartes de job affichent un badge d'approbation quand `approval_status !== 'not_required'`, avec des boutons Approuver/Rejeter visibles pour les utilisateurs autorisés.

## Gestion des clients (UI minimale)

Sans cette brique, aucune ligne `clients`/`client_members` n'est créable autrement qu'en base directement — le workflow d'approbation resterait inexerçable. Périmètre minimal, pas de maquette détaillée ici (à préciser au niveau du plan d'implémentation) :

- Une nouvelle page `/dashboard/clients` : liste des clients de l'org, formulaire de création (nom + toggle `requires_approval`).
- Sur chaque client : un moyen d'y rattacher des comptes/vidéos existants (changer leur `client_id`) et d'y ajouter un `client_member` en sélectionnant un `users` row existant de l'org — pas d'invitation par email, cohérent avec le hors-scope "vraie auth client". En pratique, en développement, un `client_member` ne devient testable qu'après avoir créé manuellement un second `users` row avec `role='client'` (aucun flux d'inscription n'existe encore).

## Hors scope

- Vraie authentification client (login externe réel) — sous-projet séparé, plus tard. Un `client_member` est ici une donnée assignable manuellement (via le dev-bypass existant) pour exercer le rôle en développement.
- Invitation par email/lien pour un contact client — n'a de sens qu'une fois la vraie auth construite.
- Marque blanche (logo/couleurs par agence) — sous-projet séparé, se greffera sur `clients` plus tard sans changement de ce schéma.
- Reporting/facturation par client — sous-projet séparé.
- Modification du modèle `organizations.plan` (starter/agency/white_label) — aucun changement ici, un client n'a pas de plan propre.
