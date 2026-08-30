# Dashboard UX Foundations — Design Spec

> Sous-projet 1 sur 2 d'une refonte UX du dashboard Klip. Sous-projet 2 (pages Schedule + Analytics) suivra une fois ces fondations posées.

## Contexte

Le dashboard Klip (`/dashboard`, `/dashboard/accounts`, `/dashboard/videos`) a été construit avec des couleurs Tailwind codées en dur (`bg-slate-900`, `text-purple-400`, `border-white/5`) alors que le projet a déjà un système de design shadcn/ui scaffoldé et jamais branché : tokens CSS complets light/dark (`app/globals.css`), `@radix-ui/*`, `class-variance-authority`, `tailwind-merge`, et un helper `cn()` déjà présent dans `lib/utils.ts`. Ce travail active cette fondation existante plutôt que d'en inventer une nouvelle.

**Pain points utilisateur identifiés** (confirmés par l'utilisateur) : incohérence visuelle entre pages, navigation/découvrabilité faible (sens des statuts peu clair), absence de feedback (pas de skeletons, retours d'erreur peu clairs), parcours incomplet (page Schedule inexistante bien que liée dans le sidebar).

**Recherche concurrentielle** (voir Sources en fin de document) : les outils du marché (Publer, Vista Social) placent un calendrier de contenu multi-plateforme au centre de l'expérience. La tendance UI 2026 chez les produits "calmes" (Linear, Vercel, Attio) est au **calm design** : base quasi-monochrome, la couleur ne sert que le sens (statut, plateforme), jamais la décoration — à l'opposé de traitements dégradés/glow décoratifs. Cette direction a été validée visuellement par l'utilisateur via le compagnon de brainstorming (mockup "H — calendrier avec miniatures", base grise neutre plutôt que la teinte bleu-marine actuelle des tokens).

## Objectif

Adopter le design system existant (composants + tokens), l'appliquer aux 3 pages actuelles du dashboard, et établir des patterns partagés (états de chargement/vides/erreur, badges de statut) que le sous-projet 2 (Schedule, Analytics) réutilisera directement.

## Hors périmètre

- Les pages `/dashboard/schedule` et `/dashboard/analytics` elles-mêmes (sous-projet 2) — mais la direction visuelle validée ici (base grise neutre, calendrier à miniatures façon Later/Publer) s'y appliquera directement.
- Toute modification de la landing page publique ou du flow de login.
- Animations/micro-interactions (framer-motion) — reporté en amélioration future si voulu.

## Architecture des composants

```
components/
├── ui/                    # Nouveau
│   ├── button.tsx         # variants: default | outline | ghost | destructive ; sizes: sm | md | lg
│   ├── card.tsx           # Card, CardHeader, CardContent, CardFooter
│   ├── input.tsx
│   ├── select.tsx         # Radix Select
│   ├── dialog.tsx         # Radix Dialog
│   ├── badge.tsx          # variant piloté par lib/status.ts (voir plus bas)
│   ├── skeleton.tsx       # shimmer sobre
│   ├── dropdown-menu.tsx  # Radix DropdownMenu
│   ├── tooltip.tsx        # Radix Tooltip
│   └── empty-state.tsx    # icône + message + CTA, partagé entre pages
└── dashboard/             # Existant — migré pour consommer ui/
    ├── Sidebar.tsx
    ├── AccountCard.tsx
    ├── VideoCard.tsx
    ├── VideoUploader.tsx
    └── ConnectAccountButtons.tsx
```

Dépendance à sens unique : `components/dashboard/*` consomme `components/ui/*`, jamais l'inverse. Chaque primitive `ui/` est un fichier autonome suivant le pattern shadcn standard (Radix + CVA + `cn()` de `lib/utils.ts`, déjà présent — rien à y changer).

## Tokens & thème

### Base neutre (remplace la teinte bleu-marine actuelle)

`app/globals.css` — remplacer les valeurs HSL suivantes (le `--primary` violet existant est conservé tel quel, c'est la couleur de marque) :

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  /* --primary, --primary-foreground, --destructive, --destructive-foreground, --ring, --radius inchangés */
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 6.9%;
  --card-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  /* --primary, --primary-foreground, --destructive, --destructive-foreground, --ring inchangés */
}
```

Toutes les classes hardcodées (`bg-slate-900`, `text-purple-400`, `border-white/5`, etc.) sont remplacées par les classes token (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`/`text-primary`).

### Dark mode réel

- Ajouter `next-themes`, thème par défaut = préférence système (`prefers-color-scheme`), persistance via `localStorage` (géré nativement par `next-themes`).
- Toggle soleil/lune dans `Sidebar.tsx`, en bas à côté de l'email/déconnexion.

## Statuts & plateformes — mapping unifié

`components/ui/badge.tsx` est un composant **générique et sans logique de domaine** : `<Badge className="...">{children}</Badge>`, juste un style pilule cohérent (padding, taille de police, `rounded-full`). La résolution "statut → libellé + couleur" vit dans un nouveau fichier `lib/status.ts`, sous forme de fonctions pures (pas de composant), une par domaine puisque `JobStatus`, `VideoStatus` et les plateformes sont trois ensembles de valeurs distincts (types déjà définis dans `lib/types.ts`) :

