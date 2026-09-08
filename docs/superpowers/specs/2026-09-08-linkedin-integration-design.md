# Intégration LinkedIn (Page Entreprise) — Design Spec

> Nouvelle plateforme de publication, en plus de TikTok et YouTube déjà en place. Périmètre : Page Entreprise uniquement, flux de planification existant inchangé (LinkedIn devient un 3e choix de compte, pas de sélection multi-plateformes en une action).

## Contexte

Klip publie aujourd'hui sur TikTok (worker fonctionnel) et YouTube (OAuth + quota seulement, pas encore de worker de publication — Phase 2 du roadmap original). Chaque plateforme a son propre module (`lib/tiktok/`, `lib/youtube/`), ses propres routes OAuth (`app/api/auth/<plateforme>/`), et le worker (`services/publisher/worker.ts`) ne traite aujourd'hui que les jobs `platform === 'tiktok'` (early-return sur tout le reste).

## Contrainte majeure découverte à la recherche

Contrairement à TikTok (sandbox self-service) et YouTube (OAuth Google standard), publier sur une Page Entreprise LinkedIn nécessite une **candidature partenaire formelle** ("Community Management API") : email professionnel vérifiable, entreprise enregistrée, Page LinkedIn vérifiée par son admin, vidéo de démo pour le tier production, et potentiellement un appel de validation technique avec LinkedIn. Aucun délai garanti, approbation non garantie même en remplissant tous les critères.

