# Rattraper la concurrence — Feuille de route (Phase 1 détaillée, Phases 2-4 cadrées)

> Ce document séquence 4 sous-projets. Seule la **Phase 1** est détaillée au niveau implémentation dans ce spec — les Phases 2, 3 et 4 sont cadrées (objectif, décisions clés, critère de sortie) mais devront chacune repasser par un brainstorm dédié avant leur plan d'implémentation, au moment où elles deviennent la priorité active. Auth explicitement hors scope de toute cette feuille de route (décision déjà actée : "on va travailler sur l'auth plus tard").

## Contexte

Trois recherches menées le 2026-08-31/09-01 ont établi :

1. **TikTok** : l'app non-auditée est plafonnée à 5 comptes/24h en `SELF_ONLY` (privé), plateforme entière. L'audit "Direct Post" (posting public) prend réalistement 4 à 8 semaines, avec au moins un cycle de rejet comme cas normal (preuve : deux rejets documentés sur un outil open-source équivalent, avril et mai 2026, tous deux liés à des manques UX précis). Le "2-3 jours" du CLAUDE.md était erroné (déjà corrigé dans le CLAUDE.md).
2. **YouTube** : "1 projet GCP par chaîne" (actuellement dans le CLAUDE.md) n'est pas une contrainte technique — le quota (10 000 units/jour) est mutualisé par projet, pas par chaîne. Ce choix impose une vérification OAuth "sensitive scope" et potentiellement une demande d'augmentation de quota à répéter par client, un coût d'ingénierie récurrent non chiffré dans le pricing actuel.
3. **Concurrence "faceless channel"** (Faceless.so, AITuber, AICUT, FlowShorts) : 3 des 4 publient déjà automatiquement sur TikTok/YouTube/Instagram — le wedge actuel de Klip existe déjà chez eux. Leur couche IA (script/voix/vidéo) est assemblée à partir de vendors commodités (GPT, ElevenLabs, Veo/Sora), donc rattrapable. Le seul actif que personne n'a visiblement résolu : le vrai multi-tenant agence (sous-comptes clients, permissions, white-label, facturation par client).
4. **Pricing** : Starter (49€) et Agency (149€) sont nettement plus chers que Buffer/Publer/Metricool pour un volume de comptes équivalent. Le tier White-label (499€, illimité) n'a aucun garde-fou de coût une fois les features IA ajoutées (ElevenLabs + FFmpeg scalent linéairement avec l'usage).

## Objectif de la feuille de route

Rattraper la concurrence en construisant l'avantage défendable (multi-tenant agence) avant de rattraper la parité facilement copiable (génération IA), tout en débloquant d'abord les deux plateformes de publication qui conditionnent tout le reste.

## Séquencement retenu

```
Phase 1 : Déblocage TikTok/YouTube  (prérequis technique)
    ↓
Phase 2 : Correction du pricing      (rapide, ne dépend de rien d'autre)
    ↓
Phase 3 : Multi-tenant agence        (le fossé défendable)
    ↓
Phase 4 : Parité IA (script/voix/vidéo)
```

Alternative écartée : parité IA avant multi-tenant (approche B) — écartée parce que la couche IA des concurrents est déjà commoditisée et rattrapable à tout moment, alors que le multi-tenant agence est le seul terrain où Klip peut prendre une avance qui ne se referme pas vite. Alternative écartée : parallèle/interleaved (approche C) — écartée pour un développeur solo, le coût de context-switching entre deux fronts dépasse le bénéfice de couverture du risque.

---

## Phase 1 — Déblocage TikTok/YouTube (détaillé)

### YouTube : architecture GCP

**Décision** : abandonner le provisioning "1 projet GCP par chaîne YouTube". Un seul projet GCP (ou un petit pool si un jour un vrai palier de charge l'exige) sert toutes les chaînes clientes. L'isolation entre clients ne passe plus par une séparation Google Cloud mais par du rate-limiting applicatif :

```
lib/youtube/
  quota.ts   — nouveau : compteur d'usage YouTube par org_id (units consommées / jour),
               s'appuie sur une nouvelle table `youtube_quota_usage (org_id, date, units_used)`
               ou un compteur Redis (Upstash) à clé `youtube:{org_id}:{date}`, incrémenté après
               chaque upload réussi (~1600 units), lu avant d'accepter un nouveau job d'upload
```

- Vérification OAuth "sensitive scope" (`youtube.upload`) faite une seule fois sur ce projet partagé, pas par client.
- Demande d'augmentation de quota anticipée une fois qu'il y a de la vraie donnée d'usage agrégée (pas par client).
- Le CLAUDE.md doit être corrigé : retirer "1 projet Google Cloud par chaîne YouTube (quota API)" de la section Règles Importantes, remplacer par la règle de rate-limiting applicatif ci-dessus.

### TikTok : préparation de l'audit

**Décision** : traiter la restriction actuelle comme totalement bloquante pour la vente — pas d'onboarding de clients payants sur la publication TikTok tant que l'audit n'est pas soumis et suivi. Construire dès maintenant, avant la soumission, les éléments UX que l'audit vérifie (trouvés dans deux rejets réels documentés) :

```
components/dashboard/
  TikTokComposer.tsx (ou équivalent existant) — doit afficher :
    - nom/avatar du créateur connecté (via creator_info API)
    - menu déroulant privacy_level SANS valeur par défaut sélectionnée par l'app
    - toggles duet/stitch/commentaires décochés par défaut (opt-in utilisateur)
    - toggle "Branded Content" (Votre marque / Contenu de marque)
    - application réelle de max_video_post_duration_sec (retourné par l'API) dans l'UI
    - étape de confirmation explicite juste avant le bouton de publication
    - affichage du statut de publication après envoi (pas de fire-and-forget)
```

- Une fois ces éléments en place : enregistrer la vidéo de démo du flow complet (login → consentement → composer → publication → statut), soumettre l'audit.
- `privacy_level` reste forcé à `SELF_ONLY` (déjà en place, `TIKTOK_POST_PRIVACY_LEVEL` dans `lib/tiktok/publish.ts`) tant que l'audit n'a pas été approuvé — ce n'est pas un blocage de développement, seulement de mise en production commerciale.

### Multi-tenant / sécurité

Le compteur de quota YouTube est scopé par `org_id`, cohérent avec le pattern déjà établi ailleurs dans le projet (toujours filtrer par `org_id`).

### Hors scope (Phase 1)

- Toute automatisation qui suppose l'audit déjà approuvé (rien à construire "en attendant" — pas de mode dégradé spécial, le SELF_ONLY existant suffit pour les tests).
- Le vrai déclenchement de la demande d'augmentation de quota Google (dépend de données d'usage réelles futures, non actionnable maintenant).

