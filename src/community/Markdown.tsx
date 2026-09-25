import type { ReactNode } from "react";
import { parseMarkdown } from "./markdown";
import type { Block, Inline } from "./markdown";

/**
 * Render a forum post. Everything the author typed reaches the page as a
 * React text node; the only elements are the handful the subset defines.
 */
export function Markdown({ source }: { source: string }) {
  return <div className="space-y-3 leading-relaxed break-words">{parseMarkdown(source).map(block)}</div>;
}

function block(b: Block, key: number): ReactNode {
  if (b.t === "quote") {
    return (
      <blockquote key={key} className="border-l-2 pl-3 space-y-2 text-white/65" style={{ borderColor: "var(--pl-accent-secondary)" }}>
        {b.c.map(block)}
      </blockquote>
    );
  }
  return <p key={key}>{b.c.map(inline)}</p>;
}

function inline(n: Inline, key: number): ReactNode {
  switch (n.t) {
    case "text": return n.v;
    case "br": return <br key={key} />;
    case "code": return <code key={key} className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[0.9em]">{n.v}</code>;
    case "strong": return <strong key={key} className="font-semibold text-white">{n.c.map(inline)}</strong>;
    case "em": return <em key={key}>{n.c.map(inline)}</em>;
    case "link":
      return (
        <a key={key} href={n.href} target="_blank" rel="noopener nofollow ugc" className="underline underline-offset-2" style={{ color: "var(--pl-accent-secondary)" }}>
          {n.c.map(inline)}
        </a>
      );
  }
}
