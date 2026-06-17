import React from 'react';

interface FormattedTextProps {
  text: string;
  className?: string;
}

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\+\+[^+]+\+\+)/gu;
const htmlPattern = /<\/?(p|div|br|strong|b|em|i|u|ul|ol|li|span|h1|h2|h3|blockquote|a|figure|img)\b[^>]*>/iu;
const internalLinkTargets = new Set([
  'account-preferences',
  'calendar',
  'messages',
  'dashboard',
  'devices',
  'reports',
  'search',
  'evaluations',
]);

function getSafeTextAlign(value: string | null): '' | 'left' | 'center' | 'right' {
  const cleanValue = (value || '').trim().toLowerCase();
  return cleanValue === 'left' || cleanValue === 'center' || cleanValue === 'right' ? cleanValue : '';
}

function getSafeExternalHref(value: string): string {
  const cleanValue = value.trim();
  return /^(https?:|mailto:)/iu.test(cleanValue) ? cleanValue : '';
}

function getSafeImageSrc(value: string): string {
  const cleanValue = value.trim();
  return cleanValue.startsWith('/uploads/dashboard-posts/') ? cleanValue : '';
}

function sanitizeFormattedHtml(html: string): string {
  if (typeof window === 'undefined' || !htmlPattern.test(html)) {
    return '';
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const allowedTags = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'SPAN', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'A', 'FIGURE', 'IMG']);

  const cleanNode = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(document.createTextNode(element.textContent || ''));
          return;
        }

        const textAlign = getSafeTextAlign(element.style.textAlign || element.getAttribute('align'));
        const href = element.tagName === 'A' ? element.getAttribute('href') || '' : '';
        const imageSrc = element.tagName === 'IMG' ? getSafeImageSrc(element.getAttribute('src') || '') : '';
        const imageAlt = element.tagName === 'IMG' ? (element.getAttribute('alt') || '').slice(0, 160) : '';
        const internalTarget = href.startsWith('shield://') ? href.replace('shield://', '').trim().toLowerCase() : '';
        const externalHref = element.tagName === 'A' ? getSafeExternalHref(href) : '';
        Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
        if (element.tagName === 'A') {
          if (internalLinkTargets.has(internalTarget)) {
            element.setAttribute('href', `shield://${internalTarget}`);
            element.setAttribute('data-shield-link', internalTarget);
          } else if (externalHref) {
            element.setAttribute('href', externalHref);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          } else {
            element.replaceWith(document.createTextNode(element.textContent || ''));
            return;
          }
        }
        if (element.tagName === 'IMG') {
          if (!imageSrc) {
            element.remove();
            return;
          }
          element.setAttribute('src', imageSrc);
          element.setAttribute('alt', imageAlt);
          element.setAttribute('loading', 'lazy');
        }
        if (textAlign) {
          element.style.textAlign = textAlign;
        }
        cleanNode(element);
      }
    });
  };

  cleanNode(document.body);
  return document.body.firstElementChild?.innerHTML || '';
}

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
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a[data-shield-link]') as HTMLAnchorElement | null;
    const target = anchor?.dataset.shieldLink;
    if (!target) {
      return;
    }

    event.preventDefault();
    window.dispatchEvent(new CustomEvent('shield:internal-link', { detail: { target } }));
  };

  const sanitizedHtml = sanitizeFormattedHtml(text);
  if (sanitizedHtml) {
    return (
      <div
        className={`formatted-content space-y-2 whitespace-normal ${className}`}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

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

  return <div className={`formatted-content space-y-2 whitespace-normal ${className}`}>{blocks}</div>;
}