### Critère de sortie

- Audit TikTok soumis (soumission, pas nécessairement approbation — hors du contrôle de Klip, 4-8 semaines).
- Architecture YouTube consolidée sur projet(s) partagé(s) avec compteur de quota par org fonctionnel et testé.
- CLAUDE.md mis à jour (règle "1 projet par chaîne" retirée, remplacée).

---

## Phase 2 — Correction du pricing (cadrée)

**Objectif** : réaligner Starter/Agency vers le marché (recherche : nettement plus chers que Buffer/Publer/Metricool à volume de comptes égal) tout en gardant la marge confirmée par l'analyse de coûts infra Phase 1 (R2/Upstash/Railway sont bon marché).

**Décision clé** : poser dès cette phase un compteur d'usage par organisation dans le schéma (table ou colonnes dédiées), même non branché à une feature IA — pour que le futur tier IA (Phase 4) s'appuie sur un vrai mécanisme de cap/overage au lieu du "illimité" actuel sans garde-fou.

**Critère de sortie** : nouveaux tarifs publiés (landing page + doc), table/compteur d'usage en place dans le schéma Supabase.

**À détailler avant implémentation** : les nouveaux montants exacts par tier (nécessite un brainstorm dédié comparant marge cible vs. positionnement marché), la structure exacte du compteur d'usage (une table générique `usage_counters` vs. des colonnes dédiées par métrique).

---

## Phase 3 — Multi-tenant agence (cadrée)

**Objectif** : construire le fossé défendable — ce qu'aucun concurrent "faceless" ne semble avoir, parce qu'ils visent des créateurs solo.

**Composants identifiés** :
- Table `clients` imbriquée entre `organizations` et `social_accounts`/`videos` (aujourd'hui à plat sous l'org).
- Rôle "client" à accès restreint (voit/approuve seulement son propre client), en plus de l'admin agence existant.
- Workflow d'approbation : un contact client valide/rejette un post programmé avant publication.
- Marque blanche : logo/couleurs par agence (déjà listé Phase 3 du CLAUDE.md, avancé dans le temps) ; domaine personnalisé en option plus tardive.
- Reporting/facturation par client pour l'agence.

**Critère de sortie** : une agence crée 2+ clients distincts, invite un contact client à accès restreint, ce contact peut approuver un post avant publication.

**À détailler avant implémentation** : schéma exact de `clients` et des permissions (RLS Supabase), UX du workflow d'approbation, modèle d'invitation d'un contact client (email + lien, ou compte complet ?).

---

## Phase 4 — Parité IA script/voix/vidéo (cadrée)

**Objectif** : reprend le Phase 2 du CLAUDE.md (GPT-4 script, ElevenLabs voix, assemblage FFmpeg) tel quel, replanifié après le fossé multi-tenant.

**Décision clé** : brancher dès la construction le compteur d'usage posé en Phase 2 (tokens GPT / minutes ElevenLabs / temps de calcul FFmpeg par org), pour que le tier White-label illimité ait un vrai garde-fou de coût dès le lancement de cette feature.

**Critère de sortie** : génération script+voix+vidéo fonctionnelle, usage tracké par org, cap ou alerte de dépassement configurable.

**À détailler avant implémentation** : choix du modèle GPT (GPT-4.1 recommandé par la recherche, ~15x moins cher que "GPT-4" nommé dans le CLAUDE.md pour un usage de scripting, sans perte de qualité attendue), architecture d'assemblage FFmpeg (serverless vs. worker Railway dédié — coût réel non chiffré, à benchmarker).

---

## Hors scope (toute la feuille de route)

- Authentification (Supabase Auth email + magic link) — décision déjà actée, traitée séparément.
- Exécution réelle contre TikTok/Redis/GCP avec de vrais identifiants — reste bloqué sur l'obtention de credentials externes réels, comme le reste du projet.
- Les montants de pricing exacts, le schéma détaillé du multi-tenant, et l'architecture d'assemblage vidéo — chacun nécessite son propre brainstorm au moment où sa phase devient active (cf. "À détailler avant implémentation" ci-dessus).
