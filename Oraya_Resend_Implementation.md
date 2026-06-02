# Oraya — Spécification Implémentation Emails (Resend)

> **Version** : 1.0 — Mai 2026  
> **Stack** : Resend API + Resend Inbound + Next.js 15 App Router  
> **Statut** : Prêt pour développement  

---

## Vue d'ensemble

Oraya utilise **Resend exclusivement** pour l'ensemble du workflow email. Pas de SMTP client. Pas de nodemailer. Pas de n8n.

```
Resend API     → Envoi de tous les emails sortants (relances + notifications + récaps)
Resend Inbound → Réception des réponses des débiteurs via webhook
Resend Webhooks → Détection des bounces et événements de livraison
```

**Une seule clé API** : `RESEND_API_KEY` côté serveur uniquement, jamais exposée au client.

---

## Architecture des domaines

```
orayasystem.fr          ← domaine Oraya (vérifié dans Resend)
  alerts@orayasystem.fr    → alertes système vers Raphaël
  relances@orayasystem.fr  → adresse inbound (réponses débiteurs arrivent ici)
  noreply@orayasystem.fr   → magic links, notifications système

nexus-conseil.fr        ← domaine Thomas (vérifié dans Resend par Thomas)
  lea.moreau@nexus-conseil.fr → from des relances (alias Thomas)
```

**Principe** : les relances partent depuis l'alias de Thomas (`from`), avec un `reply_to` qui pointe vers `relances@orayasystem.fr`. Le débiteur répond → l'email arrive sur l'adresse Oraya → webhook traite la réponse.

---

## Objectif 1 — Configuration Resend

**Critère de succès** : envoyer un email depuis `lea@nexus-conseil.fr` via l'API Resend et le recevoir sans qu'il parte en spam.

### 1.1 Vérifier le domaine Oraya (une seule fois)

Dans le dashboard Resend → Domains → Add Domain → `orayasystem.fr`

Resend génère ces enregistrements DNS à ajouter dans Cloudflare :

| Type | Nom | Valeur |
|------|-----|--------|
| TXT | `@` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `resend._domainkey` | `resend._domainkey.resend.com` |
| MX | `relances` | `inbound-smtp.resend.com` (priorité 10) |

> Le MX sur `relances` est requis pour que Resend Inbound reçoive les emails sur `relances@orayasystem.fr`.

**Vérification** : le badge passe au vert dans le dashboard Resend. Tester avec :
```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@orayasystem.fr","to":"raphael@orayasystem.fr","subject":"Test","html":"OK"}'
# Résultat attendu : {"id":"..."} — email reçu dans la boîte de Raphaël
```

---

### 1.2 Vérifier le domaine d'un client Thomas (par client)

Thomas doit ajouter les enregistrements DNS de son domaine. Ce processus se déclenche pendant l'étape 3 de l'onboarding (configuration alias email).

**Étapes côté dashboard Oraya** :

1. Raphaël saisit l'alias voulu : `lea.moreau@nexus-conseil.fr`
2. Le dashboard appelle `resend.domains.create({ name: 'nexus-conseil.fr' })`
3. Resend retourne les enregistrements DNS à ajouter
4. Le dashboard affiche une interface guidée (voir Objectif 5)
5. Thomas ajoute les enregistrements dans son DNS (OVH / Cloudflare / Google Domains)
6. Le dashboard poll `resend.domains.get(domainId)` toutes les 30s jusqu'au statut `verified`
7. Quand vérifié → `clients.onboarding_status = 'ready_to_launch'`

**Stocker dans Supabase** :
```sql
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS resend_domain_id text,
ADD COLUMN IF NOT EXISTS resend_domain_status text 
  CHECK (resend_domain_status IN ('pending','verified','failed'));
```

**Critère de succès** : badge vert dans Resend pour le domaine du client + email de test envoyé depuis l'alias reçu sans spam.

---

### 1.3 Client lib Resend

```typescript
// lib/resend/client.ts
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY manquante')
}

export const resend = new Resend(process.env.RESEND_API_KEY)
```

