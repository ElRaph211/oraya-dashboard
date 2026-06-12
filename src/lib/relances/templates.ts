/**
 * Templates de relance — CDC v6.0 section 9.
 *
 * 12 templates indexés par code, regroupés par profil de risque.
 *
 *   Profil Stable        →  A1 (J-5), A2 (J+5),  A3 (J+15)
 *   Profil À surveiller  →  B1 (J-3), B2 (J+1/+7), B3 (J+14/+21)
 *   Profil À risque      →  C1 (J-5/J+0), C2 (J+1/+5), C3a, C3b (J+10)
 *   Hors séquence        →  D1 (proposition plan), E1 (échéance plan)
 *
 * Chaque template a un ton aligné sur le profil :
 *   Stable       → humain, presque amical
 *   À surveiller → directif, dates précises, acompte recommandé
 *   À risque     → ferme, acompte 30% obligatoire, escalade formalisée
 *
 * Variables disponibles dans subject + body :
 *   {prenom}             prénom du contact débiteur
 *   {entreprise}         raison sociale débiteur
 *   {numero_facture}     numéro de facture
 *   {montant}            montant TTC formaté en euros
 *   {montant_du}         encours total du débiteur formaté en euros
 *   {date_echeance}      due_date formatée fr-FR
 *   {jours_retard}       N (entier, peut être négatif pour pré-relance)
 *   {entreprise_client}  raison sociale du client Oraya (Thomas)
 *   {signature}          alias_name + alias_email du client
 */

export type RelanceProfil = "stable" | "a_surveiller" | "a_risque";

export type TemplateCode =
  | "A1"
  | "A2"
  | "A3"
  | "B1"
  | "B2"
  | "B3"
  | "C1"
  | "C2"
  | "C3a"
  | "C3b"
  | "D1"
  | "E1";

export type RelanceTemplate = {
  code: TemplateCode;
  profil: RelanceProfil | "plan" | "difficulte";
  step_label: string;
  ton: "humain" | "directif" | "ferme" | "negociation";
  subject: string;
  body: string;
};

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

