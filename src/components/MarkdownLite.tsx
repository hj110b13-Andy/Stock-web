import type { ReactNode } from "react";

/**
 * Renders the small subset of Markdown the AI chat/brief actually produces
 * (bold `**text**`, `*`/`-` bullet lines, blank-line paragraph breaks) as
 * real HTML instead of literal asterisks. Not a general Markdown parser —
 * a full library (react-markdown + remark) would be overkill for output
 * this constrained, and this project prefers small hand-rolled formatting
 * (see lib/format.ts) over pulling in a parsing ecosystem for one text
 * style. Unrecognized syntax just passes through as plain text, which is a
 * safe degradation.
 */
export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-0.5 pl-4">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((line, i) => {
    const bulletMatch = line.match(/^\s*[*-]\s+(.*)/);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]);
      return;
    }
    flushList();
    if (line.trim() === "") {
      if (i > 0 && i < lines.length - 1) blocks.push(<div key={`sp-${i}`} className="h-2" />);
    } else {
      blocks.push(<p key={`p-${i}`}>{renderInline(line)}</p>);
    }
  });
  flushList();

  return <>{blocks}</>;
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