```typescript
// lib/resend/send.ts
// Fonction wrapper unique pour tous les envois
import { resend } from './client'

interface SendEmailParams {
  from: string        // 'Léa Moreau <lea@nexus.fr>' ou 'Oraya <noreply@orayasystem.fr>'
  to: string          // email du destinataire
  replyTo?: string    // toujours 'relances@orayasystem.fr' pour les relances débiteurs
  subject: string
  html: string
  bcc?: string        // email Thomas si bcc_enabled = true
  tags?: { name: string; value: string }[]  // pour les analytics Resend
}

export async function sendEmail(params: SendEmailParams) {
  const { data, error } = await resend.emails.send({
    from:     params.from,
    to:       params.to,
    reply_to: params.replyTo,
    subject:  params.subject,
    html:     params.html,
    bcc:      params.bcc ? [params.bcc] : undefined,
    tags:     params.tags,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
  return data // { id: 'resend_email_id' }
}
```

---

## Objectif 2 — Les 8 types d'emails

**Critère de succès global** : chaque type d'email a une fonction dédiée dans `lib/resend/emails/`, un template HTML dans `lib/resend/templates/`, et un test manuel validé.

---

### Email 1 — Relance débiteur (A1 à C3b, D1, E1)

**Déclencheur** : Job `send_relance` dans `job_queue`  
**From** : alias Thomas — `"Léa Moreau <lea.moreau@nexus-conseil.fr>"`  
**To** : `debtors.contact_email`  
**Reply-To** : `relances@orayasystem.fr`  
**BCC** : `clients.contact_email` si `bcc_enabled = true`  

```typescript
// lib/resend/emails/send-relance.ts
import { sendEmail } from '../send'

export async function sendRelanceEmail(params: {
  debtorEmail: string
  fromAlias: string        // 'Léa Moreau <lea@nexus.fr>'
  fromAliasName: string    // 'Léa Moreau'
  subject: string          // généré par GPT-4o
  body: string             // généré par GPT-4o (HTML)
  clientBccEmail?: string  // si bcc_enabled
  templateCode: string     // 'A1', 'B2', etc.
  relanceId: string        // pour les tags Resend
}) {
  return sendEmail({
    from:    params.fromAlias,
    to:      params.debtorEmail,
    replyTo: 'relances@orayasystem.fr',
    subject: params.subject,
    html:    wrapInEmailLayout(params.body, params.fromAliasName),
    bcc:     params.clientBccEmail,
    tags: [
      { name: 'type',       value: 'relance' },
      { name: 'template',   value: params.templateCode },
      { name: 'relance_id', value: params.relanceId },
    ],
  })
}

// Layout HTML commun : signature + mentions légales
function wrapInEmailLayout(body: string, senderName: string): string {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
    <body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">
      <div style="max-width:600px;margin:0 auto;padding:24px">
        ${body}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        <p style="font-size:12px;color:#666">
          ${senderName}<br>
          <em>Ce message est envoyé par le service de recouvrement Oraya pour le compte de votre créancier.</em>
        </p>
      </div>
    </body>
    </html>
  `
}
```

**Tags Resend** : permettent de filtrer les stats par template dans le dashboard Resend. Cruciale pour mesurer l'efficacité de chaque séquence.

---

### Email 2 — Magic Link onboarding (nouveau client)

**Déclencheur** : Raphaël clique "Créer le client" dans `/admin/clients/new`  
**From** : `"Oraya <noreply@orayasystem.fr>"`  
**To** : `clients.contact_email`  
**Reply-To** : `raphael@orayasystem.fr`  

**Contenu** :
```
Objet : Votre accès au dashboard Oraya — [company_name]

Bonjour [contact_name],

Raphaël Aubry vous a créé un espace sur le dashboard Oraya.

Cliquez sur ce lien pour accéder à votre espace et finaliser votre configuration :

[BOUTON] Accéder à mon espace

Ce lien est valable 24 heures.

Si vous n'avez pas demandé cet accès, ignorez ce message.

