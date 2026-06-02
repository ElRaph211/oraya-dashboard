import { useSyncExternalStore } from "react";

/**
 * Séquence de relance canonique « J-5 → J+15 »
 * Inspirée du process CSE — 90 % de recouvrement amiable, DSO 45j → 22j.
 *
 * Cette séquence est la base de connaissances utilisée :
 *  - côté admin (Oraya) pour configurer le ton et le contenu par défaut
 *  - côté client (entreprise) pour valider sa propre séquence à l'inscription
 *
 * Chaque étape devient ensuite un template appliqué automatiquement
 * par l'IA lorsqu'une facture atteint le jalon (J-5, J+1, J+3, J+7, J+15).
 */

export type RelanceChannel = "email" | "phone" | "letter";

export type RelanceStep = {
  id: string;
  day_offset: number; // -5, 1, 3, 7, 15 (par rapport à l'échéance)
  day_label: string; // "J-5", "J+1", ...
  title: string;
  channel: RelanceChannel;
  tone: string; // "Service client", "Service client ferme", ...
  content: string[]; // bullets : ce que contient le mail / l'appel
  phrase: string; // phrase-type côté débiteur
  enabled: boolean;
};

export const DEFAULT_SEQUENCE: RelanceStep[] = [
  {
    id: "step-j-5",
    day_offset: -5,
    day_label: "J-5",
    title: "Préventif",
    channel: "email",
    tone: "Service client",
    content: [
      "Mail courtois — rappel d'échéance",
      "Lien de paiement CB inclus",
    ],
    phrase: "Votre facture arrive à échéance le [date].",
    enabled: true,
  },
  {
    id: "step-j-1",
    day_offset: 1,
    day_label: "J+1",
    title: "Première relance",
    channel: "phone",
    tone: "Service client",
    content: [
      "Appel téléphonique (pas de mail)",
      "Comprendre la cause du retard",
    ],
    phrase: "Je m'assure que tout va bien.",
    enabled: true,
  },
  {
    id: "step-j-3",
    day_offset: 3,
    day_label: "J+3",
    title: "Solution",
    channel: "email",
    tone: "Service client",
    content: [
      "Mail de rappel",
      "Proposition d'échéancier si besoin",
    ],
    phrase: "Souhaitez-vous étaler sur 2 dates ?",
    enabled: true,
  },
  {
    id: "step-j-7",
    day_offset: 7,
    day_label: "J+7",
    title: "Escalade douce",
    channel: "phone",
    tone: "Ferme mais professionnel",
    content: [
      "Appel + synthèse écrite",
      "Ton plus ferme mais pro",
      "Rappel des conditions contractuelles",
    ],
    phrase: "Nous devons trouver une solution rapidement.",
    enabled: true,
  },
  {
    id: "step-j-15",
    day_offset: 15,
    day_label: "J+15",
    title: "Dernière étape amiable",
    channel: "letter",
    tone: "Mise en demeure",
    content: [
      "Mise en demeure prête",
      "Dernier appel avant contentieux",
    ],
    phrase: "On règle ou je transmets.",
    enabled: true,
  },
];

const STORAGE_KEY = "oraya.relance_sequence.v1";

function load(): RelanceStep[] {
  if (typeof window === "undefined") return DEFAULT_SEQUENCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SEQUENCE;
    const parsed = JSON.parse(raw) as RelanceStep[];
    // Merge avec defaults pour tolérer l'ajout de nouveaux champs
    return DEFAULT_SEQUENCE.map((d) => {
      const found = parsed.find((p) => p.id === d.id);
      return found ? { ...d, ...found } : d;
    });
  } catch {
    return DEFAULT_SEQUENCE;
  }
}

let sequence: RelanceStep[] = load();
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sequence));
  } catch {
    /* noop */
  }
}

export function getSequence(): RelanceStep[] {
  return sequence;
}

export function useRelanceSequence(): RelanceStep[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sequence,
    () => sequence,
  );
}

export function updateStep(id: string, patch: Partial<RelanceStep>) {
  sequence = sequence.map((s) => (s.id === id ? { ...s, ...patch } : s));
  emit();
}

export function resetSequence() {
  sequence = DEFAULT_SEQUENCE;
  emit();
}

export const CHANNEL_META: Record<RelanceChannel, { label: string; emoji: string }> = {
  email: { label: "E-mail", emoji: "✉️" },
  phone: { label: "Appel", emoji: "📞" },
  letter: { label: "Courrier / LRAR", emoji: "📜" },
};
