import { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Plus, Search, Send, Users, X } from 'lucide-react';
import { MentionTextarea } from '../MentionTextarea';
import type { ToastType } from '../ToastHost';
import { AuthAccount, errorLogService, getAssetThumbnailUrl, getAssetUrl, getMessageEventsUrl, handleAssetThumbnailError, messageService, User, UserMessage, userService } from '../../services/api';

export interface RecentConversation {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  threadType: string;
  directParticipantId: string;
  directLastSeenAt: string | null;
  threadParticipantIds: string[];
  latestMessage?: UserMessage;
  unreadPreview: string;
  unreadCount: number;
  unreadMessageIds: string[];
}

type RecentPresenceStatus = 'active' | 'away' | 'busy';
interface RecentPresenceState {
  online: boolean;
  away: boolean;
  status: RecentPresenceStatus;
  lastSeenAt: string | null;
}

interface RecentTypingState {
  name: string;
  expiresAt: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
  ) {
    return (error as { response: { data: { error: string } } }).response.data.error;
  }

  return fallback;
}

function getInitials(name?: string, email?: string): string {
  const source = name?.trim() || email?.trim() || 'Blueline User';
  const parts = source.split(/\s+/u).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function parseRecentConversationList(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeRecentConversationSubject(value?: string | null): string {
  const subject = value?.trim();
  return subject && subject.toLowerCase() !== 'message' ? subject : '';
}

function getRecentConversationId(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct' && message.threadId) {
    return message.threadId;
  }

  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function getRecentConversationTitle(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    const participantNames = parseRecentConversationList(message.threadParticipantNames).filter((name) => name !== 'You');
    return message.threadTitle || participantNames.join(', ') || (message.threadType === 'district' ? 'District Message' : 'Group Message');
  }

  if (message.senderAccountId === currentUserId) {
    return message.recipientName || message.recipientEmail || 'Recipient';
  }

  return message.senderName || message.senderEmail || 'Sender';
}

function getRecentConversationImage(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    return message.threadImageUrl || '';
  }

  return message.senderAccountId === currentUserId
    ? message.recipientProfilePictureUrl || ''
    : message.senderProfilePictureUrl || '';
}

function getRecentConversationDirectParticipantId(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    return '';
  }

  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function getRecentConversationParticipantIds(message: UserMessage, currentUserId: string): string[] {
  const ids = parseRecentConversationList(message.threadParticipantIds)
    .filter((id) => id && id !== currentUserId);

  if (ids.length > 0) {
    return Array.from(new Set(ids));
  }

  return [getRecentConversationDirectParticipantId(message, currentUserId)].filter(Boolean);
}

function getRecentConversationDirectLastSeenAt(message: UserMessage, currentUserId: string): string | null {
  if (message.threadType && message.threadType !== 'direct') {
    return null;
  }

  return message.senderAccountId === currentUserId
    ? message.recipientLastSeenAt || null
    : message.senderLastSeenAt || null;
}

function getRecentConversationSubtitle(message: UserMessage, currentUserId: string): string {
  const prefix = message.senderAccountId === currentUserId ? 'You: ' : '';
  const deletedText = message.isDeleted ? 'Message deleted' : '';
  const bodyText = deletedText || message.body || normalizeRecentConversationSubject(message.subject) || 'No preview';
  return `${prefix}${bodyText}`.replace(/\s+/gu, ' ').trim();
}

