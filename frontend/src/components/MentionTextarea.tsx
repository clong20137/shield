import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { User, userService } from '../services/api';

type MentionTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

function getMentionQuery(value: string, cursor: number) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9._-]{0,80})$/u);
  if (!match) return null;

  return {
    token: match[2],
    start: cursor - match[2].length - 1,
  };
}

function getMentionLabel(user: User) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.peNumber || 'User';
}

function getMentionValue(user: User) {
  const nameToken = `${user.firstName || ''}${user.lastName || ''}`.replace(/[^a-zA-Z0-9._-]/gu, '');
  return nameToken || (user.email || '').split('@')[0] || user.peNumber || 'user';
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(
  { value, onChange, className = '', onKeyDown, onBlur, ...props },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [results, setResults] = useState<User[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  const closeResults = () => {
    setResults([]);
    setMentionStart(null);
    setIsSearching(false);
  };

  const loadMentionResults = (nextValue: string, cursor: number) => {
    const mention = getMentionQuery(nextValue, cursor);
    if (!mention) {
      closeResults();
      return;
    }

    setMentionStart(mention.start);
    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    if (mention.token.length === 0) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await userService.search(mention.token);
        setResults(response.data.slice(0, 6));
      } catch (error) {
        console.error('Mention search failed:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 180);
  };

  const insertMention = (user: User) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStart === null) return;

    const cursor = textarea.selectionStart;
    const mentionText = `@${getMentionValue(user)} `;
    const nextValue = `${value.slice(0, mentionStart)}${mentionText}${value.slice(cursor)}`;
    const nextCursor = mentionStart + mentionText.length;

    onChange(nextValue);
    closeResults();
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  return (
    <div className="relative w-full flex-1">
      <textarea
        {...props}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          loadMentionResults(event.target.value, event.target.selectionStart);
        }}
        onKeyUp={(event) => loadMentionResults(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          window.setTimeout(closeResults, 150);
          onBlur?.(event);
        }}
        className={className}
      />
      {(results.length > 0 || isSearching) && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 overflow-hidden rounded border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          {isSearching && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Searching users...</div>
          ) : results.map((user) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(user);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span className="font-bold text-gray-800 dark:text-gray-100">{getMentionLabel(user)}</span>
              <span className="truncate text-xs text-gray-500 dark:text-gray-400">{user.rank || user.email || user.peNumber}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
