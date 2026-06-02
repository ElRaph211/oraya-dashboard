# Oraya — Déploiement sur Railway

> Cible : `dashboard.orayasystem.fr` hébergé sur Railway (container Node persistant, $5/mois).

## 1. Pré-requis

- Compte **Railway** (https://railway.app) avec une carte enregistrée
- Compte **Supabase** (projet `jmaathyfyfifpbxclhab` déjà créé)
- Compte **Resend** avec domaine `orayasystem.fr` vérifié
- Clé **Anthropic** (claude-haiku-4-5)
- Domaine `orayasystem.fr` géré dans Cloudflare DNS (ou autre)

---

## 2. Déploiement Railway en 7 étapes

### 2.1 Connexion du repo

1. Pousser le code sur GitHub : `git push origin main`
2. Railway Dashboard → **New Project** → **Deploy from GitHub repo**
3. Sélectionner le repo `oraya_dashboard`
4. Railway détecte automatiquement Node + le `Dockerfile`

### 2.2 Configuration des variables d'environnement

Dans Railway → Service → **Variables**, ajouter toutes les clés listées dans `.env.railway` :

| Variable | Valeur (exemple) | Type |
|---|---|---|
| `SUPABASE_URL` | `https://jmaathyfyfifpbxclhab.supabase.co` | Public |
| `SUPABASE_PUBLISHABLE_KEY` | `eyJ...` (anon key) | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role) | **Secret** |
| `VITE_SUPABASE_URL` | identique à `SUPABASE_URL` | Build-time |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | identique à `SUPABASE_PUBLISHABLE_KEY` | Build-time |
| `VITE_SUPABASE_PROJECT_ID` | `jmaathyfyfifpbxclhab` | Build-time |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | **Secret** |
| `RESEND_API_KEY` | `re_...` | **Secret** |
| `RESEND_WEBHOOK_SECRET` | `whsec_...` | **Secret** |
| `ADMIN_EMAIL` | `raphael@orayasystem.fr` | Public |
| `ADMIN_PASSWORD` | (mot de passe admin) | **Secret** |
| `CRON_SECRET` | `openssl rand -hex 32` | **Secret** |
| `NODE_ENV` | `production` | Public |

⚠️ **Les `VITE_*` sont injectées au build** — toute modification nécessite un re-déploiement.

### 2.3 Configuration du build

Railway lit automatiquement :
- `railway.json` → builder NIXPACKS + healthcheck `/api/health`
- `Dockerfile` → image multi-stage (deps → builder → runner)

Pas de configuration manuelle nécessaire.

### 2.4 Premier déploiement

Le premier `git push` déclenche le build (3-5 min) :
1. Stage `deps` : `npm ci --ignore-scripts`
2. Stage `builder` : `npm run build`
3. Stage `runner` : copie `dist/` + `start-server.mjs` + `node_modules`
4. Démarrage : `node start-server.mjs`
5. Healthcheck `/api/health` → service Active ✅

### 2.5 Domaine custom

Railway → Service → **Settings** → **Networking** → **Custom Domain** :
1. Ajouter `dashboard.orayasystem.fr`
2. Railway donne un enregistrement CNAME à ajouter dans Cloudflare DNS
3. Dans Cloudflare DNS : `CNAME dashboard → <project>.up.railway.app` (DNS only, pas Proxied)
4. SSL Let's Encrypt automatique en 1-2 min

### 2.6 Cron externe (cron-job.org)

Railway n'inclut pas de cron natif. Utiliser **cron-job.org** (gratuit) :

| Job | URL | Schedule | Headers |
|---|---|---|---|
| Process queue | `GET https://dashboard.orayasystem.fr/api/cron/process-queue` | `*/5 * * * *` | `Authorization: Bearer $CRON_SECRET` |
| Recap hebdo | `GET https://dashboard.orayasystem.fr/api/cron/generate-recap` | `30 8 * * 1` | `Authorization: Bearer $CRON_SECRET` |

### 2.7 Webhooks Resend

Resend → **Webhooks** → Add :
- URL : `https://dashboard.orayasystem.fr/api/webhooks/resend-events`
- Events : `email.bounced`, `email.delivery_delayed`
- Copier le **signing secret** → variable Railway `RESEND_WEBHOOK_SECRET`

Resend → **Inbound** → Add :
- Adresse : `relances@orayasystem.fr`
- Webhook : `https://dashboard.orayasystem.fr/api/webhooks/resend-inbound`

