/** Denda per hari telat — default; tarif aktual dari library_settings.fine_per_day. */
export const FINE_PER_DAY = 1000;

export function calcFine(
  dueDate: string | Date,
  returnDate: string | Date = new Date(),
  rate: number = FINE_PER_DAY
): number {
  const due = new Date(dueDate);
  const ret = new Date(returnDate);
  due.setHours(0, 0, 0, 0);
  ret.setHours(0, 0, 0, 0);
  const diffMs = ret.getTime() - due.getTime();
  const lateDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const perDay = Number.isFinite(rate) && rate > 0 ? rate : FINE_PER_DAY;
  return lateDays > 0 ? lateDays * perDay : 0;
}

export function addDaysISO(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