```ts
import type { JobStatus, VideoStatus } from './types'

export function getJobStatusBadge(status: JobStatus): { label: string; className: string } {
  const map: Record<JobStatus, { label: string; className: string }> = {
    pending:    { label: 'Planifié',  className: 'bg-amber-500/10 text-amber-400' },
    processing: { label: 'En cours',  className: 'bg-blue-500/10 text-blue-400' },
    published:  { label: 'Publié',    className: 'bg-emerald-500/10 text-emerald-400' },
    failed:     { label: 'Échoué',    className: 'bg-red-500/10 text-red-400' },
  }
  return map[status]
}

export function getVideoStatusBadge(status: VideoStatus): { label: string; className: string } {
  const map: Record<VideoStatus, { label: string; className: string }> = {
    uploaded:  { label: 'Uploadée',  className: 'bg-slate-500/10 text-slate-400' },
    scheduled: { label: 'Planifiée', className: 'bg-amber-500/10 text-amber-400' },
    published: { label: 'Publiée',   className: 'bg-emerald-500/10 text-emerald-400' },
    failed:    { label: 'Échouée',   className: 'bg-red-500/10 text-red-400' },
  }
  return map[status]
}

export function getPlatformBadge(platform: 'tiktok' | 'youtube'): { label: string; className: string } {
  const map = {
    tiktok:  { label: 'TikTok',  className: 'text-rose-400' },
    youtube: { label: 'YouTube', className: 'text-red-500' },
  }
  return map[platform]
}
```

Usage : `const { label, className } = getVideoStatusBadge(video.status); <Badge className={className}>{label}</Badge>`. Ceci élimine la duplication actuelle entre `StatusBadge` (fonction locale dans `app/(dashboard)/dashboard/page.tsx`) et le `Record` de statuts dans `components/dashboard/VideoCard.tsx` — les deux consomment désormais `lib/status.ts`.

## Migration par page/composant

| Fichier | Changements |
|---|---|
| `components/dashboard/Sidebar.tsx` | Couleurs → tokens ; ajout toggle thème ; menu utilisateur (email + déconnexion) en `DropdownMenu` au lieu du `<form>` brut |
| `app/(dashboard)/dashboard/page.tsx` | Stats en `Card` ; `StatusBadge` local supprimé, remplacé par `<Badge>` partagé ; **fix bug org_id** (voir plus bas) |
| `app/(dashboard)/dashboard/accounts/page.tsx` + `AccountCard.tsx` | `AccountCard` → `Card` ; `Skeleton` pendant le chargement serveur ; état vide → `EmptyState` |
| `app/(dashboard)/dashboard/videos/page.tsx` + `VideoCard.tsx` | `VideoCard` → `Card` + `<Badge>` partagé (mapping local supprimé) ; état vide → `EmptyState` ; `VideoUploader` inchangé fonctionnellement (garde `sonner`), juste migration visuelle du dropzone vers les tokens |

## États de chargement / vides / erreurs

- **Chargement** : un `loading.tsx` Next.js par route (`app/(dashboard)/dashboard/loading.tsx`, `.../accounts/loading.tsx`, `.../videos/loading.tsx`) utilisant `components/ui/skeleton.tsx` (shimmer sobre, pas de spinner) — pattern natif App Router, cohérent avec le fait que ces pages sont des server components.
- **Vide** : `components/ui/empty-state.tsx` (icône + titre + description + CTA optionnel), remplace les 3 blocs dupliqués actuels dans `videos/page.tsx`, `accounts/page.tsx`, et le bloc "Aucune publication" de `dashboard/page.tsx`.
- **Erreur d'action** : toasts `sonner` (déjà en place, inchangé).
- **Erreur de chargement de page** : pas de nouveau pattern nécessaire pour ce sous-projet — les pages sont server components, une erreur de fetch remonte au `error.tsx` standard de Next.js (à créer si absent, sinon laisser tel quel).

## Bug fix inclus

`app/(dashboard)/dashboard/page.tsx` : les requêtes `pendingCount` et `publishedCount` filtrent uniquement par `status`, sans `.eq('org_id', orgId)` — violation de la règle multi-tenant (CLAUDE.md §7), fuite de comptage cross-org. Ajouter le filtre `org_id` manquant sur ces deux requêtes.

## Tests

- Vitest (existant) : tests unitaires pour tout helper pur ajouté (ex: si `lib/status.ts` gagne une fonction de résolution au lieu d'un simple mapping objet — sinon pas de test nécessaire pour un objet constant).
- Pas de tests de composants React — cohérent avec le pattern déjà établi dans ce projet (vérification manuelle au navigateur pour l'UI, `npm run dev` + revue visuelle par tâche).

## Ordre d'implémentation suggéré (pour le plan)

1. Tokens (`globals.css`) + `next-themes` + toggle thème
2. Composants `ui/` de base (Button, Card, Badge, Skeleton, Input) — nécessaires à tout le reste
3. `lib/status.ts` + migration `Badge`
4. Composants `ui/` interactifs (Select, Dialog, DropdownMenu, Tooltip) — nécessaires pour Sidebar
5. Migration Sidebar
6. Migration Dashboard (+ fix bug org_id)
7. Migration Accounts (+ EmptyState, Skeleton)
8. Migration Videos (+ EmptyState, Skeleton)

## Sources (recherche concurrentielle & tendances 2026)

- [Buffer vs Later vs Metricool: Best Scheduler in 2026?](https://hashtagtools.io/blog/buffer-vs-later-vs-metricool-best-scheduler-2026)
- [Top 20+ Social Media Scheduling Tools Comparison — Vista Social](https://vistasocial.com/insights/social-media-scheduling-tools/)
- [Smart Content Scheduling With Publer's Social Media Calendar](https://publer.com/features/calendar-view)
- [Calendar view options – Vista Social](https://support.vistasocial.com/hc/en-us/articles/4495695550363-Calendar-view-options)
- [7 SaaS UI Design Trends for 2026, Shown With Real Screens](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [13 SaaS Calendar UI Design Examples in 2026](https://www.saasframe.io/categories/calendar)
