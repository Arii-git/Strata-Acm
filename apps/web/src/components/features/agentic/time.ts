/**
 * Sim-clock time helpers. The engine sends ISO strings with their own offset (e.g. +05:30); we show the wall time
 * in that offset so the UI and the engine's own sentences ("decide by 09 Oct 17:00") always agree.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function simClockText(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const hhmm = `${m[4]}:${m[5]}`;
  return withDate ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${hhmm}` : hhmm;
}

/** "3h 20m", "2d 4h", "45m". */
export function spanText(ms: number): string {
  const mins = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
