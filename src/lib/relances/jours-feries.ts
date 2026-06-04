/**
 * Jours fériés français — API officielle calendrier.api.gouv.fr.
 *
 * Cache en mémoire par année (cold-start friendly).
 * On ne fait au max qu'un appel par année et par instance.
 */

const cache = new Map<number, Set<string>>();

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function fetchFeries(year: number): Promise<Set<string>> {
  try {
    const r = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`);
    if (!r.ok) return new Set();
    const json = (await r.json()) as Record<string, string>;
    return new Set(Object.keys(json));
  } catch {
    return new Set();
  }
}

export async function getFeries(year: number): Promise<Set<string>> {
  if (!cache.has(year)) {
    cache.set(year, await fetchFeries(year));
  }
  return cache.get(year)!;
}

export async function isWorkingDay(d: Date): Promise<boolean> {
  const day = d.getDay();
  if (day === 0 || day === 6) return false; // dimanche ou samedi
  const feries = await getFeries(d.getFullYear());
  return !feries.has(isoDate(d));
}

/** Décale la date au prochain jour ouvré (inclusif). */
export async function nextBusinessDay(d: Date): Promise<Date> {
  const out = new Date(d);
  // Limite de sécurité : 30 itérations max (jamais plus d'une semaine de décalage)
  for (let i = 0; i < 30; i++) {
    if (await isWorkingDay(out)) return out;
    out.setDate(out.getDate() + 1);
  }
  return out;
}
