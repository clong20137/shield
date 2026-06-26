import React, { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Heading, Image, Indent, Italic, Link2, List, ListOrdered, Outdent, Pilcrow, Quote, Underline, X } from 'lucide-react';

const postHtmlPattern = /<\/?(p|div|br|strong|b|em|i|u|ul|ol|li|span|h1|h2|h3|h4|h5|h6|blockquote|a|figure|img)\b[^>]*>/iu;
const headingStyleOptions = [
  { value: 'h1', label: 'H1' },
  { value: 'h2', label: 'H2' },
  { value: 'h3', label: 'H3' },
  { value: 'h4', label: 'H4' },
  { value: 'h5', label: 'H5' },
  { value: 'h6', label: 'H6' },
];
const internalPostLinks = [
  { value: 'account-preferences', label: 'Account Preferences' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'messages', label: 'Messages' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'devices', label: 'Devices' },
  { value: 'reports', label: 'Reports' },
  { value: 'search', label: 'Search' },
  { value: 'evaluations', label: 'Evaluations' },
];

const escapePostHtml = (value: string) =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');

export function getPostBodyText(value: string): string {
  if (!postHtmlPattern.test(value)) {
    return value.trim();
  }

  const container = document.createElement('div');
  container.innerHTML = value;
  return (container.textContent || '').trim();
}

