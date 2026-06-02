import { useSyncExternalStore } from "react";
import { RELANCES_INITIAL, type Relance, type RelanceStatus } from "./mock-data";

let relances: Relance[] = [...RELANCES_INITIAL];
const listeners = new Set<() => void>();

// Journal d'envoi horodaté — historique persistant tant que la page vit
export type SendLogEntry = {
  id: string;
  timestamp: string; // ISO
  relance_id: string;
  debtor: string;
  invoice_number: string;
  action: string;
  to: string;
  result: "sent" | "error";
  error_message?: string;
  attempt: number;
  trigger: "queue" | "retry" | "manual";
};

let sendLog: SendLogEntry[] = [];
let logSeq = 0;
function appendLog(entry: Omit<SendLogEntry, "id" | "timestamp">) {
  logSeq += 1;
  sendLog = [
    { id: `log-${Date.now()}-${logSeq}`, timestamp: new Date().toISOString(), ...entry },
    ...sendLog,
  ];
}

// File d'envoi cadencée pour éviter le ban SMTP et le marquage spam
export type SendQueueState = {
  running: boolean;
  total: number;
  sent: number;
  errors: number;
  currentId: string | null;
  nextInMs: number;
  delaySec: number;
  currentDelayMs: number; // délai jitter du prochain envoi
  isRetry: boolean;
};

let queue: SendQueueState = {
  running: false,
  total: 0,
  sent: 0,
  errors: 0,
  currentId: null,
  nextInMs: 0,
  delaySec: 12,
  currentDelayMs: 0,
  isRetry: false,
};
let queueIds: string[] = [];
let tickHandle: ReturnType<typeof setInterval> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setRelanceStatus(id: string, status: RelanceStatus) {
  const target = relances.find((r) => r.id === id);
  relances = relances.map((r) => (r.id === id ? { ...r, status } : r));
  if (target && status === "sent") {
    appendLog({
      relance_id: target.id,
      debtor: target.debtor,
      invoice_number: target.invoice_number,
      action: target.action,
      to: target.to,
      result: "sent",
      attempt: (target.retry_count ?? 0) + 1,
      trigger: "manual",
    });
  }
  emit();
}

export function validateAllPending() {
  relances = relances.map((r) => (r.status === "pending" ? { ...r, status: "validated" } : r));
  emit();
}

export function editRelance(id: string, patch: { subject?: string; body?: string }) {
  relances = relances.map((r) =>
    r.id === id ? { ...r, ...patch, status: r.status === "sent" ? r.status : "pending" } : r,
  );
  emit();
}

export function resetRelances() {
  stopSendQueue();
  relances = [...RELANCES_INITIAL];
  sendLog = [];
  emit();
}

export function clearSendLog() {
  sendLog = [];
  emit();
}

export function setSendDelay(sec: number) {
  queue = { ...queue, delaySec: Math.max(1, Math.round(sec)) };
  emit();
}

function clearTicker() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

/** Jitter : ±40 % autour du délai configuré pour casser les patterns répétitifs */
function jitteredDelayMs(baseSec: number): number {
  const baseMs = baseSec * 1000;
  // ratio aléatoire entre 0.6 et 1.4
  const ratio = 0.6 + Math.random() * 1.4;
  return Math.round(baseMs * ratio);
}

/** Simule un échec d'envoi SMTP (~18 %) avec un message d'erreur réaliste */
function simulateSendOutcome(): { ok: true } | { ok: false; reason: string } {
  const roll = Math.random();
  if (roll > 0.18) return { ok: true };
  const reasons = [
    "SMTP 550 — Adresse destinataire rejetée",
    "SMTP 421 — Service temporairement indisponible",
    "SMTP 552 — Message refusé par filtre anti-spam",
    "Timeout de connexion au serveur SMTP",
    "DNS MX introuvable pour le domaine destinataire",
  ];
  return { ok: false, reason: reasons[Math.floor(Math.random() * reasons.length)] };
}

