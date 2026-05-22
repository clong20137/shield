import React from 'react';

interface MentionTextProps {
  text: string;
  className?: string;
  mentionClassName?: string;
  onMentionClick?: (mention: string) => void;
}

const mentionPattern = /(^|\s)(@[a-zA-Z0-9._-]{2,80}(?:\s+[a-zA-Z][a-zA-Z0-9._-]{1,80})?)/gu;

export function MentionText({ text, className = '', mentionClassName = 'font-bold text-blue-600 underline underline-offset-2 dark:text-blue-300', onMentionClick }: MentionTextProps) {
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

    const mentionToken = mention.replace(/^@/u, '');
    parts.push(onMentionClick ? (
      <button
        key={`${mention}-${mentionStart}`}
        type="button"
        onClick={() => onMentionClick(mentionToken)}
        className={`${mentionClassName} inline p-0 text-left`}
      >
        {mention}
      </button>
    ) : (
      <span key={`${mention}-${mentionStart}`} className={mentionClassName}>
        {mention}
      </span>
    ));
    lastIndex = mentionStart + mention.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