export function RichPostEditor({
  value,
  onChange,
  onImageUpload,
}: {
  value: string;
  onChange: (value: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [isUploadingInlineImage, setIsUploadingInlineImage] = useState(false);
  const [linkType, setLinkType] = useState<'internal' | 'external'>('external');
  const [isHeadingMenuOpen, setIsHeadingMenuOpen] = useState(false);
  const [internalLinkTarget, setInternalLinkTarget] = useState(internalPostLinks[0]?.value || '');
  const [externalLinkUrl, setExternalLinkUrl] = useState('');
  const savedLinkRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const runCommand = (command: string, commandValue = '') => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  };

  const applyBlockStyle = (block: string) => {
    runCommand('formatBlock', block);
    setIsHeadingMenuOpen(false);
  };

  const getCurrentEditorRange = () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editorRef.current) {
      return null;
    }

    const containsStart = editorRef.current.contains(range.startContainer);
    const containsEnd = editorRef.current.contains(range.endContainer);
    return containsStart && containsEnd ? range : null;
  };

  const restoreSavedLinkRange = () => {
    const range = savedLinkRangeRef.current;
    if (!range) {
      return null;
    }

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
  };

  const openLinkPopover = () => {
    const range = getCurrentEditorRange();
    savedLinkRangeRef.current = range ? range.cloneRange() : null;
    setIsLinkPopoverOpen(true);
  };

  const closeLinkPopover = () => {
    setIsLinkPopoverOpen(false);
    savedLinkRangeRef.current = null;
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) {
      return;
    }

    const anchorNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element);

    const listItem = anchorNode?.closest?.('li');
    if (!listItem || !editorRef.current.contains(listItem)) {
      return;
    }

    event.preventDefault();
    runCommand(event.shiftKey ? 'outdent' : 'indent');
  };

  const getNormalizedExternalUrl = () => {
    const trimmedUrl = externalLinkUrl.trim();
    if (!trimmedUrl) {
      return '';
    }

    return /^(https?:|mailto:)/iu.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
  };

  const applyLink = () => {
    if (!editorRef.current) {
      return;
    }

    const selectedInternalLink = internalPostLinks.find((item) => item.value === internalLinkTarget);
    const href = linkType === 'internal' && selectedInternalLink
      ? `shield://${selectedInternalLink.value}`
      : getNormalizedExternalUrl();

    if (!href) {
      return;
    }

    editorRef.current.focus();
    const range = restoreSavedLinkRange() || getCurrentEditorRange();
    const selection = window.getSelection();
    if (range && selection?.rangeCount && !selection.isCollapsed) {
      document.execCommand('createLink', false, href);
    } else {
      const label = linkType === 'internal' && selectedInternalLink ? selectedInternalLink.label : href;
      document.execCommand('insertHTML', false, `<a href="${escapePostHtml(href)}">${escapePostHtml(label)}</a>`);
    }
    onChange(editorRef.current.innerHTML || '');
    closeLinkPopover();
  };

  const insertInlineImage = async (file: File) => {
    if (!onImageUpload || !editorRef.current) {
      return;
    }

    setIsUploadingInlineImage(true);
    try {
      const imageUrl = await onImageUpload(file);
      editorRef.current.focus();
      document.execCommand(
        'insertHTML',
        false,
        `<figure><img src="${escapePostHtml(imageUrl)}" alt="" /></figure><p><br></p>`,
      );
      onChange(editorRef.current.innerHTML || '');
    } finally {
      setIsUploadingInlineImage(false);
    }
  };

  const preserveEditorFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div>
      <div className="relative mb-2">
        <div className="flex flex-nowrap items-center gap-1.5 rounded border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-800 dark:bg-gray-950 [&>button]:shrink-0 [&>div]:shrink-0">
          <button
            type="button"
            onMouseDown={preserveEditorFocus}
            onClick={() => applyBlockStyle('p')}
            className="btn-secondary"
            aria-label="Apply paragraph"
            title="Paragraph"
          >
            <Pilcrow size={16} />
          </button>
          <div className="relative">
            <button
              type="button"
              onMouseDown={preserveEditorFocus}
              onClick={() => setIsHeadingMenuOpen((isOpen) => !isOpen)}
              className="btn-secondary"
              aria-label="Choose heading style"
              title="Heading"
            >
              <Heading size={16} />
              <ChevronDown size={14} />
            </button>
            {isHeadingMenuOpen && (
              <div className="absolute left-0 top-11 z-30 grid w-28 gap-1 rounded border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-950">
                {headingStyleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onMouseDown={preserveEditorFocus}
                    onClick={() => applyBlockStyle(option.value)}
                    className="rounded px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label={`Apply heading ${option.label}`}
                    title={option.label}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('bold')} className="btn-secondary" aria-label="Bold selected text" title="Bold">
          <Bold size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('italic')} className="btn-secondary" aria-label="Italicize selected text" title="Italic">
          <Italic size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('underline')} className="btn-secondary" aria-label="Underline selected text" title="Underline">
          <Underline size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyLeft')} className="btn-secondary" aria-label="Align text left" title="Align Left">
          <AlignLeft size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyCenter')} className="btn-secondary" aria-label="Align text center" title="Align Center">
          <AlignCenter size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyRight')} className="btn-secondary" aria-label="Align text right" title="Align Right">
          <AlignRight size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('insertUnorderedList')} className="btn-secondary" aria-label="Add bulleted list" title="Bulleted List">
          <List size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('insertOrderedList')} className="btn-secondary" aria-label="Add numbered list" title="Numbered List">
          <ListOrdered size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('outdent')} className="btn-secondary" aria-label="Outdent text" title="Outdent">
          <Outdent size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('indent')} className="btn-secondary" aria-label="Indent text" title="Indent">
          <Indent size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => applyBlockStyle('blockquote')} className="btn-secondary" aria-label="Apply quote style" title="Quote">
          <Quote size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            openLinkPopover();
          }}
          className="btn-secondary"
          aria-label="Add link to selected text"
          title="Link"
        >
          <Link2 size={16} />
        </button>
        {onImageUpload && (
          <>
            <button
              type="button"
              onMouseDown={preserveEditorFocus}
              onClick={() => imageInputRef.current?.click()}
              className="btn-secondary"
              disabled={isUploadingInlineImage}
              aria-label="Insert image into story"
              title={isUploadingInlineImage ? 'Uploading Image' : 'Insert Image'}
            >
              <Image size={16} />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              disabled={isUploadingInlineImage}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                  void insertInlineImage(file);
                }
              }}
            />
          </>
        )}
      </div>
      {isLinkPopoverOpen && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(32rem,calc(100vw-2rem))] rounded border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-3 inline-flex rounded border border-gray-200 bg-gray-50 p-1 text-sm font-semibold dark:border-gray-800 dark:bg-gray-900">
            <button
              type="button"
              onMouseDown={preserveEditorFocus}
              onClick={() => setLinkType('external')}
              className={`rounded px-3 py-1.5 transition ${linkType === 'external' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}
            >
              External
            </button>
            <button
              type="button"
              onMouseDown={preserveEditorFocus}
              onClick={() => setLinkType('internal')}
              className={`rounded px-3 py-1.5 transition ${linkType === 'internal' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}
            >
              Internal
            </button>
          </div>
          {linkType === 'external' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">External link</span>
              <input
                value={externalLinkUrl}
                onChange={(event) => setExternalLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://example.com"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                autoFocus
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Internal link</span>
              <select
                value={internalLinkTarget}
                onChange={(event) => setInternalLinkTarget(event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {internalPostLinks.map((link) => (
                  <option key={link.value} value={link.value}>{link.label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onMouseDown={preserveEditorFocus} onClick={closeLinkPopover} className="btn-secondary">
              <X size={16} />
              <span>Cancel</span>
            </button>
            <button type="button" onMouseDown={preserveEditorFocus} onClick={applyLink} className="btn-primary">
              <Link2 size={16} />
              <span>Apply Link</span>
            </button>
          </div>
        </div>
      )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        role="textbox"
        aria-multiline="true"
        onKeyDown={handleEditorKeyDown}
        onClick={() => editorRef.current?.focus()}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onChange(event.currentTarget.innerHTML)}
        className="rich-post-editor min-h-64 w-full overflow-y-auto rounded border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
        data-placeholder="Write the update. Highlight text and use the toolbar, or click a style before typing."
      />
    </div>
  );
}
