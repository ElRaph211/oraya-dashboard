# Plan — Mail centralisé dans Oraya + dashboard épuré

## 1. CC entreprise sur chaque mail envoyé par l'IA

Tous les mails envoyés (auto ou validés manuellement) ajouteront l'entreprise en copie.

**Mais attention au design email** — il y a un piège : si on met l'entreprise en **CC**, elle peut cliquer "Répondre à tous" depuis Gmail/Outlook et casser le fil (le débiteur recevra deux réponses, et Oraya ne verra que la vôtre). Je propose ce schéma propre :

```text
From:     dupont-plomberie@inbox.oraya.fr
Reply-To: dupont-plomberie@inbox.oraya.fr   ← toute réponse revient dans Oraya
To:       debiteur@exemple.fr
Bcc:      marc@dupont-plomberie.fr           ← entreprise informée, invisible pour le débiteur
```

L'entreprise reçoit donc une copie pour son archive Gmail, mais le canal de réponse reste 100 % Oraya. (Si vous préférez **CC visible** pour rassurer l'entreprise, on switche d'une ligne — mais je recommande BCC.)

## 2. Conversations bidirectionnelles dans Oraya

Réponse à votre question "peut-on vraiment tout gérer depuis la plateforme ?" → **oui, et c'est même la bonne approche** pour ce produit.

Ce que ça implique côté UX :

- Chaque débiteur a un **fil de conversation** (timeline) : relance envoyée → réponse débiteur → réponse Oraya → etc.
- Depuis la fiche débiteur (ou un message d'inbox), bouton **"Répondre"** qui ouvre un composer dans Oraya (sujet pré-rempli avec `Re:`, RIB / signature pré-injectés, brouillon IA optionnel).
- Le `Message-ID` et `In-Reply-To` sont gérés automatiquement → le fil reste cohérent côté débiteur dans Gmail.

Côté technique (pour info) : très simple avec Postmark/Mailgun (~1 jour de wiring quand on aura `inbox.oraya.fr`). Aujourd'hui je simule end-to-end avec un composer fonctionnel + faux envoi.

## 3. Épuration du dashboard

Retirer ce qui fait doublon avec les onglets dédiés :

- **Supprimer** la section "Relances à valider" (les 6 cards + boutons "Tout valider" / "File complète") → tout est déjà dans `/relances`.
- **Garder** les 4 KPIs en haut + le tableau "Suivi des factures" en bas.
- **Ajouter** un 5ᵉ KPI compact "Réponses à vérifier" (depuis l'inbox) qui linke vers `/inbox` — c'est l'action quotidienne du dirigeant.
- **Réduire** le titre et le sous-titre du header (moins long).
- **Retirer** le bandeau "Mode démo — données fictives" du dashboard pour laisser une vue propre (gardé dans le profil).

## 4. Feedbacks proactifs (autres points à envisager)

Je note 5 trucs qui manquent et qui auront du sens en prod :

1. **Page Paramètres** : RIB, signature email, plafond de confiance auto-envoi (slider 80–99 %), ton des relances (ferme / courtois / neutre). Aujourd'hui ces valeurs sont en dur dans le prompt.
2. **Fiche débiteur enrichie** : timeline unifiée (factures + relances envoyées + réponses reçues + actions IA) au lieu de listes séparées.
3. **"Reclasser"** dans l'inbox : actuellement c'est un `alert()` placeholder — soit on le branche pour vrai, soit on l'enlève.
4. **Bouton "Répondre manuellement"** quand l'IA classe `hors_sujet` ou ne propose pas de brouillon (aujourd'hui on ne peut qu'archiver).
5. **Trail d'audit** : log consolidé "qui a fait quoi quand" (utile en cas de contestation juridique d'une mise en demeure auto-envoyée).

Hors scope de cette itération sauf si vous voulez les inclure — dites-moi lesquels prioriser.

## Périmètre que j'implémente dans cette itération

- [x] BCC entreprise + Reply-To Oraya sur chaque mail simulé envoyé.
- [x] Composer "Répondre" dans l'inbox (réponse à un débiteur qui a déjà répondu).
- [x] Timeline de conversation sur la fiche débiteur (`/debtors/$debtorId`).
- [x] Dashboard épuré : suppression section Relances, ajout KPI "Réponses à vérifier", retrait bandeau démo.

**Hors scope** (à confirmer pour la suite) : page Paramètres, bouton Reclasser, audit log, branchement Postmark réel.

---

### Détails techniques (pour info)

- `inbox-store.ts` : ajouter `cc?: string`, `reply_to?: string`, et un type `Conversation` qui groupe par `thread_id` (dérivé de `matched_debtor_id + invoice ref`).
- `data-store.ts` : ajouter `client.contact_email` (déjà présent dans la table `clients` Supabase) côté front pour l'injecter en BCC.
- Nouveau composant `<Composer>` réutilisable (sujet + corps + envoi) utilisé à 2 endroits : réponse inbox + nouvelle relance manuelle depuis fiche débiteur.
- Dashboard : supprimer l'import `useRelances` + `setRelanceStatus` + `validateAllPending` qui deviennent inutiles ici.
- Inbox card "Réponse envoyée" : afficher les en-têtes `À`, `Cci`, `Reply-To` pour transparence.

Je passe en build dès que vous validez (et dites-moi si vous voulez **CC visible** plutôt que BCC, et si on inclut un des 5 points hors scope).
