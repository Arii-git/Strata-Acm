import type { Provenance } from "@/lib/api/types";
import { ProvenanceBadge } from "./Caption";

/** Every page starts with the question it answers. */
export function PageHeader({ question, title, children }: { question: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__question">{question}</p>
      </div>
      {children ? <div className="page-header__actions">{children}</div> : null}
    </header>
  );
}

export type CardProps = {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  provenance?: Provenance;
  flush?: boolean;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">;

export function Card({ title, actions, provenance, flush, children, className, ...rest }: CardProps) {
  return (
    <section className={["card", flush ? "card--flush" : "", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {title || actions || provenance ? (
        <div className="card__head">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          <div className="row">
            {actions}
            {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
