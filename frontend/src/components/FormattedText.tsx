import React from 'react';

interface FormattedTextProps {
  text: string;
  className?: string;
}

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\+\+[^+]+\+\+)/gu;

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    const key = `${value}-${match.index}`;

    if (value.startsWith('**') && value.endsWith('**')) {
      parts.push(<strong key={key}>{value.slice(2, -2)}</strong>);
    } else if (value.startsWith('*') && value.endsWith('*')) {
      parts.push(<em key={key}>{value.slice(1, -1)}</em>);
    } else if (value.startsWith('++') && value.endsWith('++')) {
      parts.push(<span key={key} className="underline decoration-2 underline-offset-2">{value.slice(2, -2)}</span>);
    }

    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function FormattedText({ text, className = '' }: FormattedTextProps) {
  const lines = text.split(/\r?\n/u);
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-3 list-disc space-y-1 pl-6">
        {listItems}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/u);
    if (listMatch) {
      listItems.push(<li key={`item-${index}`}>{renderInline(listMatch[1])}</li>);
      return;
    }

    flushList();

    if (!line.trim()) {
      blocks.push(<div key={`space-${index}`} className="h-3" />);
      return;
    }

    blocks.push(<p key={`line-${index}`}>{renderInline(line)}</p>);
  });

  flushList();

  return <div className={`space-y-2 whitespace-normal ${className}`}>{blocks}</div>;
}