Cordialement,
Raphaël Aubry — Oraya System
```

```typescript
// lib/resend/emails/send-magic-link.ts
export async function sendMagicLinkEmail(params: {
  to: string
  contactName: string
  companyName: string
  magicLink: string  // généré par supabase.auth.admin.generateLink()
}) {
  return sendEmail({
    from:    'Oraya <noreply@orayasystem.fr>',
    to:      params.to,
    replyTo: 'raphael@orayasystem.fr',
    subject: `Votre accès au dashboard Oraya — ${params.companyName}`,
    html: `
      <h2 style="color:#122B4E">Bienvenue sur Oraya, ${params.contactName}</h2>
      <p>Raphaël Aubry vous a créé un espace pour gérer votre recouvrement.</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${params.magicLink}" 
           style="background:#3B7CD3;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Accéder à mon espace
        </a>
      </p>
      <p style="color:#666;font-size:12px">Ce lien est valable 24 heures.</p>
    `,
    tags: [{ name: 'type', value: 'magic_link' }],
  })
}
```

---

### Email 3 — Notification Thomas "relance à valider"

**Déclencheur** : Job `send_relance` — débiteur `is_strategic = true`  
**From** : `"Oraya <noreply@orayasystem.fr>"`  
**To** : `clients.contact_email`  

**Contenu** :
```
Objet : ✅ Action requise — Relance à valider pour [debtor_name]

Bonjour [contact_name],

Une relance est prête à être envoyée à [debtor_name] et attend votre validation.

Montant en jeu   : [amount_outstanding] €
Template         : [template_code] — [template_label]
Objet de l'email : [email_subject]

Vous avez 24 heures ouvrées pour valider. Sans réponse, l'email sera envoyé automatiquement.

[BOUTON] Voir et valider la relance

Cordialement,
Oraya System
```

```typescript
// lib/resend/emails/send-approval-request.ts
export async function sendApprovalRequestEmail(params: {
  to: string
  contactName: string
  debtorName: string
  amountOutstanding: number
  templateCode: string
  emailSubject: string
  relanceId: string
  dashboardUrl: string  // https://dashboard.orayasystem.fr/relances?id=[relanceId]
}) {
  const templateLabels: Record<string, string> = {
    'A3': 'Relance ferme', 'B3': 'Annonce escalade',
    'C3a': 'Dernier rappel', 'C3b': 'Dernier rappel avant contentieux',
    'D1': 'Proposition échéancier',
  }

  return sendEmail({
    from:    'Oraya <noreply@orayasystem.fr>',
    to:      params.to,
    subject: `✅ Action requise — Relance à valider pour ${params.debtorName}`,
    html: `
      <h2 style="color:#122B4E">Relance en attente de validation</h2>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Débiteur</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold">${params.debtorName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Montant</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;color:#B91C1C">
              ${params.amountOutstanding.toLocaleString('fr-FR', {style:'currency',currency:'EUR'})}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Type</td>
            <td style="padding:8px;border:1px solid #e0e0e0">${params.templateCode} — ${templateLabels[params.templateCode] ?? ''}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Objet email</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-style:italic">${params.emailSubject}</td></tr>
      </table>
      <p style="color:#B45309;font-size:13px">⏰ Sans action de votre part dans les 24h ouvrées, l'email sera envoyé automatiquement.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${params.dashboardUrl}" 
           style="background:#3B7CD3;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
          Voir et valider la relance
        </a>
      </p>
    `,
    tags: [{ name: 'type', value: 'approval_request' }, { name: 'relance_id', value: params.relanceId }],
  })
}
```

---

### Email 4 — Notification Thomas "réponse reçue d'un débiteur"

**Déclencheur** : Job `classify_response` — après classification GPT-4o  
**From** : `"Oraya <noreply@orayasystem.fr>"`  
**To** : `clients.contact_email`  
**Condition** : envoyer uniquement si `debtors.is_strategic = true` OU si la catégorie est critique (contestation, difficulte_financiere)  

**Contenu** :
```
Objet : 💬 [debtor_name] a répondu — [category_label]

Bonjour [contact_name],

[debtor_name] a répondu à votre relance.

Catégorie détectée : [category_label]
Résumé            : [response_summary]

[SI promesse_datee]
→ Date de paiement promise : [extracted_date]
  Une vérification automatique est programmée à cette date.

[SI contestation_litige]
→ Les relances sont suspendues. Votre action est requise.

[SI difficulte_financiere]
→ Un échéancier peut être proposé. Raphaël prépare une proposition.

[BOUTON] Voir le dossier complet

Cordialement,
Oraya System
```

```typescript
// lib/resend/emails/send-response-notification.ts
const CATEGORY_LABELS: Record<string, string> = {
  promesse_datee:         '📅 Promesse de paiement datée',
  promesse_vague:         '🤝 Promesse sans date précise',
  paiement_annonce:       '💸 Virement annoncé',
  contestation_litige:    '⚠️ Contestation / Litige',
  demande_document:       '📄 Demande de document',
  absence_automatique:    '🏖️ Message d\'absence',
  difficulte_financiere:  '🔴 Difficultés financières',
  silence:                '🔇 Silence',
  a_classifier_manuellement: '❓ Classification manuelle requise',
}