export const TEMPLATES: Record<TemplateCode, RelanceTemplate> = {
  /* ----------------------- Profil Stable (A1 → A3) ----------------------- */

  A1: {
    code: "A1",
    profil: "stable",
    step_label: "Pré-relance J-5",
    ton: "humain",
    subject: "Facture {numero_facture} — petit rappel avant l'échéance",
    body: `Bonjour {prenom},

Petit rappel cordial : la facture {numero_facture} de {montant} arrive à échéance le {date_echeance}.

Si tout est en ordre de votre côté, vous pouvez ignorer ce message. Dans le cas contraire, n'hésitez pas à me revenir avant cette date.

{coordonnees_paiement}

Bien à vous,
{signature}`,
  },

  A2: {
    code: "A2",
    profil: "stable",
    step_label: "Relance 1 — J+5",
    ton: "humain",
    subject: "Facture {numero_facture} — petite relance",
    body: `Bonjour {prenom},

La facture {numero_facture} de {montant} est arrivée à échéance le {date_echeance}. Je n'ai pas encore vu passer le règlement.

Sans doute un oubli — pouvez-vous me confirmer la date prévue du virement, idéalement avant le {date_limite_5j} ?

{coordonnees_paiement}

Merci d'avance,
{signature}`,
  },

  A3: {
    code: "A3",
    profil: "stable",
    step_label: "Relance 2 — J+15",
    ton: "directif",
    subject: "Facture {numero_facture} — point de situation",
    body: `Bonjour {prenom},

La facture {numero_facture} de {montant} accuse {jours_retard} jours de retard. Je n'ai toujours pas de retour de votre part.

Pour avancer rapidement, pourriez-vous me préciser avant le {date_limite_48h} :
  • la date de virement prévue, ou
  • un motif éventuel (litige, document manquant) ?

{coordonnees_paiement}

À défaut de réponse, je serai amené à appliquer les pénalités de retard prévues par la loi (article L.441-10 du Code de commerce).

Cordialement,
{signature}`,
  },

  /* -------------------- Profil À surveiller (B1 → B3) -------------------- */

  B1: {
    code: "B1",
    profil: "a_surveiller",
    step_label: "Pré-relance J-3",
    ton: "directif",
    subject: "Facture {numero_facture} — échéance dans 3 jours",
    body: `Bonjour {prenom},

Pour rappel, la facture {numero_facture} d'un montant de {montant} arrive à échéance le {date_echeance} (dans 3 jours).

Merci de bien vouloir confirmer la date prévue de règlement ou, le cas échéant, de me signaler toute difficulté en amont.

{coordonnees_paiement}

Cordialement,
{signature}`,
  },

  B2: {
    code: "B2",
    profil: "a_surveiller",
    step_label: "Relance 1 ou 2 — J+1 / J+7",
    ton: "directif",
    subject: "Facture {numero_facture} échue — règlement attendu",
    body: `Bonjour {prenom},

La facture {numero_facture} de {montant}, échue depuis le {date_echeance} ({jours_retard} jours), est aujourd'hui en retard.

Merci de me communiquer avant le {date_limite_48h} :
  • la date exacte du virement, ou
  • une proposition d'acompte en cas de difficulté de trésorerie.

{coordonnees_paiement}

Cordialement,
{signature}`,
  },

  B3: {
    code: "B3",
    profil: "a_surveiller",
    step_label: "Relance 3 ou 4 — J+14 / J+21",
    ton: "ferme",
    subject: "Mise en demeure préalable — facture {numero_facture}",
    body: `Bonjour {prenom},

Malgré mes relances, la facture {numero_facture} de {montant} reste impayée à ce jour ({jours_retard} jours de retard).

Sans règlement intégral ou proposition d'échéancier avant le {date_limite_5j}, je serai contraint :
  • d'appliquer les pénalités de retard (taux légal BtoB) et l'indemnité forfaitaire de 40 €,
  • d'engager une procédure de recouvrement formalisée.

{coordonnees_paiement}

Je reste à votre disposition pour échanger sur une solution amiable.

Cordialement,
{signature}`,
  },

  /* ---------------------- Profil À risque (C1 → C3) ---------------------- */

  C1: {
    code: "C1",
    profil: "a_risque",
    step_label: "Confirmation J-5 / Rappel J+0",
    ton: "ferme",
    subject: "Facture {numero_facture} — confirmation de règlement",
    body: `Bonjour {prenom},

Compte tenu de notre historique commercial, je vous prie de bien vouloir me confirmer le règlement de la facture {numero_facture} d'un montant de {montant}, échéance {date_echeance}.

Si un acompte de 30 % minimum ne peut être versé à l'échéance, merci de me proposer un échéancier formalisé avant cette date.

{coordonnees_paiement}

Cordialement,
{signature}`,
  },

  C2: {
    code: "C2",
    profil: "a_risque",
    step_label: "Relance 1 ou 2 — J+1 / J+5",
    ton: "ferme",
    subject: "Facture {numero_facture} échue — action requise",
    body: `Bonjour {prenom},

La facture {numero_facture} de {montant} est échue depuis {jours_retard} jours et reste impayée.

Je vous demande avant le {date_limite_48h} :
  • le règlement intégral, ou
  • une proposition d'échéancier avec acompte initial de 30 % minimum.

{coordonnees_paiement}

Sans réponse, le dossier sera transféré en recouvrement formalisé avec pénalités et indemnité forfaitaire de 40 €.

Cordialement,
{signature}`,
  },

  C3a: {
    code: "C3a",
    profil: "a_risque",
    step_label: "Relance 3 — J+10 (sans plan)",
    ton: "ferme",
    subject: "Dernière relance amiable — facture {numero_facture}",
    body: `Bonjour {prenom},

Ceci est ma dernière relance amiable concernant la facture {numero_facture} d'un montant de {montant} ({jours_retard} jours de retard).

Sans règlement avant le {date_limite_5j}, le dossier sera transmis pour :
  • mise en demeure formelle,
  • engagement d'une procédure de recouvrement (injonction de payer ou assignation),
  • application des pénalités et frais de recouvrement.

{coordonnees_paiement}

Je préfère trouver une solution amiable — répondez-moi pour échanger.

Cordialement,
{signature}`,
  },

  C3b: {
    code: "C3b",
    profil: "a_risque",
    step_label: "Relance 3 — J+10 (avec proposition plan)",
    ton: "negociation",
    subject: "Facture {numero_facture} — proposition d'échéancier",
    body: `Bonjour {prenom},

Compte tenu du retard accumulé sur la facture {numero_facture} ({montant}, {jours_retard} jours), je vous propose un échéancier pour solder votre dette dans des conditions tenables :

  • acompte de 30 % à la signature,
  • solde réparti sur 3 à 6 mensualités,
  • formalisation par accord écrit.

Confirmez-moi votre intérêt avant le {date_limite_48h}. À défaut, le dossier passera en phase formelle.

Cordialement,
{signature}`,
  },

  /* -------------------- Hors séquence : D1 et E1 ----------------------- */

  D1: {
    code: "D1",
    profil: "difficulte",
    step_label: "Proposition de plan (difficulté financière)",
    ton: "negociation",
    subject: "Échéancier proposé pour la facture {numero_facture}",
    body: `Bonjour {prenom},

Suite à notre échange, je vous confirme la proposition d'échéancier pour solder la facture {numero_facture} (encours total {montant_du}) :

  • acompte initial de 30 % à la validation,
  • solde réparti en mensualités égales sur une durée à convenir,
  • formalisation par accord écrit signé des deux parties.

Merci de me confirmer votre accord pour que je vous adresse l'échéancier détaillé.

Cordialement,
{signature}`,
  },

  E1: {
    code: "E1",
    profil: "plan",
    step_label: "Rappel échéance plan de paiement",
    ton: "directif",
    subject: "Rappel échéance plan — facture {numero_facture}",
    body: `Bonjour {prenom},

Pour information, l'échéance n° {numero_facture} de votre plan de paiement (montant {montant}) était prévue le {date_echeance}.

Je n'ai pas encore vu passer le règlement. Pouvez-vous me confirmer la date exacte du virement ?

Pour rappel, le respect du plan conditionne le maintien des conditions négociées.

Cordialement,
{signature}`,
  },
};

