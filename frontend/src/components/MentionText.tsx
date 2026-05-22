import React from 'react';

interface MentionTextProps {
  text: string;
  className?: string;
}

const mentionPattern = /(^|\s)(@[a-zA-Z0-9._-]{2,80})/gu;

export function MentionText({ text, className = '' }: MentionTextProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    const prefix = match[1];
    const mention = match[2];
    const mentionStart = match.index + prefix.length;

    if (mentionStart > lastIndex) {
      parts.push(text.slice(lastIndex, mentionStart));
    }

    parts.push(
      <span key={`${mention}-${mentionStart}`} className="font-bold text-accent">
        {mention}
      </span>,
    );
    lastIndex = mentionStart + mention.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
