import Link from "next/link";
import { DISTRICT } from "@config/district";
import { buttonClass } from "@/components/ui/Button";

const LOOP = ["Observe", "Detect", "Investigate", "Remember", "Act", "Learn"];

export default function Landing() {
  return (
    <div className="landing">
      <main className="landing__main">
        <div className="landing__brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="landing__district">{DISTRICT}</span>
        </div>
        <h1 className="landing__wordmark">STRATA</h1>
        <p className="landing__tagline">Detect problems before they become business losses.</p>
        <div className="landing__meta">
          <span>Arihant Chordia · Yogesh R Mehta</span>
          <span className="caption" style={{ maxWidth: "none", fontSize: "var(--fs-13)" }}>
            The Industry Games 2026 · built for Altygen Biopharm — Intelligent Business Operations &amp; Customer Engagement
          </span>
        </div>
        <ol className="loop" aria-label="Strata loop: Observe, Detect, Investigate, Remember, Act, Learn" style={{ listStyle: "none", paddingLeft: 0 }}>
          {LOOP.map((s) => (
            <li key={s} className="loop__node">
              <span className="loop__dot" aria-hidden="true" />
              <span className="loop__label">{s}</span>
            </li>
          ))}
        </ol>
        <div>
          <Link href="/app" className={buttonClass("primary")}>Enter Strata</Link>
        </div>
      </main>
      <footer className="landing__foot">Prototype with synthetic data. No real Altygen data is used.</footer>
    </div>
  );
}