const SHOULD_NOTIFY_THOMAS = (category: string, isStrategic: boolean): boolean => {
  const alwaysNotify = ['contestation_litige', 'difficulte_financiere', 'promesse_datee']
  return isStrategic || alwaysNotify.includes(category)
}
```

---

### Email 5 — Récap hebdomadaire Thomas (lundi 8h30)

**Déclencheur** : Cron lundi 8h30 → job `send_recap` dans `job_queue`  
**From** : `"Oraya <noreply@orayasystem.fr>"`  
**To** : `clients.contact_email`  

**Structure du récap (généré par GPT-4o)** :
```
Objet : 📊 Votre récap Oraya — Semaine du [date]

1. CE QUI S'EST PASSÉ CETTE SEMAINE
   [X] relances envoyées / [Y] réponses reçues / [Z] paiements détectés

2. À SURVEILLER
   - [debtor_name] : promesse du [date] — vérification prévue
   - [debtor_name] : sans réponse depuis [X] relances

3. PRÉVISIONS
   J+30 : [montant] €  |  J+60 : [montant] €  |  J+90 : [montant] €

4. DÉCISIONS REQUISES (si applicable)
   - [debtor_name] : relance en attente de validation
```

```typescript
// lib/resend/emails/send-recap.ts
// Le HTML est généré par GPT-4o (lib/openai/generate-recap.ts)
// puis injecté dans le layout standard

export async function sendRecapEmail(params: {
  to: string
  contactName: string
  weekStartDate: string
  htmlContent: string  // généré par GPT-4o
}) {
  return sendEmail({
    from:    'Oraya <noreply@orayasystem.fr>',
    to:      params.to,
    subject: `📊 Votre récap Oraya — Semaine du ${params.weekStartDate}`,
    html:    params.htmlContent,
    tags:    [{ name: 'type', value: 'recap_hebdo' }],
  })
}
```

---

### Email 6 — Alerte Raphaël (contestation, échec job, bounce)

**Déclencheur** : Multiple — classification `contestation_litige`, job `failed` après 3 tentatives, bounce détecté  
**From** : `"Oraya Alerts <alerts@orayasystem.fr>"`  
**To** : `raphael@orayasystem.fr`  

```typescript
// lib/resend/emails/send-alert-raphael.ts

type AlertType =
  | 'contestation_litige'
  | 'difficulte_financiere'
  | 'job_failed'
  | 'bounce_hard'
  | 'bounce_soft_max'
  | 'pending_classifications_queue'

const ALERT_CONFIG: Record<AlertType, { emoji: string; title: string; urgency: 'high' | 'medium' }> = {
  contestation_litige:          { emoji: '⚠️', title: 'Litige déclaré',                urgency: 'high' },
  difficulte_financiere:        { emoji: '🔴', title: 'Difficultés financières',         urgency: 'high' },
  job_failed:                   { emoji: '❌', title: 'Erreur technique',                urgency: 'medium' },
  bounce_hard:                  { emoji: '📧', title: 'Email invalide (bounce)',          urgency: 'medium' },
  bounce_soft_max:              { emoji: '📧', title: 'Email temporairement injoignable', urgency: 'medium' },
  pending_classifications_queue:{ emoji: '❓', title: 'Classifications manuelles en attente', urgency: 'medium' },
}

