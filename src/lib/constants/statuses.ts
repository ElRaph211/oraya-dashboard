/**
 * Statuts centralisés du domaine Oraya.
 *
 * Source unique de vérité pour les chaînes de statut utilisées dans la DB
 * et le code. Évite les fautes de frappe ("bouncer" vs "bounced"), facilite
 * les renommages et offre l'inférence de type pour les unions.
 *
 * Convention : `as const` + type inféré via `(typeof X)[keyof typeof X]`.
 */

export const RELANCE_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  SENT: "sent",
  AUTO_SENT: "auto_sent",
  BOUNCED: "bounced",
  CANCELLED: "cancelled",
} as const;
export type RelanceStatus = (typeof RELANCE_STATUS)[keyof typeof RELANCE_STATUS];

export const JOB_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const JOB_TYPE = {
  SEND_RELANCE: "send_relance",
  CLASSIFY_RESPONSE: "classify_response",
  SYNC_PENNYLANE: "sync_pennylane",
} as const;
export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

export const WORKFLOW_STATUS = {
  EN_ATTENTE: "en_attente",
  PRE_RELANCE: "pre_relance",
  RELANCE_1_ENVOYEE: "relance_1_envoyee",
  RELANCE_2_ENVOYEE: "relance_2_envoyee",
  EN_ATTENTE_REPONSE: "en_attente_reponse",
  A_RELANCER: "a_relancer",
  PROMESSE_PAIEMENT: "promesse_paiement",
  PROMESSE_VAGUE: "promesse_vague",
  PAIEMENT_ANNONCE: "paiement_annonce",
  CONTESTATION: "contestation",
  DIFFICULTE_FINANCIERE: "difficulte_financiere",
  A_CLASSIFIER_MANUELLEMENT: "a_classifier_manuellement",
  ESCALADE_RECOMMANDEE: "escalade_recommandee",
  REGLE: "regle",
} as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];

export const RESPONSE_CATEGORY = {
  PROMESSE_DATEE: "promesse_datee",
  PROMESSE_VAGUE: "promesse_vague",
  PAIEMENT_ANNONCE: "paiement_annonce",
  CONTESTATION_LITIGE: "contestation_litige",
  DEMANDE_DOCUMENT: "demande_document",
  ABSENCE_AUTOMATIQUE: "absence_automatique",
  DIFFICULTE_FINANCIERE: "difficulte_financiere",
  SILENCE: "silence",
  A_CLASSIFIER_MANUELLEMENT: "a_classifier_manuellement",
} as const;
export type ResponseCategory = (typeof RESPONSE_CATEGORY)[keyof typeof RESPONSE_CATEGORY];

export const INVOICE_STATUS = {
  PENDING: "pending",
  OVERDUE: "overdue",
  PARTIAL: "partial",
  PAID: "paid",
  DISPUTED: "disputed",
  IRRECOVERABLE: "irrecoverable",
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const ONBOARDING_STATUS = {
  PENDING: "pending",
  ALIAS_PENDING: "alias_pending",
  READY_TO_LAUNCH: "ready_to_launch",
  ACTIVE: "active",
  PAUSED: "paused",
  CLOSED: "closed",
} as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];
