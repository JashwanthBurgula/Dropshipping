import * as React from "react";

export interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Safely highlights query terms inside `text` using React elements (`<mark>`).
 * Security: NEVER uses `dangerouslySetInnerHTML`.
 */
export function HighlightText({
  text,
  query,
  className,
}: HighlightTextProps) {
  const cleanQuery = query.trim();
  if (!cleanQuery || !text) {
    return <span className={className}>{text}</span>;
  }

  const tokens = Array.from(
    new Set(
      cleanQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).sort((a, b) => b.length - a.length);

  if (tokens.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  const tokenLowerSet = new Set(tokens.map((t) => t.toLowerCase()));

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        const isMatch = tokenLowerSet.has(part.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={`${idx}-${part}`}
              className="rounded-[2px] bg-amber/20 px-0.5 font-medium text-ink"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={`${idx}-${part}`}>{part}</React.Fragment>;
      })}
    </span>
  );
}
