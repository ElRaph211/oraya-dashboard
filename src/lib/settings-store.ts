import { useSyncExternalStore } from "react";

export type OrayaSettings = {
  signature: string;
  rib_iban: string;
  rib_bic: string;
  rib_bank: string;
  rib_holder: string;
  auto_send_threshold: number; // 0.80 – 0.99
};

const DEFAULTS: OrayaSettings = {
  signature:
    "Cordialement,\nLe service comptabilité\nBâtisserie Delaunay SAS\n01 45 22 18 90",
  rib_iban: "FR76 3000 4000 0100 0012 3456 789",
  rib_bic: "BNPAFRPPXXX",
  rib_bank: "BNP Paribas — Agence Paris Opéra",
  rib_holder: "Bâtisserie Delaunay SAS",
  auto_send_threshold: 0.9,
};

const STORAGE_KEY = "oraya.settings.v1";

function load(): OrayaSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

let settings: OrayaSettings = load();
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function getSettings(): OrayaSettings {
  return settings;
}

export function setSettings(patch: Partial<OrayaSettings>) {
  settings = { ...settings, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* noop */
  }
  emit();
}

export function useSettings(): OrayaSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => settings,
    () => settings,
  );
}

/** Append signature to an AI-generated body. RIB is handled server-side by Oraya, not exposed in client settings. */
export function composeOutgoingBody(body: string, s: OrayaSettings, _opts?: { includeRib?: boolean }): string {
  const trimmed = body.trim();
  return `${trimmed}\n\n${s.signature}`;
}
