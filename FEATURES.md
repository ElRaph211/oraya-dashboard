# Oraya — Nouvelles features implémentées

> Tout ce qui a été ajouté pour rendre le dashboard prêt pour la production.

---

## 🆕 Backend & logique métier

### 1. Relances connectées à Supabase
**Fichier** : `src/lib/queries/relances.ts`

Server functions complètes pour le cycle de vie des relances :
- `getRelances()` — lit toutes les relances du client connecté
- `approveRelance({relanceId})` — valide une relance (draft → approved)
- `cancelRelance({relanceId})` — annule une relance
- `editRelanceQuery({relanceId, email_subject, email_body})` — édite avant envoi
- `sendRelanceNow({relanceId})` — envoie via Resend, met à jour le statut
- `sendApprovedBatch()` — envoie en batch avec jitter anti-rate-limit (~1.4s entre envois)

Toutes les fns utilisent l'auth Supabase + isolation par `client_id`.

### 2. Génération IA des relances
**Fichier** : `src/lib/generate-relance.functions.ts`

- `generateRelance({invoiceId})` — sélectionne le bon template selon l'ancienneté de la créance (J+3 → C3b), appelle Claude Haiku 4.5 via Anthropic API, insère la relance en `draft` dans `relances_queue`
- `generateAllRelances()` — boucle sur toutes les factures en retard sans relance pending, génère 1 relance par débiteur max

**Templates auto-sélectionnés** :
| Jours de retard | Code | Ton |
|---|---|---|
| 0-2 | A1 | Amical |
| 3-14 | A2 | Professionnel courtois |
| 15-29 | A3 | Ferme, pénalités |
| 30-59 | B3 | Annonce escalade |
| 60+ | C3b | Dernier rappel avant contentieux |

### 3. Création/édition manuelle de débiteur
**Fichier** : `src/lib/debtor.functions.ts`

- `createDebtor()` — formulaire complet (nom, contact, SIREN, secteur, stratégique)
- `updateDebtor()` — met à jour contacts, statut stratégique, pause des relances

### 4. Profil & paramètres client
**Fichier** : `src/lib/profile.functions.ts`

- `getMyProfile()` — récupère le profil du client connecté
- `updateMyProfile()` — édite raison sociale, contact, alias email, BCC, négociation autorisée, délai de facturation

### 5. Worker de job queue (classification IA)
**Fichier** : `src/lib/job-worker.functions.ts`

- `processJobQueue({limit})` — traite les jobs `pending` en batch
- Classifie les réponses débiteurs via Claude Haiku 4.5 (9 catégories)
- Met à jour `relances_queue` + `debtors.workflow_status`
- Notifie le client si stratégique ou si catégorie critique
- Alerte Raphaël en cas de litige ou difficulté financière

### 6. Endpoints CRON
**Fichiers** : `src/routes/api/cron/process-queue.ts`, `generate-recap.ts`

- `GET /api/cron/process-queue` — traite la file de jobs (auth `Authorization: Bearer $CRON_SECRET`)
- `GET /api/cron/generate-recap` — envoie le récap hebdo aux clients actifs (KPIs sur 7 jours)

---

## 🆕 Frontend & UX

### 7. Page /relances refondue
**Fichier** : `src/routes/_authenticated/relances.tsx`

Anciennement basée sur un store en mémoire avec données fictives. Maintenant :
- Lecture réelle depuis Supabase via `getRelances`
- Filtres : Toutes / Brouillons / Validées / Envoyées / En échec (avec compteurs)
- Actions par ligne : Aperçu, Éditer, Valider, Envoyer, Annuler
- Modal d'aperçu (HTML rendu)
- Modal d'édition (sujet + corps HTML)
- Bouton "Générer avec IA" — appelle `generateAllRelances`
- Bouton "Envoyer les validées (N)" — batch send avec jitter
- Toast feedback (success / error / info)
- État vide engageant avec CTA "Importer un CSV" + "Générer pour les factures en retard"

### 8. Page /debtors/new
**Fichier** : `src/routes/_authenticated/debtors.new.tsx`

Formulaire complet pour créer un débiteur manuellement (nom, email, contact, SIREN, secteur, marqueur stratégique).

### 9. Page /debtors avec bouton "Nouveau débiteur"
**Fichier** : `src/routes/_authenticated/debtors.index.tsx`

Header amélioré avec lien CTA vers le formulaire de création.

### 10. Page /profile refondue
**Fichier** : `src/routes/_authenticated/profile.tsx`

Anciennement données hardcodées. Maintenant :
- **Bloc Entreprise** : raison sociale, SIREN, contact, téléphone, CA (lié à Supabase)
- **Bloc Configuration email** :
  - Saisie de l'alias (`nom@domaine.fr`) + nom affiché
  - Badge statut domaine (Vérifié / En attente / Non configuré)
  - Bouton "Vérifier le domaine" → API Resend
  - Bouton "Envoyer un email de test" (si domaine vérifié)
  - Instructions DNS si non vérifié
- **Bloc Préférences relances** : BCC, négociation autorisée, délai de facturation

### 11. Dashboard amélioré
**Fichier** : `src/routes/_authenticated/dashboard.tsx`

- Prénom personnalisé tiré de la session (au lieu de "Marc" hardcodé)
- **État vide engageant** : si 0 factures → bannière "Bienvenue sur Oraya" + CTA Import / Création manuelle