function buildRecentConversations(messages: UserMessage[], currentUserId: string): RecentConversation[] {
  const threadMap = new Map<string, RecentConversation>();
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  sortedMessages.forEach((message) => {
    const id = getRecentConversationId(message, currentUserId);
    if (!id) {
      return;
    }

    const existingConversation = threadMap.get(id);
    const unreadIncrement = message.recipientUserId === currentUserId && !message.isRead ? 1 : 0;
    const subtitle = getRecentConversationSubtitle(message, currentUserId);
    const unreadMessageIds = unreadIncrement > 0
      ? [...(existingConversation?.unreadMessageIds || []), message.id]
      : existingConversation?.unreadMessageIds || [];
    const nextConversation: RecentConversation = {
      id,
      title: getRecentConversationTitle(message, currentUserId),
      subtitle,
      imageUrl: getRecentConversationImage(message, currentUserId),
      threadType: message.threadType || 'direct',
      directParticipantId: getRecentConversationDirectParticipantId(message, currentUserId),
      directLastSeenAt: getRecentConversationDirectLastSeenAt(message, currentUserId),
      threadParticipantIds: getRecentConversationParticipantIds(message, currentUserId),
      latestMessage: message,
      unreadPreview: unreadIncrement > 0 ? subtitle : existingConversation?.unreadPreview || '',
      unreadCount: (existingConversation?.unreadCount || 0) + unreadIncrement,
      unreadMessageIds,
    };
    threadMap.set(id, nextConversation);
  });

  return Array.from(threadMap.values())
    .sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }

      return new Date(b.latestMessage?.createdAt || 0).getTime() - new Date(a.latestMessage?.createdAt || 0).getTime();
    })
    .slice(0, 5);
}

function isRecentConversationOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  return !Number.isNaN(value) && Date.now() - value < 2 * 60 * 1000;
}

function isRecentConversationAway(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  if (Number.isNaN(value)) {
    return false;
  }

  const diff = Date.now() - value;
  return diff >= 2 * 60 * 1000 && diff < 5 * 60 * 1000;
}

function getRecentConversationPresence(
  conversation: RecentConversation,
  presenceByAccount: Record<string, RecentPresenceState>,
) {
  const realtime = conversation.directParticipantId ? presenceByAccount[conversation.directParticipantId] : null;
  const online = realtime ? realtime.online : isRecentConversationOnline(conversation.directLastSeenAt);
  const away = realtime ? realtime.away : !online && isRecentConversationAway(conversation.directLastSeenAt);
  const status = realtime?.status || (away ? 'away' : online ? 'active' : 'active');

  if (realtime && status === 'busy') {
    return {
      label: 'Busy',
      dotClass: 'bg-red-500',
      ringClass: 'ring-red-300/70 shadow-[0_0_0_1px_rgba(239,68,68,0.18)]',
      pulseClass: 'border-red-300/50',
      showPulse: true,
    };
  }

  if ((realtime && status === 'away') || away) {
    return {
      label: 'Away',
      dotClass: 'bg-amber-400',
      ringClass: 'ring-amber-300/80 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]',
      pulseClass: 'border-amber-300/70',
      showPulse: true,
    };
  }

  if (online) {
    return {
      label: 'Active',
      dotClass: 'bg-green-500',
      ringClass: 'ring-green-400/60 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]',
      pulseClass: 'border-green-400/45',
      showPulse: true,
    };
  }

  return {
    label: 'Offline',
    dotClass: 'bg-gray-400',
    ringClass: 'ring-gray-300/60 dark:ring-gray-600/60',
    pulseClass: '',
    showPulse: false,
  };
}