function sendNext() {
  const nextId = queueIds.shift();
  if (!nextId) {
    queue = { ...queue, running: false, currentId: null, nextInMs: 1, currentDelayMs: 0 };
    clearTicker();
    emit();
    return;
  }
  // Tentative d'envoi avec simulation d'échec
  const outcome = simulateSendOutcome();
  const targetRelance = relances.find((r) => r.id === nextId);
  relances = relances.map((r) => {
    if (r.id !== nextId) return r;
    if (outcome.ok) {
      return { ...r, status: "sent", error_message: undefined };
    }
    return {
      ...r,
      status: "error",
      error_message: outcome.reason,
      retry_count: (r.retry_count ?? 0) + 1,
    };
  });
  if (targetRelance) {
    appendLog({
      relance_id: targetRelance.id,
      debtor: targetRelance.debtor,
      invoice_number: targetRelance.invoice_number,
      action: targetRelance.action,
      to: targetRelance.to,
      result: outcome.ok ? "sent" : "error",
      error_message: outcome.ok ? undefined : outcome.reason,
      attempt: (targetRelance.retry_count ?? 0) + 1,
      trigger: queue.isRetry ? "retry" : "queue",
    });
  }
  const delayMs = queueIds.length > 0 ? jitteredDelayMs(queue.delaySec) : 1;
  queue = {
    ...queue,
    sent: queue.sent + (outcome.ok ? 1 : 0),
    errors: queue.errors + (outcome.ok ? 0 : 1),
    currentId: nextId,
    nextInMs: delayMs,
    currentDelayMs: delayMs,
  };
  emit();

  if (queueIds.length === 0) {
    // dernier élément envoyé, on stoppe proprement
    setTimeout(() => {
      queue = { ...queue, running: false, currentId: null, nextInMs: 1, currentDelayMs: 1 };
      clearTicker();
      emit();
    }, 600);
    return;
  }

  // Ticker pour décompte visuel
  clearTicker();
  const startedAt = Date.now();
  tickHandle = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(1, queue.nextInMs - elapsed);
    queue = { ...queue, nextInMs: remaining };
    emit();
    if (remaining <= 0) {
      clearTicker();
      sendNext();
    }
  }, 200);
}

export function startSendQueue(ids?: string[]) {
  if (queue.running) return;
  const targets = ids ?? relances.filter((r) => r.status === "validated").map((r) => r.id);
  if (targets.length === 0) return;
  queueIds = [...targets];
  queue = {
    ...queue,
    running: true,
    total: targets.length,
    sent: 0,
    errors: 0,
    currentId: null,
    nextInMs: 1,
    currentDelayMs: 1,
    isRetry: false,
  };
  emit();
  sendNext();
}

/** Réessaye uniquement les relances en échec, en repassant par la file cadencée */
export function retryFailedSends() {
  if (queue.running) return;
  const targets = relances.filter((r) => r.status === "error").map((r) => r.id);
  if (targets.length === 0) return;
  // Remet les relances en file (statut "validated" le temps du retry)
  relances = relances.map((r) =>
    r.status === "error" ? { ...r, status: "validated", error_message: undefined } : r,
  );
  queueIds = [...targets];
  queue = {
    ...queue,
    running: true,
    total: targets.length,
    sent: 0,
    errors: 0,
    currentId: null,
    nextInMs: 1,
    currentDelayMs: 1,
    isRetry: true,
  };
  emit();
  sendNext();
}

/** Retry manuel d'une seule relance en échec */
export function retrySingle(id: string) {
  const r = relances.find((x) => x.id === id);
  if (!r || r.status !== "error") return;
  relances = relances.map((x) =>
    x.id === id ? { ...x, status: "validated", error_message: undefined } : x,
  );
  emit();
  if (!queue.running) startSendQueue([id]);
}

export function stopSendQueue() {
  queueIds = [];
  clearTicker();
  queue = { ...queue, running: false, currentId: null, nextInMs: 1, currentDelayMs: 1 };
  emit();
}

export function useRelances(): Relance[] {
  return useSyncExternalStore(subscribe, () => relances, () => relances);
}

export function useSendQueue(): SendQueueState {
  return useSyncExternalStore(subscribe, () => queue, () => queue);
}

export function useSendLog(): SendLogEntry[] {
  return useSyncExternalStore(subscribe, () => sendLog, () => sendLog);
}
