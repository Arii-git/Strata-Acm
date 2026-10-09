"use client";

import { fmtINR, fmtNum } from "@/lib/format";

export interface RegionTile { name: string; accounts: number; value_12w: number; exposed?: number }

/**
 * Schematic region tiles (not a geographic map): one tile per sales region with its account count and
 * baseline 12-week order value. The affected region is outlined and labelled in text.
 */
export function RegionTileMap({ regions, affected }: { regions: RegionTile[]; affected: string | null }) {
  const sorted = [...regions].sort((a, b) => a.name.localeCompare(b.name));
  const summary = `${sorted.length} regions. Affected: ${affected ?? "none"}.` +
    (affected ? ` ${fmtNum(sorted.find((r) => r.name === affected)?.accounts ?? 0)} accounts in ${affected}.` : "");
  return (
    <figure className="diagram region-map" data-testid="diagram-region">
      <ul className="region-map__grid" aria-label={`Region tiles. ${summary}`}>
        {sorted.map((r) => {
          const hit = r.name === affected;
          return (
            <li key={r.name} className={`region-map__tile${hit ? " region-map__tile--affected" : ""}`}>
              <b>{r.name}</b>
              <span className="caption">{fmtNum(r.accounts)} accounts · {fmtINR(r.value_12w)} / 12 wk</span>
              {hit ? <span className="region-map__flag">Affected region{r.exposed != null ? `: ${fmtNum(r.exposed)} accounts exposed` : ""}</span> : <span className="caption">not affected</span>}
            </li>
          );
        })}
      </ul>
      <figcaption className="caption">
        Schematic tiles, not geographic: tile positions are alphabetical and do not show where regions lie. Values are baseline 12-week order value (exposure, not a forecast).
      </figcaption>
    </figure>
  );
}