function getRelativeActivityText(lastSeenAt: string | null): string {
  if (!lastSeenAt) {
    return 'Not seen recently';
  }

  const seenAt = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenAt)) {
    return 'Not seen recently';
  }

  const diffMs = Date.now() - seenAt;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(lastSeenAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function getRecentConversationActivityText(
  conversation: RecentConversation,
  presence: {
    label: string;
    dotClass: string;
  } | null,
) {
  if (!conversation.directParticipantId || !presence) {
    return conversation.threadType === 'direct' ? 'Direct message' : 'Group conversation';
  }

  if (presence.label === 'Active' || presence.label === 'Busy') {
    return presence.label;
  }

  if (presence.label === 'Away' && conversation.directLastSeenAt) {
    return `Away - ${getRelativeActivityText(conversation.directLastSeenAt)}`;
  }

  return conversation.directLastSeenAt
    ? `${presence.label} - ${getRelativeActivityText(conversation.directLastSeenAt)}`
    : presence.label;
}

function RecentConversationsDock({
  conversations,
  isCollapsed,
  currentUser,
  quickReplyConversationId,
  presenceByAccount,
  typingByConversation,
  onOpenConversation,
  onMarkRead,
  onReply,
  onQuickReplyClose,
  onQuickReplySent,
  onCompose,
  onToggleCollapsed,
  onToast,
}: {
  conversations: RecentConversation[];
  isCollapsed: boolean;
  currentUser: AuthAccount | null;
  quickReplyConversationId: string | null;
  presenceByAccount: Record<string, RecentPresenceState>;
  typingByConversation: Record<string, RecentTypingState>;
  onOpenConversation: (conversation: RecentConversation) => void;
  onMarkRead: (conversation: RecentConversation) => void;
  onReply: (conversation: RecentConversation) => void;
  onQuickReplyClose: () => void;
  onQuickReplySent: (conversation: RecentConversation) => void;
  onCompose: () => void;
  onToggleCollapsed: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversation: RecentConversation } | null>(null);
  const [conversationImageLoadFailed, setConversationImageLoadFailed] = useState<Record<string, boolean>>({});

  const openContextMenu = (event: ReactMouseEvent, conversation: RecentConversation) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 180),
      conversation,
    });
  };

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  return (
    <aside
      className="pointer-events-none fixed bottom-5 right-5 z-40 hidden flex-col items-end gap-2 md:flex"
      aria-label={isCollapsed ? 'Recent conversations collapsed' : 'Recent conversations'}
    >
      <div
        data-no-global-context-menu="true"
        className={`pointer-events-auto theme-polished-surface flex flex-col items-center overflow-visible rounded-full border border-white/25 bg-white/70 shadow-2xl shadow-black/10 backdrop-blur-xl transition-all duration-300 ease-out dark:border-white/10 dark:bg-slate-900/70 ${
          isCollapsed ? 'max-h-[3.25rem] gap-0 p-1.5' : 'max-h-[28rem] gap-2 p-2'
        }`}
      >
        <button
          type="button"
          onClick={onCompose}
          tabIndex={isCollapsed ? -1 : 0}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-all duration-300 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            isCollapsed ? 'pointer-events-none -mb-11 translate-y-6 scale-75 opacity-0' : 'mb-0 translate-y-0 scale-100 opacity-100'
          }`}
          aria-label="Start new message"
          title="New Message"
          aria-hidden={isCollapsed}
        >
          <Plus size={22} />
        </button>
        {conversations.map((conversation) => {
          const typing = typingByConversation[conversation.id];
          const previewText = conversation.unreadPreview || conversation.subtitle || 'New message';
          const isQuickReplyOpen = quickReplyConversationId === conversation.id;
          const shouldShowPreview = conversation.unreadCount > 0 && !isQuickReplyOpen;
          const presence = conversation.threadType === 'direct'
            ? getRecentConversationPresence(conversation, presenceByAccount)
            : null;
          const activityText = getRecentConversationActivityText(conversation, presence);
          return (
            <div
              key={conversation.id}
              className={`group/recent relative flex items-center transition-all duration-300 ease-out ${
                isCollapsed ? 'pointer-events-none -mb-12 translate-y-8 scale-75 opacity-0' : 'mb-0 translate-y-0 scale-100 opacity-100'
              }`}
              aria-hidden={isCollapsed}
              onContextMenu={(event) => openContextMenu(event, conversation)}
            >
              {shouldShowPreview && (
                <button
                  type="button"
                  onClick={() => onReply(conversation)}
                  tabIndex={isCollapsed ? -1 : 0}
                  className="recent-message-preview-pop recent-message-preview-pop--arrow recent-message-preview-pop--modern absolute right-14 z-20 w-64 rounded-2xl px-4 py-2 text-left backdrop-blur-xl transition duration-200 hover:scale-[1.03] hover:-translate-x-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.3)]"
                  aria-label={`Reply to latest message from ${conversation.title}`}
                >
                  <span className="block truncate text-xs font-black text-primary-500 dark:text-blue-100">{conversation.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <span className="truncate">{previewText}</span>
                  </span>
                  {presence && (
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${presence.dotClass}`} />
                      <span className="truncate">{activityText}</span>
                    </span>
                  )}
                  {!presence && activityText && (
                    <span className="mt-1 block truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">{activityText}</span>
                  )}
                  <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-accent">Quick reply</span>
                </button>
              )}
              {isQuickReplyOpen && currentUser && (
                <RecentMessageReplyPopover
                  key={conversation.id}
                  currentUser={currentUser}
                  conversation={conversation}
                  onClose={onQuickReplyClose}
                  onSent={() => onQuickReplySent(conversation)}
                  onToast={onToast}
                />
              )}
              {conversation.unreadCount === 0 && !typing && (
                <span className="pointer-events-none absolute right-14 max-w-56 translate-x-2 rounded-md border border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-primary-500 opacity-0 shadow-xl transition duration-200 group-hover/recent:translate-x-0 group-hover/recent:opacity-100 dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100">
                  <span className="block truncate font-black">{conversation.title}</span>
                  {activityText && (
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                      {activityText}
                    </span>
                  )}
                </span>
              )}
              {(() => {
                  const conversationAvatarErrorKey = `${conversation.id}:${conversation.imageUrl || ''}`;

                return (
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conversation)}
                    onContextMenu={(event) => openContextMenu(event, conversation)}
                    tabIndex={isCollapsed ? -1 : 0}
                    className={`group relative flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-sm font-black text-white shadow-sm ring-2 transition hover:-translate-x-1 hover:scale-105 hover:ring-accent ${typing ? 'ring-accent shadow-[0_0_0_4px_rgba(37,99,235,0.12)]' : presence?.ringClass || 'ring-white dark:ring-gray-900'}`}
                    aria-label={`Open conversation with ${conversation.title}${typing ? ', typing' : presence ? `, ${presence.label}` : ''}`}
                    title={`${conversation.title}${typing ? ' - typing' : presence ? ` - ${presence.label}` : ''}${conversation.subtitle ? ` - ${conversation.subtitle}` : ''}`}
                  >
                    {conversation.imageUrl && !conversationImageLoadFailed[conversationAvatarErrorKey] ? (
                      <img
                        src={getAssetThumbnailUrl(conversation.imageUrl, 96)}
                        alt=""
                        onError={(event) => {
                          const image = event.currentTarget;
                          const fallbackUrl = getAssetUrl(conversation.imageUrl);

                          if (fallbackUrl && image.src !== fallbackUrl) {
                            image.src = fallbackUrl;
                            return;
                          }

                          setConversationImageLoadFailed((previous) => {
                            if (previous[conversationAvatarErrorKey]) {
                              return previous;
                            }

                            return {
                              ...previous,
                              [conversationAvatarErrorKey]: true,
                            };
                          });
                        }}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : conversation.threadType !== 'direct' ? (
                      <Users size={19} />
                    ) : (
                      getInitials(conversation.title)
                    )}
                    {presence && !typing && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-white dark:border-gray-900 dark:bg-gray-900">
                        {presence.showPulse && <span className={`absolute inset-[-0.2rem] rounded-full border shield-online-pulse ${presence.pulseClass}`} />}
                        <span className={`relative h-2.5 w-2.5 rounded-full ${presence.dotClass}`} />
                      </span>
                    )}
                    {typing && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-accent p-0.5 text-white dark:border-gray-900">
                        <span className="flex gap-0.5">
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse [animation-delay:120ms]" />
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse [animation-delay:240ms]" />
                        </span>
                      </span>
                    )}
                    {conversation.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-black text-white dark:border-gray-900">
                        {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })()}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition duration-300 hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          aria-label={isCollapsed ? 'Show recent conversations' : 'Collapse recent conversations'}
          title={isCollapsed ? 'Show Recent Conversations' : 'Collapse Recent Conversations'}
        >
          <ChevronDown className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} size={16} />
        </button>
      </div>
      {contextMenu && (
        <div
          className="quick-launch-context-menu pointer-events-auto fixed z-[90] w-52 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onOpenConversation(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Open conversation
          </button>
          <button
            type="button"
            disabled={contextMenu.conversation.unreadCount === 0}
            className="quick-launch-context-menu-item text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200"
            onClick={() => {
              onMarkRead(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Mark read
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onReply(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Quick reply
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onCompose();
              setContextMenu(null);
            }}
          >
            New message
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onToggleCollapsed();
              setContextMenu(null);
            }}
          >
            {isCollapsed ? 'Expand dock' : 'Collapse dock'}
          </button>
        </div>
      )}
    </aside>
  );
}

