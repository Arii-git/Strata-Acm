"use client";

import { fmtINR } from "@/lib/format";

/** Account types in the synthetic dataset (accounts.type). Labels are plural, for the channel diagram. */
export const CHANNEL_TYPES: { key: string; label: string }[] = [
  { key: "chemist_chain", label: "Chemist chains" },
  { key: "hospital_pharmacy", label: "Hospital pharmacies" },
  { key: "nephrology_clinic", label: "Clinics (nephrology)" },
];
const STOCKIST = { key: "stockist", label: "Stockists" };

export interface ChannelBlastRow { account_id: string | number; exposure_value: number }

interface Box { key: string; label: string; x: number; y: number; w: number; h: number }

/**
 * Channel map: the client → stockists → chemist chains / hospital pharmacies / clinics (account TYPES only, no
 * individual accounts). The affected account's type is outlined and labelled; each type shows how many
 * blast-radius accounts are exposed and their baseline 12-week order value.
 */
export function ChannelMap({
  accountType, accountName, blast, typeById,
}: { accountType: string | null; accountName?: string | null; blast: ChannelBlastRow[]; typeById: Record<string, string> }) {
  const exposed: Record<string, { n: number; value: number }> = {};
  let unknown = 0;
  for (const b of blast) {
    const t = typeById[String(b.account_id)];
    if (!t) { unknown += 1; continue; }
    exposed[t] = exposed[t] ?? { n: 0, value: 0 };
    exposed[t].n += 1;
    exposed[t].value += b.exposure_value || 0;
  }
  const boxes: Box[] = [
    { key: "maker", label: "Manufacturer", x: 8, y: 96, w: 150, h: 60 },
    { key: STOCKIST.key, label: STOCKIST.label, x: 210, y: 96, w: 180, h: 60 },
    ...CHANNEL_TYPES.map((t, i) => ({ key: t.key, label: t.label, x: 460, y: 8 + i * 88, w: 252, h: 60 })),
  ];
  const by = Object.fromEntries(boxes.map((b) => [b.key, b]));
  const mid = (b: Box) => b.y + b.h / 2;
  const st = by[STOCKIST.key];
  const edges = [
    `M ${by.maker.x + by.maker.w} ${mid(by.maker)} H ${st.x}`,
    ...CHANNEL_TYPES.map((t) => `M ${st.x + st.w} ${mid(st)} H 425 V ${mid(by[t.key])} H ${by[t.key].x}`),
  ];
  const lineFor = (key: string): string[] => {
    if (key === "maker") return ["manufacturer"];
    const out: string[] = [];
    if (key === accountType) out.push(`Affected: ${accountName ? "this account" : "this case"}`);
    const e = exposed[key];
    if (e) out.push(`${e.n} more exposed · ${fmtINR(e.value)}`);
    if (!out.length) out.push("not exposed in this case");
    return out;
  };
  const totalExposed = blast.length;
  const typeLabel = [STOCKIST, ...CHANNEL_TYPES].find((t) => t.key === accountType)?.label;
  const summary = `${typeLabel ? `The affected account is one of the ${typeLabel.toLowerCase()}. ` : "This case is not tied to one account type. "}` +
    `${totalExposed} other account${totalExposed === 1 ? "" : "s"} exposed to the same cause: ` +
    ([STOCKIST, ...CHANNEL_TYPES].filter((t) => exposed[t.key]).map((t) => `${exposed[t.key].n} ${t.label.toLowerCase()}`).join(", ") || "none") +
    (unknown ? `; ${unknown} of unknown type` : "") + ".";

  return (
    <figure className="diagram channel" data-testid="diagram-channel">
      <svg viewBox="0 0 720 252" className="channel__svg" role="img" aria-label={`Channel map. ${summary}`}>
        <title>{`Channel map. ${summary}`}</title>
        {edges.map((d, i) => <path key={i} d={d} className="channel__edge" />)}
        {boxes.map((b) => {
          const affected = b.key === accountType;
          const isExposed = !!exposed[b.key];
          const cls = `channel__node${affected ? " channel__node--affected" : ""}${isExposed && !affected ? " channel__node--exposed" : ""}`;
          return (
            <g key={b.key}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} className={cls} />
              <text x={b.x + 10} y={b.y + 22} className="channel__label">{b.label}</text>
              {lineFor(b.key).map((l, i) => (
                <text key={i} x={b.x + 10} y={b.y + 38 + i * 15} className={`channel__sub${affected && i === 0 ? " channel__sub--strong" : ""}`}>{l}</text>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="caption">
        Channel map by account type (schematic). Thick outline + &quot;Affected&quot;: the type of the account in this case.
        Dashed outline: types with other accounts exposed to the same cause (blast radius), with their baseline 12-week order value (exposure, not a forecast).
        <span className="sr-only"> {summary}</span>
      </figcaption>
    </figure>
  );
}
