import React from 'react';
import type { LegalSection } from '@/components/legal/LegalShell';

// Lightweight markdown renderer scoped to what CMS `body` fields actually
// contain: H1 (page title, dropped), H2 (section headings), paragraphs,
// bullet lists, and inline **bold** / *italic* / [text](href). Avoids pulling
// react-markdown + remark into the bundle just for policy pages.

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Inline formatting pass — handles **bold**, *italic*, [text](href) in order.
// Returns a React fragment (or a plain string when no tokens were found).
function inline(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`b${m.index}`} className="text-ink font-semibold">{m[1]}</strong>);
    else if (m[2]) out.push(<em key={`i${m.index}`}>{m[2]}</em>);
    else if (m[3] && m[4]) out.push(
      <a key={`a${m.index}`} href={m[4]} className="underline underline-offset-2 text-ink hover:text-maroon-deep">{m[3]}</a>,
    );
    last = regex.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length <= 1 ? (out[0] ?? text) : <>{out}</>;
}

// Render a chunk of text as a stack of paragraphs / bullet lists. Blank
// lines separate blocks; a block whose every line starts with `- ` or `* `
// becomes a <ul>.
function renderBlocks(src: string): React.ReactNode[] {
  const blocks = src.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b, i) => {
    const lines = b.split('\n');
    const isList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isList) {
      return (
        <ul key={i} className="list-disc pl-5 space-y-1.5">
          {lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{inline(lines.join(' '))}</p>;
  });
}

export type ParsedCmsBody = {
  intro: React.ReactNode | null;
  sections: LegalSection[];
};

// Split a CMS body into an optional intro (everything before the first H2)
// and one LegalSection per `## heading` block. The opening H1 is stripped
// since the page shell already renders its own title.
export function parseCmsBody(body: string): ParsedCmsBody {
  const stripped = body.replace(/^\s*#\s+[^\n]*\n+/, '');
  const chunks = stripped.split(/^##\s+/m);
  const introText = (chunks[0] ?? '').trim();
  const sections: LegalSection[] = [];
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const rest = nl === -1 ? '' : chunk.slice(nl + 1).trim();
    sections.push({
      id: slug(title),
      title,
      body: <>{renderBlocks(rest)}</>,
    });
  }
  return {
    intro: introText ? <div className="space-y-3">{renderBlocks(introText)}</div> : null,
    sections,
  };
}

// Admin seeds every CMS page with a stub ending in "TODO: supply full
// policy text." — treat those as empty so pages fall back to the shipped
// hardcoded copy until an author replaces the stub.
export function isStubBody(body: string | null | undefined): boolean {
  const s = (body || '').trim();
  return !s || /TODO:\s*supply/i.test(s);
}
