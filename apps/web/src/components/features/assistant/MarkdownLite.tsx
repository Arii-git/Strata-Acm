"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { AssistantCitation } from "./types";

/**
 * Markdown-lite for assistant replies: paragraphs, "- " / "1. " lists, **bold**, `code`, and [ID] citations.
 * Builds React elements only (no HTML injection). Cited IDs become small inline links when the engine
 * returned them as citations; anything else in brackets stays plain text.
 */
function inline(text: string, cites: Map<string, AssistantCitation>, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^[\]]{2,120}\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(<code key={k} className="ask-md__code">{tok.slice(1, -1)}</code>);
    } else {
      const ids = tok.slice(1, -1).split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
      if (ids.length && ids.every((id) => cites.has(id))) {
        out.push(
          <span key={k} className="ask-md__refs">
            {ids.map((id) => {
              const c = cites.get(id)!;
              return <Link key={id} href={c.href} className="ask-md__ref" title={c.label}>{id}</Link>;
            })}
          </span>,
        );
      } else {
        out.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ text, citations = [] }: { text: string; citations?: AssistantCitation[] }) {
  const cites = new Map(citations.map((c) => [c.id, c]));
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(" "), cites, k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, n) => <li key={n}>{inline(it, cites, `${k}-${n}`)}</li>);
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#+\s*/, ""));
      flushPara(); // chat style: a single newline starts a new short paragraph
    }
  }
  flushPara();
  flushList();
  return <div className="ask-md">{blocks}</div>;
}