### 12. Page 404 personnalisée
**Fichier** : `src/routes/$404.tsx`

Page d'erreur claire avec lien Dashboard + bouton Retour.

---

## 🆕 Emails (Resend)

### 13. Infrastructure Resend complète
**Dossier** : `src/lib/resend/`

```
client.ts                       singleton Resend
send.ts                         wrapper sendEmail() avec pièces jointes
domain.functions.ts             createResendDomain / checkResendDomainStatus / sendTestEmail
emails/
├── send-relance.ts             Email 1 (relance débiteur + BCC auto)
├── send-magic-link.ts          Email 2 (onboarding nouveau client)
├── send-approval-request.ts    Email 3 (validation requise)
├── send-response-notif.ts      Email 4 (réponse débiteur reçue)
├── send-recap.ts               Email 5 (récap hebdo lundi)
├── send-alert-raphael.ts       Email 6 (alertes bounce/litige/erreur)
└── send-payment-plan.ts        Email 7 (plan de paiement + PDF joint)
```

### 14. Webhooks Resend
**Fichiers** : `src/routes/api/webhooks/resend-inbound.ts`, `resend-events.ts`

- **Inbound** (`/api/webhooks/resend-inbound`) : reçoit les réponses débiteurs → enqueue `classify_response` dans `job_queue` (ou stocke dans `unmatched_emails` si débiteur inconnu)
- **Events** (`/api/webhooks/resend-events`) : signature Svix vérifiée, gère `email.bounced` et `email.delivery_delayed`
  - Hard bounce (5xx) → `relances_queue.status = bounced` + `debtors.contact_validated = false` + alerte Raphaël
  - Soft bounce → alerte Raphaël (informatif), Resend réessaie 72h auto

---

## 🆕 Tests

### 15. Suite Playwright complète
**Dossier** : `tests/e2e/`

- `auth.spec.ts` — 11 tests : pages publiques, redirections, validation signup, flux admin
- `client.spec.ts` — 8 tests : dashboard, sidebar, navigation, isolation admin, déconnexion
- `import.spec.ts` — 6 tests : page import, upload CSV, mapping IA, import complet
- `fixtures/sample-invoices.csv` — fixture pour les tests d'import
- `helpers.ts` — helpers `loginAsClient` / `loginAsAdmin`

Scripts npm :
- `npm run test:e2e` — tous les tests
- `npm run test:e2e:auth` / `:client` / `:import` — par fichier
- `npm run test:e2e:ui` — interface graphique
- `npm run test:e2e:headed` — navigateur visible

---

## 🆕 Configuration & déploiement

### 16. Config Cloudflare Workers
**Fichier** : `wrangler.jsonc`

Nom du worker, compatibility flags, observability, secrets list, routes/crons commentés (à activer post-déploiement).

### 17. Documentation déploiement
**Fichier** : `DEPLOYMENT.md`

Guide complet :
- Déploiement Cloudflare Workers (recommandé) ou Vercel
- Configuration secrets via `wrangler secret put`
- Setup DNS pour `dashboard.orayasystem.fr`
- Config Supabase Auth (Site URL, SMTP via Resend)
- Config webhooks Resend (events + inbound)
- Checklist mise en production (14 points)
- Monitoring & rollback

### 18. `.env.example`
Template complet de toutes les variables nécessaires.

### 19. CSRF warning supprimé
**Fichier** : `vite.config.ts`

`disableCsrfMiddlewareWarning: true` — la protection est gérée par Supabase JWT.

---

## ⚙️ Modifications DB requises avant prod

À exécuter dans **Supabase SQL Editor** :

```sql
-- Colonnes Resend pour clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS resend_domain_id text,
  ADD COLUMN IF NOT EXISTS resend_domain_status text
    CHECK (resend_domain_status IN ('pending','verified','failed'));

-- Colonnes job_queue (si manquantes)
ALTER TABLE public.job_queue
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
```

---

## 📋 Variables d'env à configurer en prod

```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL (au build)
VITE_SUPABASE_PUBLISHABLE_KEY (au build)
ANTHROPIC_API_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
CRON_SECRET
```

---

## 🔜 Ce qui reste à faire (post-production)

| Feature | Priorité | Note |
|---|---|---|
| Inbox réelle (connectée à Supabase) | 🟠 | Page `/inbox` utilise encore un store mock |
| Création client par admin (`/admin/clients/new`) | 🟡 | Avec magic link onboarding |
| Génération PDF plan de paiement | 🟡 | `@react-pdf/renderer` à intégrer |
| Intégration Pennylane (sync auto factures) | 🟢 | Voir `Oraya_Annexe_C_Pennylane_v2.docx` |
| Page CGU / DPA (mentions légales) | 🟢 | Liens cassés depuis signup |
| Mode sombre | 🟢 | Toggle dans `/settings` |
| Multi-langue (EN) | 🟢 | i18n |

---

## 📊 État du projet — Production-ready ?

**OUI**, à condition de :
1. Exécuter la migration SQL ci-dessus
2. Remplir toutes les variables d'env en prod
3. Configurer les webhooks Resend (URL + secret)
4. Tester l'envoi d'un email de test depuis `noreply@orayasystem.fr`
5. Activer les cron triggers Cloudflare (ou cron-job.org)
