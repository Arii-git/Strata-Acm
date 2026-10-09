import "@/styles/lanes/agentic.css";
import { LEVEL_LABEL, LEVELS, asLevel, type RiskLevel } from "./types";

/**
 * Risk level 1-5: five small segments filled up to the level, plus the text "L3 · Elevated".
 * Colour comes from the severity tokens; the text and the filled-segment count carry the meaning (never colour alone).
 */
export function RiskLevelBadge({ level, compact = false }: { level: RiskLevel; compact?: boolean }) {
  const lv = asLevel(level);
  const label = LEVEL_LABEL[lv];
  return (
    <span className={`rl rl--${lv}${compact ? " rl--compact" : ""}`} title={`Risk level ${lv} of 5: ${label}`}>
      <span className="rl__bars" aria-hidden="true">
        {LEVELS.map((n) => <span key={n} className={`rl__bar${n <= lv ? " rl__bar--on" : ""}`} />)}
      </span>
      <span className="rl__text">
        <span className="sr-only">Risk level </span>L{lv}{compact ? null : <> · {label}</>}
        {compact ? <span className="sr-only">, {label}</span> : null}
      </span>
    </span>
  );
}
