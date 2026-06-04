import { useSyncExternalStore } from "react";

// Email de l'entreprise utilisatrice (mode démo). En prod, viendrait du profil client.
export const COMPANY_EMAIL = "marc@delaunay.fr";
export const COMPANY_NAME = "Bâtisserie Delaunay SAS";
// Adresse Oraya dédiée — toute réponse arrive ici via webhook entrant.
export const ORAYA_INBOX_EMAIL = "delaunay@inbox.oraya.fr";

/** 9 catégories alignées sur le CDC v6.0 section 9.3 */
export type InboxCategory =
  | "promesse_datee"
  | "promesse_vague"
  | "paiement_annonce"
  | "contestation_litige"
  | "demande_document"
  | "absence_automatique"
  | "difficulte_financiere"
  | "silence"
  | "a_classifier_manuellement";

export type InboxStatus = "pending" | "auto_processed" | "manual_validated" | "archived";

export type InboxMessage = {
  id: string;
  received_at: string; // ISO
  from_email: string;
  from_name?: string;
  subject: string;
  body: string;
  matched_debtor_id?: string;
  matched_debtor_company?: string;
  category?: InboxCategory;
  confidence?: number; // 0-1
  ai_summary?: string;
  ai_action_taken?: string;
  /** Date extraite par GPT : paiement promis ou retour de congés */
  extracted_date?: string | null;
  // Brouillon de réponse généré par l'IA
  ai_draft_subject?: string;
  ai_draft_body?: string;
  // Une fois envoyé (auto ou validé manuellement)
  sent_subject?: string;
  sent_body?: string;
  sent_to?: string;
  sent_bcc?: string;
  sent_reply_to?: string;
  sent_at?: string; // ISO
  // Réponses ultérieures depuis Oraya (composer)
  follow_ups?: Array<{
    id: string;
    sent_at: string;
    to: string;
    bcc?: string;
    subject: string;
    body: string;
  }>;
  status: InboxStatus;
};

let messages: InboxMessage[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useInbox(): InboxMessage[] {
  return useSyncExternalStore(
    subscribe,
    () => messages,
    () => messages,
  );
}

export function getInbox() {
  return messages;
}

export function addMessage(msg: InboxMessage) {
  messages = [msg, ...messages];
  emit();
}

export function updateMessage(id: string, patch: Partial<InboxMessage>) {
  messages = messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
  emit();
}

export function deleteMessage(id: string) {
  messages = messages.filter((m) => m.id !== id);
  emit();
}

export function addFollowUp(
  id: string,
  followUp: { to: string; bcc?: string; subject: string; body: string },
) {
  const entry = {
    id: `fu_${Date.now()}`,
    sent_at: new Date().toISOString(),
    ...followUp,
  };
  messages = messages.map((m) =>
    m.id === id ? { ...m, follow_ups: [...(m.follow_ups ?? []), entry] } : m,
  );
  emit();
}

export const CATEGORY_META: Record<
  InboxCategory,
  { label: string; emoji: string; color: string; auto: boolean }
> = {
  promesse_datee: {
    label: "Promesse datée",
    emoji: "💰",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    auto: true,
  },
  promesse_vague: {
    label: "Promesse vague",
    emoji: "💬",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    auto: true,
  },
  paiement_annonce: {
    label: "Paiement annoncé",
    emoji: "🏦",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    auto: true,
  },
  contestation_litige: {
    label: "Contestation / litige",
    emoji: "⚠️",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    auto: false, // litige → humain valide
  },
  demande_document: {
    label: "Demande de document",
    emoji: "📄",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    auto: true,
  },
  absence_automatique: {
    label: "Absence automatique",
    emoji: "🌴",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    auto: true,
  },
  difficulte_financiere: {
    label: "Difficulté financière",
    emoji: "📅",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    auto: false, // négociation échéancier → humain
  },
  silence: {
    label: "Silence",
    emoji: "🤐",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    auto: false,
  },
  a_classifier_manuellement: {
    label: "À reclasser manuellement",
    emoji: "❓",
    color: "bg-rose-50 text-rose-700 border-rose-200",
    auto: false,
  },
};