function RecentMessageComposerPopup({
  currentUser,
  onClose,
  onSent,
  onToast,
}: {
  currentUser: AuthAccount;
  onClose: () => void;
  onSent: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [body, setBody] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      userService.search(term)
        .then((response) => {
          if (!isMounted) return;
          setResults(response.data.filter((user: User) => user.id !== currentUser.id).slice(0, 8));
        })
        .catch((error) => {
          console.error('Recent message recipient search failed:', error);
          if (isMounted) setResults([]);
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [currentUser.id, query]);

  const sendQuickMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRecipient) {
      onToast('error', 'Choose a recipient first.', { saveToNotifications: false });
      return;
    }

    const text = body.trim();
    if (!text) {
      onToast('error', 'Enter a message.', { saveToNotifications: false });
      return;
    }

    setIsSending(true);
    try {
      await messageService.resolveRecipient(selectedRecipient.id);
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: selectedRecipient.id,
        subject: 'Message',
        body: text,
      });
      onSent();
      onToast('success', `Message sent to ${`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`.trim() || selectedRecipient.email}.`, { saveToNotifications: false });
      onClose();
    } catch (error) {
      console.error('Recent message send failed:', error);
      errorLogService.createClientLog({
        level: 'error',
        message: 'Recent message popup send failed',
        route: window.location.pathname,
        context: JSON.stringify({
          area: 'messages',
          action: 'recent-compose-send',
          currentUserId: currentUser.id,
          recipientId: selectedRecipient.id,
          recipientEmail: selectedRecipient.email,
          bodyLength: text.length,
          error: getErrorMessage(error, 'Failed to send message.'),
        }, null, 2),
      }).catch((logError) => console.error('Failed to write recent message diagnostic:', logError));
      onToast('error', getErrorMessage(error, 'Failed to send message.'), { saveToNotifications: false });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="fixed bottom-5 right-[5.4rem] z-50 hidden w-[min(20rem,calc(100vw-2rem))] md:block" aria-label="Quick new message">
      <form onSubmit={sendQuickMessage} className="quick-launch-context-menu overflow-hidden rounded-lg border border-gray-200 bg-white p-2.5 shadow-2xl ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-950 dark:ring-white/10">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-black uppercase text-primary-500 dark:text-blue-100">New Message</span>
            <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900" aria-label="Close quick message" title="Close">
              <X size={15} />
            </button>
          </div>

          {selectedRecipient ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/10 p-2">
              {selectedRecipient.profilePictureUrl ? (
                <img
                  src={getAssetThumbnailUrl(selectedRecipient.profilePictureUrl, 96)}
                  alt=""
                  onError={(event) => handleAssetThumbnailError(event, selectedRecipient.profilePictureUrl)}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-black text-accent dark:bg-gray-950">
                  {getInitials(`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`, selectedRecipient.email)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-gray-900 dark:text-gray-100">{`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`.trim() || selectedRecipient.email}</p>
                <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">{selectedRecipient.email || selectedRecipient.peNumber}</p>
              </div>
              <button type="button" onClick={() => setSelectedRecipient(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/70 dark:hover:bg-gray-900" aria-label="Change recipient" title="Change">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search recipient"
                  className="global-search-input w-full rounded-lg border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  autoFocus
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                {isSearching ? (
                  <div className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Searching...</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">{query.trim().length < 2 ? 'Type at least 2 characters.' : 'No people found.'}</div>
                ) : (
                  results.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedRecipient(user);
                        setQuery('');
                        setResults([]);
                      }}
                      className="flex w-full items-center gap-2 border-b border-gray-100 px-2.5 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                    >
                      {user.profilePictureUrl ? (
                        <img src={getAssetThumbnailUrl(user.profilePictureUrl, 96)} alt="" onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-[11px] font-black text-accent">{getInitials(`${user.firstName || ''} ${user.lastName || ''}`, user.email)}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-gray-800 dark:text-gray-100">{`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}</span>
                        <span className="block truncate text-[11px] font-semibold text-gray-500">{user.email || user.peNumber}</span>
                      </span>
                      {user.receivesMessages === false && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-danger dark:bg-red-950">OFF</span>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message"
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-[16px] leading-5 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-gray-700 dark:bg-gray-900 sm:text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold text-gray-400">{isSending ? 'Sending...' : selectedRecipient ? selectedRecipient.email || 'Ready' : 'Choose recipient'}</span>
            <button
              type="submit"
              disabled={isSending || !selectedRecipient || !body.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-55"
              aria-label="Send message"
              title="Send"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}

function RecentMessageReplyPopover({
  currentUser,
  conversation,
  onClose,
  onSent,
  onToast,
}: {
  currentUser: AuthAccount;
  conversation: RecentConversation;
  onClose: () => void;
  onSent: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState<'composing' | 'sent' | 'closing'>('composing');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewText = conversation.unreadPreview || conversation.subtitle || 'No preview available';

  useEffect(() => {
    if (sendState !== 'composing') {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [conversation.id, sendState]);

  useEffect(() => {
    if (sendState !== 'sent') {
      return undefined;
    }

    const closeStartTimer = window.setTimeout(() => setSendState('closing'), 1600);
    const closeTimer = window.setTimeout(onClose, 2100);
    return () => {
      window.clearTimeout(closeStartTimer);
      window.clearTimeout(closeTimer);
    };
  }, [onClose, sendState]);

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();

    if (!text) {
      onToast('error', 'Enter a reply.', { saveToNotifications: false });
      return;
    }

    setIsSending(true);
    try {
      if (conversation.threadType !== 'direct') {
        const recipientUserIds = conversation.threadParticipantIds.filter((id) => id && id !== currentUser.id);
        if (recipientUserIds.length === 0) {
          throw new Error('No recipients found for this thread.');
        }

        await messageService.sendGroup({
          senderAccountId: currentUser.id,
          recipientUserIds,
          subject: conversation.latestMessage?.subject || conversation.title || 'Message',
          body: text,
          audienceType: conversation.threadType === 'district' ? 'district' : 'group',
          threadId: conversation.id,
          threadTitle: conversation.latestMessage?.threadTitle || conversation.title,
        });
      } else {
        await messageService.resolveRecipient(conversation.directParticipantId);
        await messageService.send({
          senderAccountId: currentUser.id,
          recipientUserId: conversation.directParticipantId,
          subject: conversation.latestMessage?.subject || 'Message',
          body: text,
        });
      }

      const unreadMessageIds = conversation.unreadMessageIds.filter(Boolean);
      if (unreadMessageIds.length > 0) {
        await Promise.all(unreadMessageIds.map((messageId) => messageService.markRead(messageId, currentUser.id)));
      }

      onSent();
      setBody('');
      setSendState('sent');
    } catch (error) {
      console.error('Recent message reply failed:', error);
      errorLogService.createClientLog({
        level: 'error',
        message: 'Recent message quick reply failed',
        route: window.location.pathname,
        context: JSON.stringify({
          area: 'messages',
          action: 'recent-quick-reply',
          currentUserId: currentUser.id,
          conversationId: conversation.id,
          threadType: conversation.threadType,
          bodyLength: text.length,
          error: getErrorMessage(error, 'Failed to send reply.'),
        }, null, 2),
      }).catch((logError) => console.error('Failed to write quick reply diagnostic:', logError));
      onToast('error', getErrorMessage(error, 'Failed to send reply.'), { saveToNotifications: false });
    } finally {
      setIsSending(false);
    }
  };

  const sendOnEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!isSending && body.trim()) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      onSubmit={sendReply}
      className={`recent-message-preview-pop recent-message-preview-pop--arrow recent-message-preview-pop--modern absolute right-14 z-30 w-80 rounded-2xl text-left shadow-[0_22px_55px_rgba(15,23,42,0.28)] backdrop-blur-xl transition duration-500 ${sendState === 'closing' ? 'translate-x-2 scale-95 opacity-0' : 'translate-x-0 scale-100 opacity-100'} ${sendState === 'composing' ? 'p-3' : 'px-3 py-2'}`}
      aria-label="Quick reply"
    >
      {sendState !== 'composing' ? (
        <div className="flex items-center justify-center gap-2 text-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-md shadow-green-900/20">
            <CheckCircle2 size={18} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-900 dark:text-gray-100">Message Sent</span>
            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{conversation.title}</span>
          </span>
        </div>
      ) : (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-primary-500 dark:text-blue-100">{conversation.title}</span>
            <span className="mt-0.5 block line-clamp-2 text-xs font-semibold text-gray-600 dark:text-gray-300">{previewText}</span>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-900/70" aria-label="Close quick reply" title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <MentionTextarea
            ref={inputRef}
            value={body}
            onChange={(value) => setBody(value.slice(0, 1200))}
            wrapperClassName="min-w-0 flex-1"
            onKeyDown={sendOnEnter}
            placeholder="Reply..."
            rows={2}
            maxLength={1200}
            className="min-h-14 resize-none rounded-xl border border-gray-300 bg-white/90 px-3 py-2 text-[16px] leading-5 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-gray-700 dark:bg-gray-900/90 sm:text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="Send reply"
            title="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      )}
    </form>
  );
}

interface RecentMessagesDockContainerProps {
  currentUser: AuthAccount | null;
  isVisible: boolean;
  isAppBackgrounded: boolean;
  onOpenConversation: (threadId: string) => void;
  onUnreadCountDelta: (delta: number) => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}

export const RecentMessagesDockContainer = memo(function RecentMessagesDockContainer({
  currentUser,
  isVisible,
  isAppBackgrounded,
  onOpenConversation,
  onUnreadCountDelta,
  onToast,
}: RecentMessagesDockContainerProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [presenceByAccount, setPresenceByAccount] = useState<Record<string, RecentPresenceState>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<string, RecentTypingState>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [quickReplyConversation, setQuickReplyConversation] = useState<RecentConversation | null>(null);

  useEffect(() => {
    if (!currentUser || !isVisible) {
      setConversations([]);
      setPresenceByAccount({});
      setTypingByConversation({});
      setQuickReplyConversation(null);
      setIsComposerOpen(false);
      return undefined;
    }

    let isMounted = true;
    let refreshTimer: number | null = null;

    const loadRecentConversations = async () => {
      try {
        const [inboxResult, sentResult] = await Promise.allSettled([
          messageService.getInbox(currentUser.id),
          messageService.getSent(currentUser.id),
        ]);
        if (!isMounted) {
          return;
        }

        const inboxMessages = inboxResult.status === 'fulfilled' ? inboxResult.value.data : [];
        const sentMessages = sentResult.status === 'fulfilled' ? sentResult.value.data : [];
        if (inboxResult.status === 'rejected' && sentResult.status === 'rejected') {
          throw inboxResult.reason;
        }

        setConversations(buildRecentConversations([...inboxMessages, ...sentMessages], currentUser.id));
      } catch (error) {
        console.error('Failed to load recent conversations:', error);
      }
    };

    const queueRecentConversationLoad = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadRecentConversations();
      }, isAppBackgrounded ? 1200 : 250);
    };

    void loadRecentConversations();
    window.addEventListener('shield:messages-updated', queueRecentConversationLoad);

    const eventSource = new EventSource(getMessageEventsUrl(), { withCredentials: true });
    const handlePresenceUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}') as {
          actorAccountId?: string;
          actorOnline?: boolean;
          actorAway?: boolean;
          actorStatus?: RecentPresenceStatus;
          actorLastSeenAt?: string | null;
        };

        if (!payload.actorAccountId) {
          return;
        }

        setPresenceByAccount((current) => ({
          ...current,
          [payload.actorAccountId as string]: {
            online: payload.actorOnline === true,
            away: payload.actorAway === true,
            status: payload.actorStatus || 'active',
            lastSeenAt: payload.actorLastSeenAt || null,
          },
        }));
      } catch (error) {
        console.error('Failed to parse recent conversation presence update:', error);
      }
    };
    const handleTypingUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}') as {
          actorAccountId?: string;
          typingThreadId?: string;
          typingName?: string;
          typingIsActive?: boolean;
        };
        const conversationId = payload.typingThreadId || payload.actorAccountId;
        if (!conversationId || payload.actorAccountId === currentUser.id) {
          return;
        }

        setTypingByConversation((current) => {
          const next = { ...current };
          if (payload.typingIsActive === false) {
            delete next[conversationId];
          } else {
            next[conversationId] = {
              name: payload.typingName || 'Someone',
              expiresAt: Date.now() + 3500,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to parse recent conversation typing update:', error);
      }
    };
    eventSource.addEventListener('message-created', queueRecentConversationLoad);
    eventSource.addEventListener('message-read', queueRecentConversationLoad);
    eventSource.addEventListener('message-archived', queueRecentConversationLoad);
    eventSource.addEventListener('message-deleted', queueRecentConversationLoad);
    eventSource.addEventListener('message-typing', handleTypingUpdate);
    eventSource.addEventListener('presence-updated', handlePresenceUpdate);
    eventSource.addEventListener('error', (event) => {
      console.error('Recent conversations realtime connection error:', event);
    });

    return () => {
      isMounted = false;
      window.removeEventListener('shield:messages-updated', queueRecentConversationLoad);
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      eventSource.removeEventListener('message-typing', handleTypingUpdate);
      eventSource.removeEventListener('presence-updated', handlePresenceUpdate);
      eventSource.close();
    };
  }, [currentUser, isAppBackgrounded, isVisible]);

  useEffect(() => {
    if (!currentUser || !isVisible) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingByConversation((current) => {
        const activeEntries = Object.entries(current).filter(([, typing]) => typing.expiresAt > now);
        if (activeEntries.length === Object.keys(current).length) {
          return current;
        }
        return Object.fromEntries(activeEntries);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [currentUser, isVisible]);

  if (!currentUser || !isVisible) {
    return null;
  }

  const openConversation = (conversation: RecentConversation) => {
    setIsComposerOpen(false);
    setQuickReplyConversation(null);
    onOpenConversation(conversation.id);
  };

  const markConversationRead = async (conversation: RecentConversation) => {
    const unreadMessageIds = conversation.unreadMessageIds.filter(Boolean);
    if (unreadMessageIds.length === 0) {
      return;
    }

    try {
      await Promise.all(unreadMessageIds.map((messageId) => messageService.markRead(messageId, currentUser.id)));
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
    } catch (error) {
      console.error('Failed to mark recent conversation read:', error);
      onToast('error', getErrorMessage(error, 'Failed to mark conversation read.'), { saveToNotifications: false });
    }
  };

  const handleQuickReplySent = (conversation: RecentConversation) => {
    setConversations((previousConversations) =>
      previousConversations.map((recentConversation) =>
        recentConversation.id === conversation.id
          ? {
              ...recentConversation,
              unreadCount: 0,
              unreadPreview: '',
              unreadMessageIds: [],
            }
          : recentConversation,
      ),
    );
    onUnreadCountDelta(-conversation.unreadCount);
    window.dispatchEvent(new CustomEvent('shield:messages-updated'));
  };

  return (
    <>
      <RecentConversationsDock
        conversations={conversations}
        isCollapsed={isCollapsed}
        currentUser={currentUser}
        quickReplyConversationId={quickReplyConversation?.id || null}
        presenceByAccount={presenceByAccount}
        typingByConversation={typingByConversation}
        onOpenConversation={openConversation}
        onMarkRead={markConversationRead}
        onReply={(conversation) => {
          setIsComposerOpen(false);
          setQuickReplyConversation(conversation);
        }}
        onQuickReplyClose={() => setQuickReplyConversation(null)}
        onQuickReplySent={handleQuickReplySent}
        onCompose={() => {
          setQuickReplyConversation(null);
          setIsComposerOpen((isOpen) => !isOpen);
        }}
        onToggleCollapsed={() => setIsCollapsed((collapsed) => !collapsed)}
        onToast={onToast}
      />
      {isComposerOpen && (
        <RecentMessageComposerPopup
          currentUser={currentUser}
          onClose={() => setIsComposerOpen(false)}
          onSent={() => window.dispatchEvent(new CustomEvent('shield:messages-updated'))}
          onToast={onToast}
        />
      )}
    </>
  );
});
