/**
 * Sélection du prochain template de relance — CDC v6.0 section 9.1.
 *
 * Entrée : profil du débiteur + sequence_step actuel + due_date.
 * Sortie : code template à envoyer + prochaine next_relance_date.
 *
 * Profils :
 *   stable        :  A1 (J-5)  → A2 (J+5)  → A3 (J+15)  → évaluation (null)
 *   a_surveiller  :  B1 (J-3)  → B2 (J+1)  → B2 (J+7)  → B3 (J+14) → B3 (J+21) → éval (null)
 *   a_risque      :  C1 (J-5)  → C1 (J+0)  → C2 (J+1)  → C2 (J+5)  → C3a/C3b (J+10) → éval (null)
 *
 * Les jours fériés et week-ends sont sautés via nextBusinessDay().
 */

import { nextBusinessDay } from "./jours-feries";
import type { RelanceProfil, TemplateCode } from "./templates";

export type SequenceStep = {
  /** N° d'ordre dans la séquence (0-based) */
  step: number;
  /** Code template à utiliser */
  template: TemplateCode;
  /** Offset en jours par rapport à due_date pour CET envoi (négatif = pré-relance) */
  send_offset: number;
  /** Offset en jours par rapport à due_date pour la PROCHAINE next_relance_date.
   *  null = fin de séquence automatique (évaluation manuelle Raphaël). */
  next_offset: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Séquences par profil                                                      */
/* -------------------------------------------------------------------------- */

export const SEQUENCES: Record<RelanceProfil, SequenceStep[]> = {
  stable: [
    { step: 0, template: "A1", send_offset: -5, next_offset: 5 },
    { step: 1, template: "A2", send_offset: 5, next_offset: 15 },
    { step: 2, template: "A3", send_offset: 15, next_offset: 30 },
    // step 3 = évaluation Raphaël (next_offset = null, pas de template auto)
  ],
  a_surveiller: [
    { step: 0, template: "B1", send_offset: -3, next_offset: 1 },
    { step: 1, template: "B2", send_offset: 1, next_offset: 7 },
    { step: 2, template: "B2", send_offset: 7, next_offset: 14 },
    { step: 3, template: "B3", send_offset: 14, next_offset: 21 },
    { step: 4, template: "B3", send_offset: 21, next_offset: 30 },
  ],
  a_risque: [
    { step: 0, template: "C1", send_offset: -5, next_offset: 0 },
    { step: 1, template: "C1", send_offset: 0, next_offset: 1 },
    { step: 2, template: "C2", send_offset: 1, next_offset: 5 },
    { step: 3, template: "C2", send_offset: 5, next_offset: 10 },
    { step: 4, template: "C3a", send_offset: 10, next_offset: 15 },
    // C3b est une variante de C3a quand le débiteur a signalé une difficulté
    // (workflow_status = difficulte_financiere) — gérée hors séquence par D1.
  ],
};

/* -------------------------------------------------------------------------- */
/*  Détermination de la prochaine étape                                       */
/* -------------------------------------------------------------------------- */

export type NextTemplateInput = {
  profil: RelanceProfil;
  due_date: string; // ISO date
  /** Nombre de relances déjà envoyées pour cette facture (0 si jamais relancé) */
  sequence_step: number;
  /** Délai habituel du client entre prestation et facture — soustrait du retard */
  delai_facturation_jours?: number;
  /** Pour tests */
  asOf?: Date;
};

export type NextTemplateResult = {
  /** Code du template à utiliser, null si on est sorti de séquence (évaluation manuelle) */
  template: TemplateCode | null;
  /** Date à laquelle envoyer cette relance (jour ouvré, après nextBusinessDay) — null si évaluation manuelle */
  send_date: string | null;
  /** Date à programmer pour la prochaine relance après envoi — null si évaluation manuelle */
  next_relance_date: string | null;
  /** Jours de retard estimé au moment de l'envoi (négatif si pré-relance) */
  days_since_due: number;
  /** Step de la séquence à utiliser (idem `sequence_step` en entrée) */
  step: number;
};

/** Détermine la prochaine étape de relance pour une facture. */
export async function getNextTemplate(input: NextTemplateInput): Promise<NextTemplateResult> {
  const sequence = SEQUENCES[input.profil];
  const step = Math.max(0, input.sequence_step);
  const stepDef = sequence[step];

  // Fin de séquence → évaluation manuelle Raphaël
  if (!stepDef) {
    return {
      template: null,
      send_date: null,
      next_relance_date: null,
      days_since_due: 0,
      step,
    };
  }

  const dueDate = new Date(input.due_date);
  const delaiFact = input.delai_facturation_jours ?? 0;

  // Date d'envoi théorique = due_date + send_offset + delai_facturation_jours
  const sendTheorique = new Date(dueDate);
  sendTheorique.setDate(sendTheorique.getDate() + stepDef.send_offset + delaiFact);
  const sendReal = await nextBusinessDay(sendTheorique);

  // Date prochaine relance
  let nextRelanceISO: string | null = null;
  if (stepDef.next_offset !== null) {
    const next = new Date(dueDate);
    next.setDate(next.getDate() + stepDef.next_offset + delaiFact);
    const nextBusiness = await nextBusinessDay(next);
    nextRelanceISO = nextBusiness.toISOString().slice(0, 10);
  }

  const asOf = input.asOf ?? new Date();
  const daysSinceDue = Math.floor((asOf.getTime() - dueDate.getTime()) / 86400000) - delaiFact;

  return {
    template: stepDef.template,
    send_date: sendReal.toISOString().slice(0, 10),
    next_relance_date: nextRelanceISO,
    days_since_due: daysSinceDue,
    step,
  };
}

/** Variante non-async (sans jours fériés) — utile en preview UI / tests rapides. */
export function getNextTemplateSync(input: NextTemplateInput): Omit<NextTemplateResult, "send_date" | "next_relance_date"> & {
  send_date_theorique: string | null;
  next_relance_date_theorique: string | null;
} {
  const sequence = SEQUENCES[input.profil];
  const step = Math.max(0, input.sequence_step);
  const stepDef = sequence[step];
  if (!stepDef) {
    return {
      template: null,
      send_date_theorique: null,
      next_relance_date_theorique: null,
      days_since_due: 0,
      step,
    };
  }
  const dueDate = new Date(input.due_date);
  const delaiFact = input.delai_facturation_jours ?? 0;

  const send = new Date(dueDate);
  send.setDate(send.getDate() + stepDef.send_offset + delaiFact);

  let nextISO: string | null = null;
  if (stepDef.next_offset !== null) {
    const next = new Date(dueDate);
    next.setDate(next.getDate() + stepDef.next_offset + delaiFact);
    nextISO = next.toISOString().slice(0, 10);
  }

  const asOf = input.asOf ?? new Date();
  const daysSinceDue = Math.floor((asOf.getTime() - dueDate.getTime()) / 86400000) - delaiFact;

  return {
    template: stepDef.template,
    send_date_theorique: send.toISOString().slice(0, 10),
    next_relance_date_theorique: nextISO,
    days_since_due: daysSinceDue,
    step,
  };
}

/** Helper : convertit risk_category DB en RelanceProfil. */
export function profilFromRiskCategory(cat: string | null | undefined): RelanceProfil {
  if (cat === "fiable") return "stable";
  if (cat === "a_surveiller") return "a_surveiller";
  return "a_risque"; // par défaut le plus prudent
}
