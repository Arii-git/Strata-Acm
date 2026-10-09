// Formatters. All numbers rendered in the UI should pass through one of these.
const MINUS = "−"; // typographic minus

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** ₹ with Indian compact units: ₹950, ₹12.5 K, ₹4.2 L, ₹1.3 Cr. `compact=false` → full Indian grouping. */
export function fmtINR(v: number | null | undefined, opts: { compact?: boolean; digits?: number } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const { compact = true, digits = 1 } = opts;
  const sign = v < 0 ? MINUS : "";
  const a = Math.abs(v);
  if (!compact) return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, digits)} Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, digits)} L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3, digits)} K`;
  return `${sign}₹${Math.round(a)}`;
}

/** Fraction → signed percent. -0.31 → "−31%", 0.05 → "+5%". `signed=false` → "31%". */
export function fmtPct(v: number | null | undefined, opts: { digits?: number; signed?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const { digits = 0, signed = true } = opts;
  const p = v * 100;
  const body = Math.abs(p).toFixed(digits);
  if (!signed) return `${p < 0 ? MINUS : ""}${body}%`;
  if (Number(body) === 0) return `0%`;
  return `${p < 0 ? MINUS : "+"}${body}%`;
}

/** Plain number with Indian grouping. */
export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return v < 0 ? `${MINUS}${s}` : s;
}

/** "9 Oct 2026" or, with time, "9 Oct 2026 09:00". Uses the ISO string's own clock (no TZ shifting for sim time). */
export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  if (!withTime) return date;
  return `${date} ${m[4] ?? "00"}:${m[5] ?? "00"}`;
}

/** Relative time vs `now` (default: wall clock; pass sim_now for simulated data). "3 h ago", "2 d ago". */
export function fmtAgo(iso: string | null | undefined, now: string | Date = new Date()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const n = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(t) || Number.isNaN(n)) return "—";
  const s = Math.round((n - t) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  let out: string;
  if (a < 60) out = `${a} s`;
  else if (a < 3600) out = `${Math.round(a / 60)} min`;
  else if (a < 86400) out = `${Math.round(a / 3600)} h`;
  else out = `${Math.round(a / 86400)} d`;
  return future ? `in ${out}` : `${out} ago`;
}

/** Seconds → "42 s", "3 min 10 s", "2 h 5 min". */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
  return `${Math.floor(s / 3600)} h${Math.round((s % 3600) / 60) ? ` ${Math.round((s % 3600) / 60)} min` : ""}`;
}

/** snake_case → "Snake case" for enum labels. */
export function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
