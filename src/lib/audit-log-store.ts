import { useSyncExternalStore } from "react";
import { COMPANY_EMAIL } from "./inbox-store";

export type AuditActor = "ia" | "user";

export type AuditAction =
  | "received"
  | "classified"
  | "auto_sent"
  | "reclassified"
  | "manual_validated"
  | "follow_up_sent"
  | "archived";

export type AuditEntry = {
  id: string;
  message_id: string;
  at: string; // ISO
  actor: AuditActor;
  actor_label: string; // ex: "IA Oraza", "marc@delaunay.fr"
  action: AuditAction;
  // Version envoyée / brouillon au moment de l'action
  version?: {
    subject?: string;
    body?: string;
    confidence?: number; // 0-1, pour les actions IA
    category?: string;
  };
  note?: string;
};

const ACTION_META: Record<AuditAction, { label: string; emoji: string }> = {
  received: { label: "Message reçu", emoji: "📥" },
  classified: { label: "Classé par l'IA", emoji: "🤖" },
  auto_sent: { label: "Envoyé automatiquement", emoji: "⚡" },
  reclassified: { label: "Reclassé par l'IA", emoji: "🔁" },
  manual_validated: { label: "Validé et envoyé manuellement", emoji: "✅" },
  follow_up_sent: { label: "Relance envoyée", emoji: "📤" },
  archived: { label: "Archivé", emoji: "🗄️" },
};

export function getActionMeta(a: AuditAction) {
  return ACTION_META[a];
}

let entries: AuditEntry[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function useAuditLog(messageId?: string): AuditEntry[] {
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries,
    () => entries,
  );
  if (!messageId) return all;
  return all.filter((e) => e.message_id === messageId);
}

export function logAudit(input: Omit<AuditEntry, "id" | "at"> & { at?: string }) {
  const entry: AuditEntry = {
    id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: input.at ?? new Date().toISOString(),
    ...input,
  };
  entries = [entry, ...entries];
  emit();
}

// Helpers raccourcis
export const AUDIT_IA_LABEL = "IA Oraya";
export const AUDIT_USER_LABEL = COMPANY_EMAIL;