**Décision** (validée avec l'utilisateur) : construire le code maintenant, soumettre la candidature partenaire en parallèle — le code est prêt dès que/si l'accès arrive, sans bloquer le développement dessus.

Second point technique découvert : LinkedIn ne fonctionne pas en "pull from URL" comme TikTok. Le flux est un **push par morceaux** : `initializeUpload` → upload de chaque plage d'octets fournie par LinkedIn → `finalizeUpload` → attente asynchrone du traitement vidéo → création du post référençant la vidéo. Le worker doit donc télécharger la vidéo depuis R2 puis la repousser vers LinkedIn, plus lourd en bande passante que le flux TikTok actuel — acceptable sur Railway (pas de contrainte serverless), pas testé en conditions réelles avant l'obtention de l'accès partenaire.

## Schéma

```ts
// lib/types.ts
export type Platform = 'tiktok' | 'youtube' | 'linkedin'
```

Aucune nouvelle table, aucune nouvelle colonne. `social_accounts.account_id` stocke l'ID numérique de l'organisation LinkedIn (même convention que l'`open_id` TikTok ou le `channel_id` YouTube) — le code reconstruit `urn:li:organization:{account_id}` là où c'est nécessaire. `publish_jobs.platform_post_id` stocke l'URN du post LinkedIn créé, réutilise le champ générique existant sans modification.

## OAuth

`lib/linkedin/oauth.ts` — même forme que `lib/tiktok/oauth.ts`/`lib/youtube/oauth.ts` :

```ts
export function getLinkedInAuthUrl(state: string): string
export async function exchangeLinkedInCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
export async function getLinkedInOrgInfo(accessToken: string): Promise<{ organization_id: string; name: string; logo_url?: string }>
export async function refreshLinkedInToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }>
```

Scope demandé : `w_organization_social`. **Point non vérifié à l'implémentation** : LinkedIn ne documente pas systématiquement un refresh token silencieux sur tous ses produits — si `exchangeLinkedInCode` ne renvoie pas de `refresh_token`, `refreshLinkedInToken` reste inutilisée et le compte devra être reconnecté manuellement à l'expiration (comportement à confirmer une fois l'accès partenaire obtenu, pas bloquant pour écrire le reste du code).

Nouvelles routes, miroir exact des routes TikTok/YouTube existantes :
- `app/api/auth/linkedin/route.ts` (redirige vers `getLinkedInAuthUrl`)
- `app/api/auth/linkedin/callback/route.ts` (échange le code, insère la ligne `social_accounts` avec `platform: 'linkedin'`)

`components/dashboard/ConnectAccountButtons.tsx` gagne un 3e bouton "Connecter LinkedIn".

## Upload et publication

Nouveau module `lib/linkedin/publish.ts` :

```ts
export interface LinkedInVideoStatus {
  status: 'WAITING_UPLOAD' | 'PROCESSING' | 'AVAILABLE' | 'PROCESSING_FAILED'
}

export async function uploadVideoToLinkedIn(
  accessToken: string,
  organizationUrn: string,
  videoUrl: string,
  fileSizeBytes: number
): Promise<{ videoUrn: string }>
```
1. `POST /rest/videos?action=initializeUpload` avec `owner: organizationUrn`, `fileSizeBytes` → renvoie l'URN vidéo, un `uploadToken`, et des `uploadInstructions` (plages d'octets + URL d'upload propre à chacune, fournies par LinkedIn — pas de découpage à calculer côté Klip).
2. `fetch(videoUrl)` (URL publique R2 déjà existante) pour récupérer les octets.
3. Pour chaque instruction : `PUT` de la plage correspondante vers son `uploadUrl`, on garde l'`ETag` de la réponse.
4. `POST /rest/videos?action=finalizeUpload` avec l'URN vidéo, l'`uploadToken`, et les `ETag` dans l'ordre.
5. Poll `GET /rest/videos/{urn}` jusqu'à `status: 'AVAILABLE'` ou `'PROCESSING_FAILED'` — même forme de boucle (intervalle + nombre max de tentatives) que le poll TikTok déjà présent dans `services/publisher/worker.ts`.

```ts
export async function createLinkedInPost(
  accessToken: string,
  organizationUrn: string,
  videoUrn: string,
  caption: string
): Promise<{ postUrn: string }>
```
`POST /rest/posts` — `content.media.id: videoUrn`, `author: organizationUrn`, `commentary: caption` (le titre de la vidéo, même convention que TikTok — pas de champ éditorial dédié pour ce périmètre).

Pas de rate-limiter dédié : LinkedIn ne publie aucun chiffre officiel de limite pour le tier production ("Standard : aucune restriction" d'après sa propre documentation) — le lissage naturel de BullMQ (jobs espacés par leur `scheduled_at`) suffit tant qu'aucune vraie limite documentée ne l'exige.

## Worker

Dans `services/publisher/worker.ts`, le early-return actuel :

```ts
if (publishJob.account.platform !== 'tiktok') {
  console.log(`[worker] skipping non-TikTok job ${publishJobId} (platform: ${publishJob.account.platform})`)
  return
}
```

devient un branchement à trois voies : `tiktok` (logique inchangée), `linkedin` (nouvelle logique : `uploadVideoToLinkedIn` puis `createLinkedInPost`, `platform_post_id = postUrn`), `youtube` (toujours ignoré — pas de worker de publication YouTube, hors scope de cette itération comme déjà acté dans le roadmap).

## Action manuelle en parallèle (hors code)

Soumettre la candidature partenaire "Community Management API" sur le portail développeur LinkedIn : email professionnel, informations légales de l'entreprise, Page LinkedIn vérifiée par son admin. Aucun délai garanti — traiter comme un chemin parallèle au développement, pas une dépendance bloquante.

## Hors scope

- Profils personnels LinkedIn (`w_member_social`) — Page Entreprise uniquement pour cette itération.
- Sélection multi-plateformes en une action — le flux de planification existant (un compte à la fois, répété si besoin) reste inchangé.
- Champ de légende éditorial dédié à LinkedIn — réutilise le titre de la vidéo, comme TikTok.
- Toute UX spécifique de composer pour LinkedIn — contrairement à TikTok, aucune exigence d'audit connue ne l'impose.
- Vérification empirique de la taille max réellement acceptée par LinkedIn (sa propre documentation se contredit entre 500MB et 5GB dans la même page) — à clarifier une fois l'accès partenaire obtenu et testable en conditions réelles.
