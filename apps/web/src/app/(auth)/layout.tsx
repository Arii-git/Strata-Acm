import Link from "next/link";
import "@/styles/lanes/auth.css";

/** Minimal centred frame for register / forgot / verify. Providers come from the root layout. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <header className="auth-shell__top">
        <Link href="/" className="auth-shell__brand" aria-label="STRATA home">
          <span className="brand-mark" aria-hidden="true" />
          <span>STRATA</span>
        </Link>
        <span className="chip chip--synthetic" title="All data in this prototype is synthetic">SYNTHETIC DATA</span>
      </header>
      <main id="main" className="auth-shell__main">{children}</main>
      <footer className="auth-shell__foot">Arihant Chordia · Yogesh R Mehta · The Industry Games 2026</footer>
    </div>
  );
}