---

## 3. Configuration Supabase production

### 3.1 Authentication

Dashboard Supabase → **Authentication → URL Configuration** :
- Site URL : `https://dashboard.orayasystem.fr`
- Redirect URLs : `https://dashboard.orayasystem.fr/**`

### 3.2 SMTP custom via Resend (recommandé)

Pour éviter la limite de 4 emails/h du SMTP gratuit Supabase :

Dashboard Supabase → **Authentication → SMTP Settings** :
- Host : `smtp.resend.com`
- Port : `465`
- User : `resend`
- Pass : `RESEND_API_KEY`
- Sender email : `noreply@orayasystem.fr`
- Sender name : `Oraya`

### 3.3 Migration SQL (à exécuter dans SQL Editor)

```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS resend_domain_id text,
  ADD COLUMN IF NOT EXISTS resend_domain_status text
    CHECK (resend_domain_status IN ('pending','verified','failed'));

ALTER TABLE public.job_queue
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
```

---

## 4. Configuration Resend

Domaine `orayasystem.fr` vérifié (badge vert) avec :
- TXT `@` : SPF (`v=spf1 include:amazonses.com ~all`)
- CNAME `resend._domainkey` : DKIM
- MX `relances.orayasystem.fr` → `inbound-smtp.resend.com` (pour Resend Inbound)

---

## 5. Checklist mise en production

### Code & infra
- [ ] `git push origin main` réussi
- [ ] Build Railway terminé sans erreur
- [ ] Healthcheck `/api/health` répond `200 {ok:true}`
- [ ] Domaine `dashboard.orayasystem.fr` répond via HTTPS
- [ ] CNAME DNS pointe vers Railway

### Données
- [ ] Migration SQL exécutée (Supabase SQL Editor)
- [ ] Compte admin créé (vérifier dans Auth → Users)
- [ ] `auth.users.raphael` → user_roles.role = `admin`

### Email
- [ ] Domaine Resend vérifié (badge vert)
- [ ] Email de test envoyé depuis `noreply@orayasystem.fr` reçu sans spam
- [ ] Webhook Resend Events configuré + signing secret en variable Railway
- [ ] Webhook Resend Inbound configuré
- [ ] Test : envoyer un email à `relances@orayasystem.fr` → ligne créée dans `job_queue` (catch-all si débiteur inconnu : `unmatched_emails`)

### Cron
- [ ] cron-job.org → 2 jobs créés (process-queue + recap)
- [ ] Test manuel : `curl -H "Authorization: Bearer $CRON_SECRET" https://dashboard.orayasystem.fr/api/cron/process-queue`

### Fonctionnel
- [ ] Login admin (`raphael@orayasystem.fr`)
- [ ] Signup nouveau compte → trigger `handle_new_user` crée la ligne `clients`
- [ ] Import CSV → factures dans Supabase
- [ ] Génération IA d'une relance fonctionne
- [ ] Envoi via Resend depuis l'alias du client (test email depuis `/profile`)

---

## 6. Monitoring & debug

### Logs Railway
- Railway Dashboard → Service → **Logs** (temps réel)
- Filtrage par niveau (info / warn / error)

### Logs Supabase
- Supabase Dashboard → **Logs** → API / Database

### Logs Resend
- Resend Dashboard → **Logs** → filtrage par tag (`relance_id`, `template`)

### Diagnostic erreurs IA
- `audit_log` (relances) + `job_queue.error_message` (jobs échoués)

---

## 7. Rollback

Railway garde l'historique des déploiements :
- Railway → Service → **Deployments** → cliquer sur un précédent → **Rollback to this deployment**

---

## 8. Coûts attendus

| Service | Tier | Coût |
|---|---|---|
| Railway (Hobby) | 1 service, 512 MB RAM | $5/mois |
| Supabase (Free) | 500 MB DB, 2 GB bandwidth | Gratuit |
| Resend (Free) | 3 000 emails/mois | Gratuit |
| Anthropic | Pay-as-you-go (Claude Haiku 4.5) | ~$0.25/1M tokens → quelques €/mois |
| cron-job.org | Free tier | Gratuit |
| Cloudflare DNS | Free tier | Gratuit |
| **Total estimé** | | **~$10/mois** |

Passer à Railway Pro ($20/mois) si > 50 clients actifs (plus de RAM + scaling auto).