export async function sendAlertRaphael(params: {
  type: AlertType
  clientId: string
  clientName: string
  debtorName?: string
  details: string
  actionUrl: string
}) {
  const config = ALERT_CONFIG[params.type]
  const urgencyColor = config.urgency === 'high' ? '#B91C1C' : '#B45309'

  return sendEmail({
    from:    'Oraya Alerts <alerts@orayasystem.fr>',
    to:      'raphael@orayasystem.fr',
    subject: `${config.emoji} [ORAYA] ${config.title} — ${params.debtorName ?? params.clientName}`,
    html: `
      <div style="border-left:4px solid ${urgencyColor};padding:0 16px;margin:16px 0">
        <h2 style="color:${urgencyColor}">${config.emoji} ${config.title}</h2>
      </div>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666;width:140px">Client</td>
            <td style="padding:8px;border:1px solid #e0e0e0">${params.clientName}</td></tr>
        ${params.debtorName ? `
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Débiteur</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold">${params.debtorName}</td></tr>` : ''}
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Détails</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-family:monospace;font-size:12px">${params.details}</td></tr>
      </table>
      <p style="text-align:center;margin:24px 0">
        <a href="${params.actionUrl}"
           style="background:#122B4E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
          Voir dans le dashboard
        </a>
      </p>
    `,
    tags: [{ name: 'type', value: 'alert' }, { name: 'alert_type', value: params.type }],
  })
}
```

---

### Email 7 — Plan de paiement + PDF joint

**Déclencheur** : `thomas_validated = true` sur un `payment_plan` → job `send_payment_plan_confirmation`  
**From** : alias Thomas  
**To** : `debtors.contact_email`  
**Reply-To** : `relances@orayasystem.fr`  
**Pièce jointe** : PDF de l'accord de règlement (généré par `@react-pdf/renderer`, stocké dans Supabase Storage)  

**Contenu** :
```
Objet : Confirmation de votre accord de règlement — Facture(s) [references]

Bonjour [contact_name],

Suite à nos échanges, nous vous confirmons l'accord de règlement amiable 
pour la créance de [total_amount] €.

Montant total    : [total_amount] €
Nombre d'échéances : [installment_count]
Première échéance : [first_due_date] — [first_amount] €

Vous trouverez en pièce jointe le document récapitulatif de cet accord.

Merci de régler chaque échéance à la date convenue.

Cordialement, [fromAliasName]
```

```typescript
// lib/resend/emails/send-payment-plan.ts
export async function sendPaymentPlanEmail(params: {
  debtorEmail: string
  fromAlias: string
  fromAliasName: string
  contactName: string
  totalAmount: number
  installments: { dueDate: string; amount: number }[]
  pdfBuffer: Buffer      // généré par @react-pdf/renderer
  pdfFilename: string    // 'accord-reglement-2024-01.pdf'
}) {
  const formatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  const first = params.installments[0]

  return sendEmail({
    from:    params.fromAlias,
    to:      params.debtorEmail,
    replyTo: 'relances@orayasystem.fr',
    subject: `Confirmation de votre accord de règlement`,
    html: `
      <h2 style="color:#122B4E">Accord de règlement confirmé</h2>
      <p>Bonjour ${params.contactName},</p>
      <p>Nous vous confirmons l'accord de règlement pour la créance de 
         <strong>${formatter.format(params.totalAmount)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Montant total</td>
            <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold">${formatter.format(params.totalAmount)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Nombre d'échéances</td>
            <td style="padding:8px;border:1px solid #e0e0e0">${params.installments.length}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0;color:#666">Première échéance</td>
            <td style="padding:8px;border:1px solid #e0e0e0">${first.dueDate} — ${formatter.format(first.amount)}</td></tr>
      </table>
      <p>Vous trouverez en pièce jointe le document récapitulatif. Merci de régler chaque échéance à la date convenue.</p>
    `,
    // Note : Resend supporte les pièces jointes via content (base64)
    // À ajouter dans la fonction sendEmail si besoin
    tags: [{ name: 'type', value: 'payment_plan' }],
  })
}
```

> **Note** : pour les pièces jointes, Resend accepte `attachments: [{ filename, content: base64 }]` dans le payload. Ajouter ce paramètre à la fonction `sendEmail` générique.

---

### Email 8 — BCC Thomas après envoi relance

**Déclencheur** : fin du job `send_relance` si `clients.bcc_enabled = true`  
**Ce n'est pas un email séparé** — c'est le champ `bcc` de l'Email 1.  

```typescript
// Dans send-relance.ts — géré automatiquement
bcc: client.bcc_enabled ? client.contact_email : undefined
```

**Pas de template séparé nécessaire.** Thomas reçoit une copie exacte de ce qui a été envoyé au débiteur avec la mention BCC dans son client mail.

---

## Objectif 3 — Resend Inbound (réception des réponses)

**Critère de succès** : quand un débiteur répond à une relance, un job `classify_response` est créé dans `job_queue` en moins de 30 secondes.

### 3.1 Configuration dans Resend

Dans le dashboard Resend → Inbound → Add Webhook :

| Champ | Valeur |
|-------|--------|
| Domain | `orayasystem.fr` |
| Catch-all address | `relances@orayasystem.fr` |
| Webhook URL | `https://dashboard.orayasystem.fr/api/webhooks/resend-inbound` |

Le MX record `relances.orayasystem.fr → inbound-smtp.resend.com` (ajouté en Objectif 1) est requis.

### 3.2 Endpoint webhook

```typescript
// app/api/webhooks/resend-inbound/route.ts
import { createServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'

export async function POST(req: Request) {
  // 1. Vérifier la signature Resend (HMAC-SHA256)
  const signature = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature')
  const body = await req.text()

  // Si Resend signe ses webhooks inbound, vérifier ici
  // Sinon : accepter uniquement depuis les IPs Resend (liste publique)

  const payload = JSON.parse(body)
  // Payload Resend Inbound : { from, to, subject, html, text, headers, ... }

  const supabase = createServiceClient()

  // 2. Identifier le débiteur depuis l'adresse expéditrice
  const senderEmail = payload.from?.match(/<(.+)>/)?.[1] ?? payload.from

  const { data: debtor } = await supabase
    .from('debtors')
    .select('id, client_id, company_name')
    .eq('contact_email', senderEmail)
    .is('deleted_at', null)
    .order('last_relance_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!debtor) {
    // Email non reconnu → stocker pour traitement manuel
    await supabase.from('unmatched_emails').insert({
      email_from:    senderEmail,
      email_subject: payload.subject,
      email_body:    payload.text ?? payload.html,
      received_at:   new Date().toISOString(),
    })
    return Response.json({ ok: true, status: 'unmatched' })
  }

  // 3. Enqueue la classification GPT-4o
  await supabase.from('job_queue').insert({
    debtor_id: debtor.id,
    client_id: debtor.client_id,
    job_type:  'classify_response',
    status:    'pending',
    payload: {
      email_from:    senderEmail,
      email_subject: payload.subject,
      email_body:    payload.text ?? payload.html,
    },
  })

  // 4. Répondre immédiatement (Resend attend < 5s sinon retry)
  return Response.json({ ok: true, status: 'queued' })
}
```

---

## Objectif 4 — Gestion des bounces

**Critère de succès** : tout bounce met à jour `relances_queue.status`, alerte Raphaël avec le bon message, et empêche les futurs envois sur cette adresse.

### 4.1 Configuration webhook bounces

Dans Resend → Webhooks → Add Webhook :

| Champ | Valeur |
|-------|--------|
| Webhook URL | `https://dashboard.orayasystem.fr/api/webhooks/resend-events` |
| Events | `email.bounced`, `email.delivery_delayed` |

### 4.2 Endpoint webhook événements

```typescript
// app/api/webhooks/resend-events/route.ts
import { Webhook } from 'svix'  // Resend utilise Svix pour signer les webhooks

export async function POST(req: Request) {
  // 1. Vérifier la signature Svix
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  const svix = new Webhook(webhookSecret!)
  const body = await req.text()
  const headers = {
    'svix-id':        req.headers.get('svix-id')!,
    'svix-timestamp': req.headers.get('svix-timestamp')!,
    'svix-signature': req.headers.get('svix-signature')!,
  }

  let event: ResendWebhookEvent
  try {
    event = svix.verify(body, headers) as ResendWebhookEvent
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = createServiceClient()

  switch (event.type) {

    case 'email.bounced': {
      const tags = event.data.tags ?? []
      const relanceId = tags.find(t => t.name === 'relance_id')?.value

      // Déterminer le type de bounce depuis le code SMTP
      const bounceCode = event.data.bounce?.code ?? ''
      const isHardBounce = ['550','551','552','553','554'].some(c => bounceCode.startsWith(c))

      if (relanceId) {
        await supabase
          .from('relances_queue')
          .update({ status: 'bounced' })
          .eq('id', relanceId)

        // Récupérer le contexte pour l'alerte
        const { data: relance } = await supabase
          .from('relances_queue')
          .select('debtor_id, client_id, email_to, debtors(company_name), clients(contact_name)')
          .eq('id', relanceId)
          .single()

        if (relance) {
          if (isHardBounce) {
            // Hard bounce : adresse invalide définitivement
            await supabase
              .from('debtors')
              .update({ contact_validated: false })
              .eq('id', relance.debtor_id)

            await sendAlertRaphael({
              type: 'bounce_hard',
              clientId: relance.client_id,
              clientName: (relance.clients as any).contact_name,
              debtorName: (relance.debtors as any).company_name,
              details: `L'adresse ${relance.email_to} n'existe pas ou a été désactivée (code ${bounceCode}). Les relances vers ce débiteur sont suspendues jusqu'à correction.`,
              actionUrl: `https://dashboard.orayasystem.fr/admin/debtors/${relance.debtor_id}`,
            })
          } else {
            // Soft bounce : problème temporaire (boîte pleine, serveur down)
            // Resend réessaie automatiquement pendant 72h
            // Si toujours bounced après 72h → webhook bounce définitif

            await sendAlertRaphael({
              type: 'bounce_soft_max',
              clientId: relance.client_id,
              clientName: (relance.clients as any).contact_name,
              debtorName: (relance.debtors as any).company_name,
              details: `L'email de ${relance.email_to} est temporairement injoignable (code ${bounceCode} — boîte pleine ou serveur indisponible). Resend réessaiera. Si le problème persiste, vérifier l'adresse avec le débiteur.`,
              actionUrl: `https://dashboard.orayasystem.fr/admin/debtors/${relance.debtor_id}`,
            })
          }
        }
      }
      break
    }

    case 'email.delivery_delayed': {
      // Email en queue chez Resend mais livraison retardée → informatif
      // Ne pas alerter Raphaël sauf si ça dure > 24h (Resend enverra un bounce dans ce cas)
      console.log('Email delayed:', event.data.email_id)
      break
    }
  }

  return Response.json({ ok: true })
}
```

### 4.3 Variables d'environnement à ajouter

```bash
RESEND_WEBHOOK_SECRET=whsec_...  # Copié depuis Resend → Webhooks → Signing Secret
```

---

## Objectif 5 — Interface dashboard vérification domaine

**Critère de succès** : Thomas peut vérifier son domaine depuis `/profile` sans aide externe. Raphaël voit le statut de tous les domaines depuis `/admin/clients`.

### 5.1 Page Thomas — `/profile/email`

```
┌─────────────────────────────────────────────────────┐
│ Configuration email                                  │
├─────────────────────────────────────────────────────┤
│ Alias configuré : lea.moreau@nexus-conseil.fr        │
│ Statut domaine  : ● Vérifié ✓                       │
│                                                      │
│ ┌─── Enregistrements DNS à ajouter ───────────────┐ │
│ │ Type  │ Nom              │ Valeur               │ │
│ │ TXT   │ @                │ v=spf1 include:...   │ │
│ │ CNAME │ resend._domain.. │ resend._domain...    │ │
│ │                                                  │ │
│ │ [📋 Copier tout]  [🔄 Vérifier maintenant]      │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Dernière relance envoyée : il y a 2 heures          │
│ [Envoyer un email de test]                           │
└─────────────────────────────────────────────────────┘
```

### 5.2 Page Raphaël — onglet Email dans `/admin/clients/[id]`

```
┌─────────────────────────────────────────────────────┐
│ Config email — TechCorp SAS                         │
├─────────────────────────────────────────────────────┤
│ Alias : lea.moreau@nexus-conseil.fr                 │
│ Domaine : nexus-conseil.fr [● Vérifié] [Modifier]  │
│ Resend Domain ID : re_abc123                         │
│                                                      │
│ [Renvoyer le magic link]  [Tester l'envoi]          │
│ [Voir les dernières réponses reçues]                 │
└─────────────────────────────────────────────────────┘
```

### 5.3 Server Action — vérification statut domaine

```typescript
// app/actions/resend-domain.ts
'use server'
import { resend } from '@/lib/resend/client'

export async function checkDomainStatus(clientId: string) {
  const supabase = await createServerClient()
  const { data: client } = await supabase
    .from('clients')
    .select('resend_domain_id')
    .eq('id', clientId)
    .single()

  if (!client?.resend_domain_id) return { status: 'not_configured' }

  const domain = await resend.domains.get(client.resend_domain_id)
  const status = domain.data?.status === 'verified' ? 'verified' : 'pending'

  await supabase
    .from('clients')
    .update({ resend_domain_status: status })
    .eq('id', clientId)

  return { status, records: domain.data?.records }
}
```

---

## Objectif 6 — Structure des fichiers

**Critère de succès** : tous les fichiers existent, chaque type d'email a sa fonction dédiée, zéro duplication.

```
lib/
└── resend/
    ├── client.ts                    # Instance Resend singleton
    ├── send.ts                      # Fonction wrapper générique sendEmail()
    └── emails/
        ├── send-relance.ts          # Email 1 — Relance débiteur
        ├── send-magic-link.ts       # Email 2 — Magic link onboarding
        ├── send-approval-request.ts # Email 3 — Relance à valider
        ├── send-response-notif.ts   # Email 4 — Réponse reçue
        ├── send-recap.ts            # Email 5 — Récap hebdomadaire
        ├── send-alert-raphael.ts    # Email 6 — Alertes Raphaël
        ├── send-payment-plan.ts     # Email 7 — Plan de paiement + PDF
        └── (email-8-bcc.md)         # Email 8 — BCC = champ bcc dans Email 1

app/api/webhooks/
    ├── resend-inbound/route.ts      # Réception réponses débiteurs
    └── resend-events/route.ts       # Bounces + événements livraison

app/actions/
    └── resend-domain.ts             # Vérification domaine Thomas
```

---

## Objectif 7 — Checklist de mise en service

**Critère de succès** : tous les points cochés = emails fonctionnels en production.

### Resend Dashboard (une seule fois)
- [ ] Créer un compte Resend
- [ ] Ajouter le domaine `orayasystem.fr` → copier les enregistrements DNS
- [ ] Ajouter les DNS dans Cloudflare (SPF + DKIM + MX pour inbound)
- [ ] Vérifier que le badge est vert dans Resend
- [ ] Configurer Resend Inbound → adresse `relances@orayasystem.fr` → webhook URL
- [ ] Configurer webhook événements (bounces) → URL + copier le signing secret
- [ ] Récupérer la clé API → `RESEND_API_KEY`
- [ ] Récupérer le signing secret webhook → `RESEND_WEBHOOK_SECRET`

### Variables d'environnement Vercel
- [ ] `RESEND_API_KEY=re_...`
- [ ] `RESEND_WEBHOOK_SECRET=whsec_...`

### Base de données Supabase
- [ ] `ALTER TABLE clients ADD resend_domain_id text`
- [ ] `ALTER TABLE clients ADD resend_domain_status text`

### Code
- [ ] `lib/resend/client.ts` — instance Resend
- [ ] `lib/resend/send.ts` — wrapper générique
- [ ] 7 fichiers `lib/resend/emails/*.ts`
- [ ] `app/api/webhooks/resend-inbound/route.ts`
- [ ] `app/api/webhooks/resend-events/route.ts`
- [ ] `app/actions/resend-domain.ts`
- [ ] Interface `/profile/email` (Thomas)
- [ ] Interface `/admin/clients/[id]` onglet Email (Raphaël)

### Tests manuels
- [ ] Envoyer un email de test depuis `noreply@orayasystem.fr` → reçu sans spam
- [ ] Envoyer depuis un alias Thomas → reçu depuis le bon `from`
- [ ] Répondre à l'alias → job `classify_response` créé dans `job_queue`
- [ ] Simuler un bounce → `relances_queue.status = 'bounced'` + email alerte Raphaël reçu
- [ ] BCC Thomas → copie reçue
- [ ] Plan de paiement → PDF en pièce jointe reçu

---

## Résumé des décisions architecturales

| Décision | Choix |
|----------|-------|
| Transport emails | Resend API uniquement (pas de SMTP client) |
| Colonnes smtp_* dans clients | Conservées en DB (héritage n8n) mais jamais utilisées |
| Vérification domaine | SPF + DKIM via Resend, ajoutés par Thomas dans son DNS |
| Adresse inbound | Une seule : `relances@orayasystem.fr` (tous les clients) |
| Hard bounce | Bloquer les relances + alerter Raphaël + `contact_validated = false` |
| Soft bounce | Alerter Raphaël (informatif) + Resend réessaie automatiquement 72h |
| BCC Thomas | Champ `bcc` dans Email 1 (pas un email séparé) |
| Signatures webhook | Svix (utilisé par Resend) — vérifier systématiquement |
