# Analytics Page — Design Spec

> Sous-projet B de 3. Dépend des mêmes tables que Schedule (`videos`, `publish_jobs`) mais n'a aucune dépendance sur le worker (sous-projet C) — affiche ce qui existe déjà en base, même si tout est à zéro.

## Contexte

`/dashboard/analytics` est lié dans `Sidebar.tsx` mais renvoie 404. CLAUDE.md demande une "Page analytics basique" pour le Phase 1.

## Objectif

Donner une vue d'ensemble simple de l'activité : combien de vidéos, réparties comment, combien de publications à chaque statut, taux de succès, et les erreurs récentes pour du debug rapide.

## Portée

- 4 cartes stat (réutilisent `Card`, mêmes classes que `dashboard/page.tsx`) : total vidéos, vidéos "short" vs "long", total publications planifiées, taux de succès (publiées / (publiées + échouées), 0% si aucune donnée).
- Une répartition par statut de job (pending/processing/published/failed) sous forme de barres horizontales Tailwind simples (pas de librairie de graphiques — `recharts` ajouterait une dépendance pour un besoin "basique" ; on reste sur des `<div>` avec largeur en `%` et les couleurs déjà unifiées dans `lib/status.ts`).
- Liste des 5 dernières publications échouées avec leur `error_message` (réutilise `EmptyState` si aucune erreur).
- Pas de filtre de période, pas de graphique temporel, pas d'export — explicitement hors scope "basique".

## Requêtes

Toutes scopées par org via le même pattern `videos!inner(org_id)` + `.eq('video.org_id', orgId)` établi précédemment. Comptages via `{ count: 'exact', head: true }` comme dans `dashboard/page.tsx`.

## Auth

`getCurrentUserRow` de `lib/supabase/dev-org.ts`, comme les autres pages.

## Tests

Vitest pour la fonction pure de calcul du taux de succès (division par zéro → 0%, pas `NaN`). Pas de tests de composants.