/* -------------------------------------------------------------------------- */
/*  Rendu des variables                                                       */
/* -------------------------------------------------------------------------- */

export type TemplateVars = {
  prenom?: string;
  entreprise?: string;
  numero_facture?: string;
  montant?: number;
  montant_du?: number;
  date_echeance?: string; // ISO date
  jours_retard?: number;
  entreprise_client?: string;
  alias_name?: string;
  alias_email?: string;
  // Coordonnées de paiement du créancier (injectées dans le bloc {coordonnees_paiement})
  iban?: string;
  bic?: string;
  bank_holder?: string;
  payment_link?: string;
};

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/**
 * Ajoute N jours ouvrés à une date (skip samedi/dimanche).
 * Pour les jours fériés on délègue au caller — ici on garde simple/synchrone.
 */
function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** Format "vendredi 17 juin" — verbeux, plus chaleureux qu'une date pure. */
function formatRelativeDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function buildSignature(vars: TemplateVars): string {
  const name = vars.alias_name?.trim();
  const email = vars.alias_email?.trim();
  if (name && email) return `${name}\n${email}`;
  if (name) return name;
  if (email) return email;
  return "L'équipe Oraya";
}

/**
 * Construit le bloc des coordonnées de paiement à insérer dans le mail.
 * Retourne une chaîne vide si rien n'est configuré (le template doit gérer la pré-ligne).
 */
function buildPaymentBlock(vars: TemplateVars): string {
  const lines: string[] = [];
  if (vars.payment_link) {
    lines.push(`💳 Payer en ligne : ${vars.payment_link}`);
  }
  if (vars.iban) {
    const ibanFormatted = vars.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
    lines.push(`Virement bancaire :`);
    if (vars.bank_holder) lines.push(`  Bénéficiaire : ${vars.bank_holder}`);
    lines.push(`  IBAN : ${ibanFormatted}`);
    if (vars.bic) lines.push(`  BIC : ${vars.bic}`);
  }
  return lines.join("\n");
}

/** Substitue les variables {xxx} dans un template subject/body. */
export function renderTemplate(code: TemplateCode, vars: TemplateVars): { subject: string; body: string } {
  const t = TEMPLATES[code];
  if (!t) throw new Error(`Template inconnu : ${code}`);

  // Dates limites calculées à partir d'aujourd'hui — donne une vraie date plutôt
  // qu'un "sous N jours" relatif que le destinataire doit calculer.
  const today = new Date();
  const date48h = formatRelativeDate(addBusinessDays(today, 2));
  const date5j = formatRelativeDate(addBusinessDays(today, 5));
  const date5jCal = formatRelativeDate(new Date(today.getTime() + 5 * 86400000));
  const date3jCal = formatRelativeDate(new Date(today.getTime() + 3 * 86400000));

  const paymentBlock = buildPaymentBlock(vars);

  const map: Record<string, string> = {
    prenom: vars.prenom?.trim() || "",
    entreprise: vars.entreprise || "",
    numero_facture: vars.numero_facture || "",
    montant: vars.montant !== undefined ? formatEuro(vars.montant) : "",
    montant_du: vars.montant_du !== undefined ? formatEuro(vars.montant_du) : "",
    date_echeance: vars.date_echeance ? formatDate(vars.date_echeance) : "",
    jours_retard: vars.jours_retard !== undefined ? String(vars.jours_retard) : "",
    entreprise_client: vars.entreprise_client || "",
    signature: buildSignature(vars),
    // Dates limites (déjà calculées en absolu)
    date_limite_48h: date48h,         // "mercredi 14 juin" (today + 2j ouvrés)
    date_limite_5j: date5j,           // "vendredi 17 juin" (today + 5j ouvrés)
    date_limite_5j_cal: date5jCal,    // "samedi 17 juin"   (today + 5j calendaires)
    date_limite_3j_cal: date3jCal,    // "samedi 15 juin"   (today + 3j calendaires)
    // Bloc paiement formaté (vide si rien configuré)
    coordonnees_paiement: paymentBlock,
  };

  const substitute = (input: string) =>
    input.replace(/\{(\w+)\}/g, (_, key: string) => (key in map ? map[key] : `{${key}}`));

  return {
    subject: substitute(t.subject),
    body: substitute(t.body),
  };
}

/** Liste les codes par profil (utile pour getNextTemplate). */
export const TEMPLATES_BY_PROFIL: Record<RelanceProfil, TemplateCode[]> = {
  stable: ["A1", "A2", "A3"],
  a_surveiller: ["B1", "B2", "B3"],
  a_risque: ["C1", "C2", "C3a", "C3b"],
};
