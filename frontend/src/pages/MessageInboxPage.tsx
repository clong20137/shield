import { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, Check, CheckCheck, Download, Image as ImageIcon, Pencil, Pin, PinOff, Search, SmilePlus, Paperclip, Plus, Save, Send, Trash2, Users, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { AuthAccount, getAssetThumbnailUrl, getAssetUrl, getMessageEventsUrl, handleAssetImageError, handleAssetThumbnailError, messageService, userService, User, UserMessage } from '../services/api';
import { RankBadge } from '../components/RankBadge';
import { MentionText } from '../components/MentionText';
import { MentionTextarea } from '../components/MentionTextarea';
import { UserDetail } from '../components/UserDetail';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface MessageInboxPageProps {
  currentUser: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  isModalView?: boolean;
  targetRecipient?: User | null;
  targetThreadId?: string | null;
  composeRequestKey?: number;
  isBackgrounded?: boolean;
}

interface MessageThread {
  id: string;
  contactName: string;
  contactEmail: string;
  contactRank: string;
  contactProfilePictureUrl: string;
  threadImageUrl: string;
  contactLastSeenAt: string | null;
  contactReceivesMessages: boolean;
  participantIds: string[];
  participantNames: string[];
  threadType: string;
  subject: string;
  latestMessage?: UserMessage;
  messages: UserMessage[];
  unreadCount: number;
}

interface ThreadMemberPreview {
  id: string;
  name: string;
  profilePictureUrl: string;
}

const PINNED_THREADS_KEY_PREFIX = 'shield_pinned_message_threads';
const messageReactionOptions = [
  { key: 'thumbsUp', label: 'Thumbs up', icon: '👍' },
  { key: 'check', label: 'Check', icon: '✅' },
  { key: 'laugh', label: 'Laugh', icon: '😂' },
  { key: 'heart', label: 'Heart', icon: '❤️' },
  { key: 'eyes', label: 'Eyes', icon: '👀' },
] as const;

function formatMessageTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getPresenceLabel(value?: string | null): string {
  return getPresenceDisplay(value, isOnlineFromLastSeen(value));
}

function isOnlineFromLastSeen(value?: string | null, now = Date.now()): boolean {
  if (!value) {
    return false;
  }

  const lastActivityTime = new Date(value).getTime();
  if (Number.isNaN(lastActivityTime)) {
    return false;
  }

  return now - lastActivityTime <= 5 * 60 * 1000;
}

function getPresenceDisplay(
  value: string | null | undefined,
  isOnline: boolean,
  status: 'active' | 'away' | 'busy' = 'active',
): string {
  if (!value) {
    return 'Never';
  }

  const lastActivityTime = new Date(value).getTime();
  if (Number.isNaN(lastActivityTime)) {
    return 'Never';
  }

  if (!isOnline) {
    return `Last online ${formatMessageTime(value)}`;
  }

  if (status === 'busy') {
    return 'Busy';
  }

  if (status === 'away') {
    return 'Away';
  }

  return 'Active';
}

function PresenceDot({
  isOnline,
  status = 'active',
  className = '',
}: { isOnline: boolean; status?: 'active' | 'away' | 'busy'; className?: string }) {
  const toneClass = status === 'busy' ? 'bg-red-500' : status === 'away' ? 'bg-amber-400' : isOnline ? 'bg-green-500' : 'bg-red-500';
  const pulseClass = status === 'busy' ? 'bg-red-300' : status === 'away' ? 'bg-amber-300' : 'bg-green-400';
  const label = status === 'busy' ? 'Busy' : status === 'away' ? 'Away' : isOnline ? 'Online' : 'Offline';
  return (
    <span
      className={`relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${toneClass} ${className}`}
      title={label}
      aria-label={label}
    >
      {isOnline && <span className={`absolute inset-0 animate-ping rounded-full ${pulseClass} opacity-75`} />}
    </span>
  );
}

function getThreadId(message: UserMessage, currentUserId: string): string {
  if (message.threadId) {
    return message.threadId;
  }

  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function parseThreadList(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function getThreadType(message: UserMessage): string {
  return message.threadType || 'direct';
}

function getParticipantIds(message: UserMessage): string[] {
  const parsedIds = parseThreadList(message.threadParticipantIds);
  if (parsedIds.length > 0) {
    return parsedIds;
  }

  return Array.from(new Set([message.senderAccountId, message.recipientUserId].filter(Boolean)));
}

function getParticipantNames(message: UserMessage, currentUserId: string): string[] {
  const parsedNames = parseThreadList(message.threadParticipantNames);
  if (parsedNames.length > 0) {
    return parsedNames;
  }

  return [
    message.senderAccountId === currentUserId ? 'You' : message.senderName || message.senderEmail || 'Sender',
    message.recipientUserId === currentUserId ? 'You' : message.recipientName || message.recipientEmail || 'Recipient',
  ];
}

function getContactName(message: UserMessage, currentUserId: string): string {
  if (getThreadType(message) !== 'direct') {
    return message.threadTitle || getParticipantNames(message, currentUserId).filter((name) => name !== 'You').join(', ') || 'Group Message';
  }

  return message.senderAccountId === currentUserId
    ? message.recipientName || message.recipientEmail || 'Unknown'
    : message.senderName || message.senderEmail || 'Unknown';
}

function getContactEmail(message: UserMessage, currentUserId: string): string {
  return message.senderAccountId === currentUserId
    ? message.recipientEmail || ''
    : message.senderEmail || '';
}

function getContactRank(message: UserMessage, currentUserId: string): string {
  return message.senderAccountId === currentUserId
    ? message.recipientRank || ''
    : message.senderRank || '';
}

function getContactProfilePicture(message: UserMessage, currentUserId: string): string {
  if (getThreadType(message) !== 'direct') {
    return message.threadImageUrl || '';
  }

  return message.senderAccountId === currentUserId
    ? message.recipientProfilePictureUrl || ''
    : message.senderProfilePictureUrl || '';
}

function getContactLastSeenAt(message: UserMessage, currentUserId: string): string | null {
  return message.senderAccountId === currentUserId
    ? message.recipientLastSeenAt || null
    : message.senderLastSeenAt || null;
}

function getContactReceivesMessages(message: UserMessage, currentUserId: string): boolean {
  if (getThreadType(message) !== 'direct') {
    return true;
  }

  return message.senderAccountId === currentUserId
    ? message.recipientReceivesMessages !== false
    : message.senderReceivesMessages !== false;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getDeliveryLabel(message: UserMessage): string {
  return message.isRead ? 'Read' : 'Delivered';
}

function getMessageReactionForUser(message: UserMessage, accountId: string): string | null {
  return message.senderAccountId === accountId ? message.senderReaction || null : message.recipientReaction || null;
}

function getMessageReactionForOtherUser(message: UserMessage, accountId: string): string | null {
  return message.senderAccountId === accountId ? message.recipientReaction || null : message.senderReaction || null;
}

function getReactionIcon(reaction?: string | null): string {
  return messageReactionOptions.find((option) => option.key === reaction)?.icon || '';
}

function getMessageReactionIcons(message: UserMessage, accountId: string): string[] {
  return [
    getReactionIcon(getMessageReactionForOtherUser(message, accountId)),
    getReactionIcon(getMessageReactionForUser(message, accountId)),
  ].filter(Boolean);
}

function isDeletedMessage(message: UserMessage): boolean {
  return message.isDeleted === true;
}

function getMessagePreviewText(message: UserMessage): string {
  if (isDeletedMessage(message)) {
    return 'Message deleted';
  }

  if (isSystemMessage(message)) {
    return getSystemMessageText(message);
  }

  return message.body;
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re:\s*)+/iu, '').trim() || 'Message';
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
  ) {
    return (error as { response: { data: { error: string } } }).response.data.error;
  }

  return fallback;
}

function getDraftGroupThreadId(recipients: Pick<User, 'id'>[]): string {
  return `draft-group:${recipients.map((user) => user.id).sort().join(',')}`;
}

function fileFromDesktopClipboardPayload(file: ShieldDesktopClipboardFile): File | null {
  try {
    const binary = window.atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], file.name, { type: file.type || 'application/octet-stream' });
  } catch (error) {
    console.error('Failed to read desktop clipboard file:', error);
    return null;
  }
}

function isMessageImageUrl(value: string): boolean {
  return /^\/uploads\/messages\/[^\s]+?\.(?:jpe?g|jfif|png|gif|webp)$/iu.test(value.trim());
}

const systemMessagePrefix = '::system::';
const attachmentMessagePrefix = '::attachment::';

function isSystemMessage(message: UserMessage): boolean {
  return message.body.startsWith(systemMessagePrefix);
}

function getSystemMessageText(message: UserMessage): string {
  return message.body.slice(systemMessagePrefix.length).trim();
}

function formatAttachmentLine(fileName: string, fileUrl: string): string {
  return `${attachmentMessagePrefix}${encodeURIComponent(fileName)}::${fileUrl}`;
}

function parseAttachmentLine(value: string): { fileName: string; fileUrl: string } | null {
  if (!value.startsWith(attachmentMessagePrefix)) {
    return null;
  }

  const body = value.slice(attachmentMessagePrefix.length);
  const separatorIndex = body.indexOf('::');
  if (separatorIndex <= 0) {
    return null;
  }

  const rawName = body.slice(0, separatorIndex);
  const fileUrl = body.slice(separatorIndex + 2).trim();
  if (!fileUrl.startsWith('/uploads/messages/')) {
    return null;
  }

  try {
    return {
      fileName: decodeURIComponent(rawName),
      fileUrl,
    };
  } catch {
    return {
      fileName: rawName,
      fileUrl,
    };
  }
}

function MessageInboxPage({ currentUser, onToast, isModalView = false, targetRecipient = null, targetThreadId = null, composeRequestKey = 0, isBackgrounded = false }: MessageInboxPageProps) {
  const [inboxMessages, setInboxMessages] = useState<UserMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<UserMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isReplyDragOver, setIsReplyDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [threadSearchTerm, setThreadSearchTerm] = useState('');
  const [unreadDividerMessageId, setUnreadDividerMessageId] = useState<string | null>(null);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(`${PINNED_THREADS_KEY_PREFIX}_${currentUser.id}`) || '[]') as string[];
    } catch {
      return [];
    }
  });
  const [typingByThread, setTypingByThread] = useState<Record<string, { name: string; expiresAt: number }>>({});
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<User[]>([]);
  const [draftRecipient, setDraftRecipient] = useState<User | null>(null);
  const [draftGroupRecipients, setDraftGroupRecipients] = useState<User[]>([]);
  const [draftThreadTitle, setDraftThreadTitle] = useState('');
  const [editingThreadTitle, setEditingThreadTitle] = useState('');
  const [isEditingThreadTitle, setIsEditingThreadTitle] = useState(false);
  const [isSavingThreadTitle, setIsSavingThreadTitle] = useState(false);
  const [isLoadingDistrictRecipients, setIsLoadingDistrictRecipients] = useState(false);
  const [isRecipientSearching, setIsRecipientSearching] = useState(false);
  const [messagePendingDelete, setMessagePendingDelete] = useState<UserMessage | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] = useState<MessageThread | null>(null);
  const [selectedMentionUser, setSelectedMentionUser] = useState<User | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isCompactComposeOpen, setIsCompactComposeOpen] = useState(false);
  const [composeKeyboardInset, setComposeKeyboardInset] = useState(12);
  const [presenceByAccount, setPresenceByAccount] = useState<Record<string, { online: boolean; away: boolean; status?: 'active' | 'away' | 'busy'; lastSeenAt: string | null }>>({});
  const [memberDirectory, setMemberDirectory] = useState<Record<string, ThreadMemberPreview>>(() => ({
    [currentUser.id]: {
      id: currentUser.id,
      name: currentUser.displayName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'You',
      profilePictureUrl: currentUser.profilePictureUrl || '',
    },
  }));
  const [composePopoverPosition, setComposePopoverPosition] = useState({ right: 16, bottom: 88 });
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const composeButtonRef = useRef<HTMLButtonElement | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const groupImageInputRef = useRef<HTMLInputElement | null>(null);
  const messageImageInputRef = useRef<HTMLInputElement | null>(null);
  const messageReloadTimerRef = useRef<number | null>(null);
  const messageLoadInFlightRef = useRef(false);
  const messageLoadPendingRef = useRef(false);
  const focusReplyComposer = () => {
    window.setTimeout(() => replyTextareaRef.current?.focus(), 0);
  };
  const emojiButtonLabel = useMemo(() => ['🙂', '😀', '😎', '👍', '✨'][Math.floor(Math.random() * 5)], []);

  useEffect(() => {
    if (!targetRecipient || targetRecipient.id === currentUser.id) {
      return;
    }

    if (targetRecipient.receivesMessages === false) {
      onToast('error', `${targetRecipient.firstName} ${targetRecipient.lastName}`.trim() || 'This user does not receive messages.');
      return;
    }

    setDraftRecipient(targetRecipient);
    setDraftGroupRecipients([]);
    setDraftThreadTitle('');
    setSelectedThreadId(targetRecipient.id);
    setIsComposeOpen(false);
    setRecipientQuery('');
    setRecipientResults([]);
    setReplyBody('');
    setReplyAttachments([]);
    setSearchTerm('');
  }, [currentUser.id, targetRecipient?.id]);

  const loadMessages = async (showLoading = false) => {
    if (messageLoadInFlightRef.current) {
      messageLoadPendingRef.current = true;
      return;
    }

    messageLoadInFlightRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const [inboxResponse, sentResponse] = await Promise.all([
        messageService.getInbox(currentUser.id),
        messageService.getSent(currentUser.id),
      ]);
      setInboxMessages(inboxResponse.data);
      setSentMessages(sentResponse.data);
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to load messages.');
    } finally {
      messageLoadInFlightRef.current = false;
      setIsLoading(false);
      if (messageLoadPendingRef.current) {
        messageLoadPendingRef.current = false;
        void loadMessages(false);
      }
    }
  };

  useEffect(() => {
    if (isBackgrounded) {
      return undefined;
    }

    loadMessages(true);
    const eventsUrl = getMessageEventsUrl();
    const eventSource = new EventSource(eventsUrl, { withCredentials: true });
    const handleRealtimeMessageUpdate = () => {
      if (messageReloadTimerRef.current) {
        window.clearTimeout(messageReloadTimerRef.current);
      }

      messageReloadTimerRef.current = window.setTimeout(() => {
        messageReloadTimerRef.current = null;
        void loadMessages(false);
      }, 250);
    };
    const handleMessageUpdate = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { message?: UserMessage };
        if (!payload.message) {
          void loadMessages(false);
          return;
        }
        setInboxMessages((messages) => messages.map((message) => (message.id === payload.message?.id ? payload.message : message)));
        setSentMessages((messages) => messages.map((message) => (message.id === payload.message?.id ? payload.message : message)));
      } catch (err) {
        console.error('Message update parse error:', err);
        void loadMessages(false);
      }
    };
    const handleTypingUpdate = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          actorAccountId?: string;
          typingThreadId?: string;
          typingName?: string;
          typingIsActive?: boolean;
        };
        if (!payload.actorAccountId || payload.actorAccountId === currentUser.id) {
          return;
        }
        const threadId = payload.typingThreadId || payload.actorAccountId;
        setTypingByThread((current) => {
          const next = { ...current };
          if (payload.typingIsActive === false) {
            delete next[threadId];
          } else {
            next[threadId] = {
              name: payload.typingName || 'Someone',
              expiresAt: Date.now() + 3500,
            };
          }
          return next;
        });
      } catch (err) {
        console.error('Typing update parse error:', err);
      }
    };
    const handlePresenceUpdate = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          actorAccountId?: string;
          actorOnline?: boolean;
          actorAway?: boolean;
          actorStatus?: 'active' | 'away' | 'busy';
          actorLastSeenAt?: string;
        };
        if (!payload.actorAccountId) {
          loadMessages(false);
          return;
        }

        setPresenceByAccount((current) => ({
          ...current,
          [payload.actorAccountId as string]: {
            online: payload.actorOnline === true,
            away: payload.actorAway === true,
            status: payload.actorStatus,
            lastSeenAt: payload.actorLastSeenAt || null,
          },
        }));
      } catch (err) {
        console.error('Presence update parse error:', err);
        loadMessages(false);
      }
    };
    eventSource?.addEventListener('message-created', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-read', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-reaction', handleMessageUpdate);
    eventSource?.addEventListener('message-typing', handleTypingUpdate);
    eventSource?.addEventListener('message-archived', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-deleted', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('presence-updated', handlePresenceUpdate);
    eventSource?.addEventListener('error', (event) => {
      console.error('Message realtime connection error:', event);
    });
    window.addEventListener('shield:api-reconnected', handleRealtimeMessageUpdate);

    return () => {
      if (messageReloadTimerRef.current) {
        window.clearTimeout(messageReloadTimerRef.current);
        messageReloadTimerRef.current = null;
      }
      eventSource?.close();
      window.removeEventListener('shield:api-reconnected', handleRealtimeMessageUpdate);
    };
  }, [currentUser.id, isBackgrounded]);

  useEffect(() => {
    setMemberDirectory((currentDirectory) => ({
      ...currentDirectory,
      [currentUser.id]: {
        id: currentUser.id,
        name: currentUser.displayName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'You',
        profilePictureUrl: currentUser.profilePictureUrl || '',
      },
    }));
  }, [currentUser.id, currentUser.displayName, currentUser.email, currentUser.firstName, currentUser.lastName, currentUser.profilePictureUrl]);

  useEffect(() => {
    window.localStorage.setItem(`${PINNED_THREADS_KEY_PREFIX}_${currentUser.id}`, JSON.stringify(pinnedThreadIds));
  }, [currentUser.id, pinnedThreadIds]);

  useEffect(() => {
    if (draftGroupRecipients.length === 0) {
      return;
    }

    setSelectedThreadId(getDraftGroupThreadId(draftGroupRecipients));
  }, [draftGroupRecipients]);

  useEffect(() => {
    if (!isComposeOpen) {
      return undefined;
    }

    const syncComposePopoverPosition = () => {
      const rect = composeButtonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setComposePopoverPosition({
        right: Math.max(12, window.innerWidth - rect.right),
        bottom: Math.max(12, window.innerHeight - rect.top + 12),
      });
    };

    syncComposePopoverPosition();
    window.addEventListener('resize', syncComposePopoverPosition);
    window.addEventListener('scroll', syncComposePopoverPosition, true);

    return () => {
      window.removeEventListener('resize', syncComposePopoverPosition);
      window.removeEventListener('scroll', syncComposePopoverPosition, true);
    };
  }, [isComposeOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(isModalView ? '(max-width: 767px)' : '(max-width: 1279px)');
    const syncCompactCompose = () => setIsCompactComposeOpen(mediaQuery.matches);

    syncCompactCompose();
    mediaQuery.addEventListener('change', syncCompactCompose);
    return () => mediaQuery.removeEventListener('change', syncCompactCompose);
  }, [isModalView]);

  useEffect(() => {
    if (!isComposeOpen || !isCompactComposeOpen || !window.visualViewport) {
      setComposeKeyboardInset(12);
      return undefined;
    }

    const syncKeyboardInset = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const keyboardInset = Math.max(12, window.innerHeight - viewport.height - viewport.offsetTop + 12);
      setComposeKeyboardInset(keyboardInset);
    };

    syncKeyboardInset();
    window.visualViewport.addEventListener('resize', syncKeyboardInset);
    window.visualViewport.addEventListener('scroll', syncKeyboardInset);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', syncKeyboardInset);
    };
  }, [isComposeOpen, isCompactComposeOpen]);

  useEffect(() => {
    if (isBackgrounded) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingByThread((current) => {
        const entries = Object.entries(current).filter(([, value]) => value.expiresAt > now);
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [isBackgrounded]);

  useEffect(() => {
    if (!isComposeOpen || recipientQuery.trim().length < 2) {
      setRecipientResults([]);
      return;
    }

    let isMounted = true;
    setIsRecipientSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.search(recipientQuery);
        if (isMounted) {
          const selectedIds = new Set(draftGroupRecipients.map((user) => user.id));
          setRecipientResults(
            response.data
              .filter((user: User) => user.id !== currentUser.id && !selectedIds.has(user.id))
              .slice(0, 8),
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) {
          setIsRecipientSearching(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [currentUser.id, draftGroupRecipients, isComposeOpen, recipientQuery]);

  const threads = useMemo<MessageThread[]>(() => {
    const threadMap = new Map<string, MessageThread>();
    const combinedMessages = [...inboxMessages, ...sentMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    combinedMessages.forEach((message) => {
      const id = getThreadId(message, currentUser.id);
      const existingThread = threadMap.get(id);
      const subject = normalizeSubject(message.subject);

      if (!existingThread) {
        threadMap.set(id, {
          id,
          contactName: getContactName(message, currentUser.id),
          contactEmail: getContactEmail(message, currentUser.id),
          contactRank: getContactRank(message, currentUser.id),
          contactProfilePictureUrl: getContactProfilePicture(message, currentUser.id),
          threadImageUrl: message.threadImageUrl || '',
          contactLastSeenAt: getContactLastSeenAt(message, currentUser.id),
          contactReceivesMessages: getContactReceivesMessages(message, currentUser.id),
          participantIds: getParticipantIds(message),
          participantNames: getParticipantNames(message, currentUser.id),
          threadType: getThreadType(message),
          subject,
          latestMessage: message,
          messages: [message],
          unreadCount: message.recipientUserId === currentUser.id && !message.isRead ? 1 : 0,
        });
        return;
      }

      if (!existingThread.messages.some((item) => (item.groupMessageId || item.id) === (message.groupMessageId || message.id))) {
        existingThread.messages.push(message);
      }
      existingThread.latestMessage = message;
      existingThread.contactLastSeenAt = getContactLastSeenAt(message, currentUser.id);
      existingThread.threadImageUrl = message.threadImageUrl || existingThread.threadImageUrl;
      existingThread.contactProfilePictureUrl = getThreadType(message) !== 'direct' && message.threadImageUrl
        ? message.threadImageUrl
        : existingThread.contactProfilePictureUrl;
      existingThread.participantIds = Array.from(new Set([...existingThread.participantIds, ...getParticipantIds(message)]));
      existingThread.participantNames = Array.from(new Set([...existingThread.participantNames, ...getParticipantNames(message, currentUser.id)]));
      existingThread.subject = existingThread.subject || subject;
      if (message.recipientUserId === currentUser.id && !message.isRead) {
        existingThread.unreadCount += 1;
      }
    });

    return Array.from(threadMap.values()).sort((a, b) => {
      const aPinned = pinnedThreadIds.includes(a.id);
      const bPinned = pinnedThreadIds.includes(b.id);
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }

      return new Date(b.latestMessage?.createdAt || 0).getTime() - new Date(a.latestMessage?.createdAt || 0).getTime();
    });
  }, [currentUser.id, inboxMessages, pinnedThreadIds, sentMessages]);

  const filteredThreads = useMemo(() => {
    const existingDraftThread = draftRecipient && threads.some((thread) => thread.id === draftRecipient.id);
    const draftGroupId = draftGroupRecipients.length > 0 ? getDraftGroupThreadId(draftGroupRecipients) : '';
    const draftThread: MessageThread | null = draftRecipient && !existingDraftThread
      ? {
          id: draftRecipient.id,
          contactName: `${draftRecipient.firstName || ''} ${draftRecipient.lastName || ''}`.trim() || draftRecipient.email || 'New Chat',
          contactEmail: draftRecipient.email || '',
          contactRank: draftRecipient.rank || '',
          contactProfilePictureUrl: draftRecipient.profilePictureUrl || '',
          threadImageUrl: '',
          contactLastSeenAt: draftRecipient.lastSeenAt || null,
          contactReceivesMessages: draftRecipient.receivesMessages !== false,
          participantIds: [currentUser.id, draftRecipient.id],
          participantNames: ['You', `${draftRecipient.firstName || ''} ${draftRecipient.lastName || ''}`.trim() || draftRecipient.email || 'Recipient'],
          threadType: 'direct',
          subject: 'Message',
          messages: [],
          unreadCount: 0,
        }
      : null;
    const draftGroupThread: MessageThread | null = draftGroupRecipients.length > 0
      ? {
          id: draftGroupId,
          contactName: draftThreadTitle.trim() || `Group: ${draftGroupRecipients.slice(0, 3).map((user) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email).join(', ')}${draftGroupRecipients.length > 3 ? ` +${draftGroupRecipients.length - 3}` : ''}`,
          contactEmail: '',
          contactRank: `${draftGroupRecipients.length} recipients`,
          contactProfilePictureUrl: '',
          threadImageUrl: '',
          contactLastSeenAt: null,
          contactReceivesMessages: true,
          participantIds: [currentUser.id, ...draftGroupRecipients.map((user) => user.id)],
          participantNames: ['You', ...draftGroupRecipients.map((user) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Recipient')],
          threadType: 'group',
          subject: draftThreadTitle.trim() || 'Group Message',
          messages: [],
          unreadCount: 0,
        }
      : null;
    const visibleThreads = [draftGroupThread, draftThread, ...threads].filter((thread): thread is MessageThread => Boolean(thread));
    const term = searchTerm.trim().toLowerCase();
    if (!term) return visibleThreads;

    return visibleThreads.filter((thread) =>
      [
        thread.contactName,
        thread.contactEmail,
        thread.subject,
        thread.latestMessage?.body || '',
        ...thread.messages.map((message) => message.body),
      ].join(' ').toLowerCase().includes(term),
    );
  }, [currentUser.id, draftGroupRecipients, draftRecipient, draftThreadTitle, searchTerm, threads]);

  const selectedThread = filteredThreads.find((thread) => thread.id === selectedThreadId) || null;
  const selectedThreadAcceptsMessages = selectedThread?.contactReceivesMessages !== false;
  const selectedTyping = selectedThreadId ? typingByThread[selectedThreadId] : null;
  const selectedThreadParticipantKey = selectedThread?.participantIds.join('|') || '';

  useEffect(() => {
    if (!targetThreadId || !filteredThreads.some((thread) => thread.id === targetThreadId)) {
      return;
    }

    if (selectedThreadId === targetThreadId && !draftRecipient && draftGroupRecipients.length === 0 && !isComposeOpen && !searchTerm) {
      return;
    }

    setSelectedThreadId(targetThreadId);
    setDraftRecipient(null);
    setDraftGroupRecipients([]);
    setDraftThreadTitle('');
    setIsComposeOpen(false);
    setSearchTerm('');
  }, [draftGroupRecipients.length, draftRecipient, filteredThreads, isComposeOpen, searchTerm, selectedThreadId, targetThreadId]);

  useEffect(() => {
    if (composeRequestKey <= 0) {
      return;
    }

    setSelectedThreadId(null);
    setDraftRecipient(null);
    setDraftGroupRecipients([]);
    setDraftThreadTitle('');
    setRecipientQuery('');
    setRecipientResults([]);
    setReplyBody('');
    setReplyAttachments([]);
    setSearchTerm('');
    setIsComposeOpen(true);
  }, [composeRequestKey]);

  useEffect(() => {
    if (!selectedThread || selectedThread.threadType === 'direct') {
      return;
    }

    const visibleMissingIds = selectedThread.participantIds
      .slice(0, 6)
      .filter((id) => id && !memberDirectory[id]);

    if (visibleMissingIds.length === 0) {
      return;
    }

    let isCancelled = false;
    void Promise.all(
      visibleMissingIds.map(async (id) => {
        try {
          const response = await userService.getById(id);
          const user = response.data as User;
          return {
            id: user.id,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Member',
            profilePictureUrl: user.profilePictureUrl || '',
          } satisfies ThreadMemberPreview;
        } catch (err) {
          console.error('Failed to load group member preview:', err);
          return null;
        }
      }),
    ).then((members) => {
      if (isCancelled) {
        return;
      }

      const loadedMembers = members.filter((member): member is ThreadMemberPreview => Boolean(member));
      if (loadedMembers.length === 0) {
        return;
      }

      setMemberDirectory((currentDirectory) => {
        const nextDirectory = { ...currentDirectory };
        loadedMembers.forEach((member) => {
          nextDirectory[member.id] = member;
        });
        return nextDirectory;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [memberDirectory, selectedThread, selectedThreadParticipantKey]);

  useEffect(() => {
    setIsEditingThreadTitle(false);
    setEditingThreadTitle(selectedThread?.contactName || '');
  }, [selectedThread?.id, selectedThread?.contactName]);

  const displayedMessages = useMemo(() => {
    if (!selectedThread) {
      return [];
    }

    const term = threadSearchTerm.trim().toLowerCase();
    if (!term) {
      return selectedThread.messages;
    }

    return selectedThread.messages.filter((message) =>
      [
        message.body,
        message.senderName || '',
        message.senderEmail || '',
        message.recipientName || '',
        message.recipientEmail || '',
      ].join(' ').toLowerCase().includes(term),
    );
  }, [selectedThread, threadSearchTerm]);
  const getThreadPresence = (thread: MessageThread) => {
    if (thread.threadType !== 'direct') {
      return {
        online: false,
        away: false,
        status: 'active' as const,
        lastSeenAt: null,
        label: `${Math.max(thread.participantIds.length - 1, 0)} members`,
      };
    }

    const realtimePresence = presenceByAccount[thread.id];
    const lastSeenAt = realtimePresence?.lastSeenAt || thread.contactLastSeenAt;
    const online = realtimePresence?.online === true;
    const away = online && realtimePresence?.away === true;
    const status = realtimePresence?.status === 'busy' || realtimePresence?.status === 'away' || realtimePresence?.status === 'active'
      ? realtimePresence.status
      : away ? 'away' : 'active';
    return {
      online,
      away,
      status,
      lastSeenAt,
      label: getPresenceDisplay(lastSeenAt, online, status),
    };
  };
  const selectedPresence = selectedThread ? getThreadPresence(selectedThread) : null;
  const selectedThreadMemberPreviews = useMemo<ThreadMemberPreview[]>(() => {
    if (!selectedThread || selectedThread.threadType === 'direct') {
      return [];
    }

    return selectedThread.participantIds.map((id, index) => {
      const directoryMember = memberDirectory[id];
      return {
        id,
        name: directoryMember?.name || selectedThread.participantNames[index] || 'Member',
        profilePictureUrl: directoryMember?.profilePictureUrl || '',
      };
    });
  }, [memberDirectory, selectedThread]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [selectedThreadId, selectedThread?.messages.length]);

  useEffect(() => {
    if (!selectedThread) {
      setUnreadDividerMessageId(null);
      setThreadSearchTerm('');
      return;
    }

    const firstUnread = selectedThread.messages.find((message) => message.recipientUserId === currentUser.id && !message.isRead);
    setUnreadDividerMessageId(firstUnread?.id || null);
    setThreadSearchTerm('');
  }, [currentUser.id, selectedThreadId]);

  useEffect(() => {
    if (!selectedThread) return;

    const unreadMessages = selectedThread.messages.filter(
      (message) => message.recipientUserId === currentUser.id && !message.isRead,
    );

    if (unreadMessages.length === 0) return;

    unreadMessages.forEach((message) => {
      messageService.markRead(message.id, currentUser.id).catch((err) => console.error(err));
    });

    setInboxMessages((messages) =>
      messages.map((message) =>
        unreadMessages.some((unreadMessage) => unreadMessage.id === message.id)
          ? { ...message, isRead: true }
          : message,
      ),
    );
    window.dispatchEvent(new CustomEvent('shield:messages-updated'));
  }, [currentUser.id, selectedThread]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isEmojiPickerOpen) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        setIsEmojiPickerOpen(false);
        return;
      }

      if (threadPendingDelete) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        setThreadPendingDelete(null);
        return;
      }

      if (messagePendingDelete) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        setMessagePendingDelete(null);
        return;
      }

      if (isComposeOpen) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        setIsComposeOpen(false);
        setIsEmojiPickerOpen(false);
        setRecipientQuery('');
        setRecipientResults([]);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isComposeOpen, isEmojiPickerOpen, messagePendingDelete, threadPendingDelete]);

  const withAttachmentSummary = (body: string, attachments: Array<{ fileName: string; fileUrl: string }>) => {
    if (attachments.length === 0) {
      return body;
    }

    return [
      body.trim(),
      ...attachments.map((attachment) => formatAttachmentLine(attachment.fileName, attachment.fileUrl)),
    ].filter(Boolean).join('\n');
  };

  const uploadReplyAttachments = async () => {
    if (replyAttachments.length === 0) {
      return [];
    }

    const uploaded = await Promise.all(replyAttachments.map(async (file) => {
      const response = await messageService.uploadAttachment(file);
      return {
        fileName: response.data.fileName || file.name,
        fileUrl: response.data.fileUrl,
      };
    }));

    return uploaded;
  };

  const appendMessageImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    try {
      const response = await messageService.uploadImage(file);
      setReplyBody((body) => `${body}${body.trim() ? '\n' : ''}${response.data.imageUrl}`);
      focusReplyComposer();
    } catch (err) {
      console.error('Failed to upload message image:', err);
      onToast('error', 'Failed to upload image.');
    }
  };

  const addFilesToReply = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const attachmentFiles = files.filter((file) => !file.type.startsWith('image/'));

    if (attachmentFiles.length > 0) {
      setReplyAttachments((attachments) => [...attachments, ...attachmentFiles]);
    }

    if (imageFiles.length > 0) {
      void imageFiles.reduce<Promise<void>>(
        (promise, file) => promise.then(() => appendMessageImage(file)),
        Promise.resolve(),
      );
    }
  };

  const readDesktopClipboardFiles = async () => {
    if (typeof window.shieldDesktop?.getClipboardFiles !== 'function') {
      return;
    }

    try {
      const clipboardPayload = await window.shieldDesktop.getClipboardFiles();
      const files = clipboardPayload.files
        .map(fileFromDesktopClipboardPayload)
        .filter((file): file is File => Boolean(file));
      if (files.length > 0) {
        addFilesToReply(files);
        onToast('info', `Added ${files.length} clipboard file${files.length === 1 ? '' : 's'} to this message.`);
      }
    } catch (error) {
      console.error('Failed to read desktop clipboard files:', error);
    }
  };

  const handleMessagePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData.files);
    if (pastedFiles.length === 0) {
      void readDesktopClipboardFiles();
      return;
    }

    event.preventDefault();
    addFilesToReply(pastedFiles);
  };

  const handleReplyDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!selectedThreadAcceptsMessages) {
      return;
    }

    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setIsReplyDragOver(true);
    }
  };

  const handleReplyDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsReplyDragOver(false);
    }
  };

  const handleReplyDrop = (event: DragEvent<HTMLFormElement>) => {
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length === 0 || !selectedThreadAcceptsMessages) {
      setIsReplyDragOver(false);
      return;
    }

    event.preventDefault();
    setIsReplyDragOver(false);
    addFilesToReply(droppedFiles);
    onToast('info', `Added ${droppedFiles.length} dropped file${droppedFiles.length === 1 ? '' : 's'} to this message.`);
    focusReplyComposer();
  };

  const changeGroupImage = async (file?: File | null) => {
    if (!file || !selectedThread || selectedThread.threadType === 'direct' || selectedThread.id.startsWith('draft-group:')) {
      return;
    }

    try {
      const response = await messageService.updateThreadImage(selectedThread.id, file);
      const imageUrl = response.data.imageUrl;
      setInboxMessages((messages) => messages.map((message) => (
        message.threadId === selectedThread.id ? { ...message, threadImageUrl: imageUrl } : message
      )));
      setSentMessages((messages) => messages.map((message) => (
        message.threadId === selectedThread.id ? { ...message, threadImageUrl: imageUrl } : message
      )));
      onToast('success', 'Group image updated.');
      await loadMessages(false);
    } catch (err) {
      console.error('Failed to update group image:', err);
      onToast('error', getApiErrorMessage(err, 'Failed to update group image.'));
    }
  };

  const saveGroupTitle = async () => {
    if (!selectedThread || selectedThread.threadType === 'direct' || selectedThread.id.startsWith('draft-group:')) {
      return;
    }

    const nextTitle = editingThreadTitle.trim();
    if (!nextTitle) {
      onToast('error', 'Enter a group name.');
      return;
    }

    if (nextTitle === selectedThread.contactName) {
      setIsEditingThreadTitle(false);
      return;
    }

    setIsSavingThreadTitle(true);
    try {
      const response = await messageService.updateThreadTitle(selectedThread.id, nextTitle);
      const threadTitle = response.data.threadTitle;
      setInboxMessages((messages) => messages.map((message) => (
        message.threadId === selectedThread.id ? { ...message, threadTitle } : message
      )));
      setSentMessages((messages) => messages.map((message) => (
        message.threadId === selectedThread.id ? { ...message, threadTitle } : message
      )));
      setIsEditingThreadTitle(false);
      onToast('success', 'Group name updated.');
      await loadMessages(false);
    } catch (err) {
      console.error('Failed to update group name:', err);
      onToast('error', getApiErrorMessage(err, 'Failed to update group name.'));
    } finally {
      setIsSavingThreadTitle(false);
    }
  };

  const addEmojiToReply = (emojiData: EmojiClickData) => {
    updateReplyBody(`${replyBody}${emojiData.emoji}`);
    setIsEmojiPickerOpen(false);
  };

  const togglePinnedThread = (threadId: string) => {
    setPinnedThreadIds((current) => (
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [threadId, ...current]
    ));
  };

  const updateReplyBody = (value: string) => {
    setReplyBody(value);

    if (!selectedThread || !selectedThreadAcceptsMessages || selectedThread.threadType !== 'direct') {
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentRef.current > 1600) {
      lastTypingSentRef.current = now;
      messageService.sendTyping(
        currentUser.id,
        selectedThread.id,
        currentUser.displayName || currentUser.email || 'Someone',
        true,
      ).catch((err) => console.error('Failed to send typing status:', err));
    }

    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = window.setTimeout(() => {
      if (selectedThread.threadType === 'direct') {
        messageService.sendTyping(
          currentUser.id,
          selectedThread.id,
          currentUser.displayName || currentUser.email || 'Someone',
          false,
        ).catch((err) => console.error('Failed to clear typing status:', err));
      }
    }, 1800);
  };

  const reactToMessage = async (message: UserMessage, reaction: string) => {
    const currentReaction = getMessageReactionForUser(message, currentUser.id);
    const nextReaction = currentReaction === reaction ? null : reaction;
    try {
      const response = await messageService.react(message.id, currentUser.id, nextReaction);
      const updatedMessage = response.data;
      setInboxMessages((messages) => messages.map((item) => (item.id === updatedMessage.id ? updatedMessage : item)));
      setSentMessages((messages) => messages.map((item) => (item.id === updatedMessage.id ? updatedMessage : item)));
    } catch (err) {
      console.error('Failed to react to message:', err);
      onToast('error', 'Failed to update reaction.');
    }
  };

  const addGroupRecipient = (user: User) => {
    if (user.id === currentUser.id || user.receivesMessages === false) {
      return;
    }

    setDraftRecipient(null);
    setDraftGroupRecipients((recipients) => {
      const nextRecipients = recipients.some((recipient) => recipient.id === user.id) ? recipients : [...recipients, user];
      setSelectedThreadId(getDraftGroupThreadId(nextRecipients));
      return nextRecipients;
    });
    setRecipientQuery('');
    setRecipientResults([]);
  };

  const removeGroupRecipient = (userId: string) => {
    setDraftGroupRecipients((recipients) => recipients.filter((recipient) => recipient.id !== userId));
  };

  const loadDistrictRecipients = async () => {
    if (!currentUser.district) {
      onToast('error', 'Your account does not have a district assigned.');
      return;
    }

    setIsLoadingDistrictRecipients(true);
    try {
      const response = await userService.search('', { district: currentUser.district });
      const users = (response.data as User[]).filter((user) =>
        user.id !== currentUser.id &&
        user.receivesMessages !== false &&
        user.isActive !== false,
      );

      if (users.length === 0) {
        onToast('info', `No message-enabled users found for ${currentUser.district}.`);
        return;
      }

      setDraftRecipient(null);
      setDraftGroupRecipients(users);
      setDraftThreadTitle(`${currentUser.district} District`);
      setSelectedThreadId(getDraftGroupThreadId(users));
      setIsComposeOpen(false);
      focusReplyComposer();
      onToast('success', `Added ${users.length} ${currentUser.district} district member${users.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Failed to load district recipients:', err);
      onToast('error', 'Failed to load district members.');
    } finally {
      setIsLoadingDistrictRecipients(false);
    }
  };

  const sendReply = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!selectedThread || (!replyBody.trim() && replyAttachments.length === 0)) {
      onToast('error', 'Enter a message.');
      return;
    }

    if (selectedThread.contactReceivesMessages === false) {
      onToast('error', `${selectedThread.contactName} is not accepting messages right now.`);
      return;
    }

    setIsSending(true);
    try {
      const uploadedAttachments = await uploadReplyAttachments();
      const messageBody = withAttachmentSummary(replyBody, uploadedAttachments);
      if (selectedThread.threadType !== 'direct') {
        const recipientIds = selectedThread.participantIds.filter((id) => id !== currentUser.id);
        const response = await messageService.sendGroup({
          senderAccountId: currentUser.id,
          recipientUserIds: recipientIds,
          subject: selectedThread.subject || selectedThread.contactName,
          body: messageBody,
          audienceType: selectedThread.threadType === 'district' ? 'district' : 'group',
          threadId: selectedThread.id.startsWith('draft-group:') ? undefined : selectedThread.id,
          threadTitle: selectedThread.contactName,
        });
        setSelectedThreadId(response.data.threadId);
      } else {
        await messageService.send({
          senderAccountId: currentUser.id,
          recipientUserId: selectedThread.id,
          subject: selectedThread.subject,
          body: messageBody,
        });
      }
      setReplyBody('');
      setReplyAttachments([]);
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      if (selectedThread.threadType === 'direct') {
        messageService.sendTyping(
          currentUser.id,
          selectedThread.id,
          currentUser.displayName || currentUser.email || 'Someone',
          false,
        ).catch((err) => console.error('Failed to clear typing status:', err));
      }
      setDraftRecipient(null);
      setDraftGroupRecipients([]);
      setDraftThreadTitle('');
      await loadMessages(false);
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
    } catch (err) {
      console.error(err);
      onToast('error', getApiErrorMessage(err, 'Failed to send message.'));
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (message: UserMessage) => {
    try {
      const response = await messageService.delete(message.id, currentUser.id);
      const updatedMessage = response.data;
      setInboxMessages((messages) => messages.map((item) => (item.id === updatedMessage.id ? updatedMessage : item)));
      setSentMessages((messages) => messages.map((item) => (item.id === updatedMessage.id ? updatedMessage : item)));
      setMessagePendingDelete(null);
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Message deleted.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to delete message.');
    }
  };

  const deleteThread = async (thread: MessageThread) => {
    try {
      const deletedMessageIds = new Set(thread.messages.map((message) => message.id));
      if (!thread.id.startsWith('draft-group:')) {
        await messageService.deleteThread(thread.id, currentUser.id);
      } else {
        await Promise.all(thread.messages.map((message) => messageService.delete(message.id, currentUser.id)));
      }
      setInboxMessages((messages) => messages.filter((message) => !deletedMessageIds.has(message.id)));
      setSentMessages((messages) => messages.filter((message) => !deletedMessageIds.has(message.id)));
      setDraftRecipient((recipient) => (recipient?.id === thread.id ? null : recipient));
      if (thread.id.startsWith('draft-group:')) {
        setDraftGroupRecipients([]);
        setDraftThreadTitle('');
      }
      setPinnedThreadIds((ids) => ids.filter((id) => id !== thread.id));
      setReplyBody('');
      setReplyAttachments([]);
      setThreadSearchTerm('');
      if (selectedThreadId === thread.id) {
        const nextThread = threads.find((item) => item.id !== thread.id);
        setSelectedThreadId(nextThread?.id ?? null);
      }
      setThreadPendingDelete(null);
      await loadMessages(false);
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Conversation deleted.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to delete conversation.');
    }
  };

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendReply();
    }
  };

  const returnToThreadList = () => {
    setSelectedThreadId(null);
    setDraftRecipient(null);
    setDraftGroupRecipients([]);
    setDraftThreadTitle('');
    setThreadSearchTerm('');
    setReplyBody('');
    setReplyAttachments([]);
    setIsEmojiPickerOpen(false);
  };

  const openMentionProfile = async (mention: string) => {
    try {
      const response = await userService.search(mention);
      const normalizedMention = mention.toLowerCase().replace(/\s+/gu, '');
      const user = response.data.find((item: User) => {
        const fullName = `${item.firstName || ''}${item.lastName || ''}`.toLowerCase();
        return fullName === normalizedMention || item.email?.toLowerCase().startsWith(normalizedMention) || item.peNumber?.toLowerCase() === normalizedMention;
      }) || response.data[0];

      if (user) {
        setSelectedMentionUser(user);
      } else {
        onToast('info', 'No matching user found for that mention.');
      }
    } catch (error) {
      console.error('Failed to open mention profile:', error);
      onToast('error', 'Failed to open mentioned profile.');
    }
  };

  const listBreakpoint = isModalView ? 'md' : 'xl';
  const threadListVisibilityClass = selectedThread
    ? listBreakpoint === 'md' ? 'hidden md:flex' : 'hidden xl:flex'
    : 'flex';
  const threadViewVisibilityClass = selectedThread
    ? 'flex'
    : listBreakpoint === 'md' ? 'hidden md:flex' : 'hidden xl:flex';
  const mobileBackClass = listBreakpoint === 'md' ? 'md:hidden' : 'xl:hidden';

  return (
    <div className={isModalView ? 'relative flex h-full min-h-0 flex-col' : 'relative'}>
      {!isModalView && (
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Messages</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Conversations update automatically.
          </p>
        </div>
      </div>
      )}

      {!isModalView && (
        <div className="relative mb-5 w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations"
            className="global-search-input w-full rounded border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
        </div>
      )}

      <div
        className={
          isModalView
            ? 'grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(150px,34%)_minmax(0,1fr)]'
            : 'grid min-h-[70vh] grid-cols-1 gap-4 xl:h-[calc(100vh-230px)] xl:grid-cols-[minmax(260px,30%)_minmax(0,1fr)]'
        }
      >
        <section className={`relative min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 ${threadListVisibilityClass} ${
          isModalView ? 'min-h-[min(32rem,100%)] md:max-h-none md:min-h-0' : 'min-h-[70vh] xl:min-h-0 xl:max-h-none'
        }`}>
          {isModalView && (
            <div className="border-b border-gray-200 p-3 dark:border-gray-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search conversations"
                className="global-search-input w-full rounded border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="loading">Loading conversations...</div>
          ) : filteredThreads.length === 0 ? (
            <div className="empty-state">No conversations found.</div>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto pb-20 dark:divide-gray-800">
              {filteredThreads.map((thread) => {
                const presence = getThreadPresence(thread);
                const isPinned = pinnedThreadIds.includes(thread.id);
                return (
                  <div
                    key={thread.id}
                    className={`flex min-w-0 items-center gap-3 px-3 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800 sm:gap-2.5 sm:px-3 sm:py-3 ${
                      selectedThreadId === thread.id ? 'bg-accent/10 ring-1 ring-inset ring-accent/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className="relative shrink-0"
                      aria-label={`Open ${thread.contactName}`}
                    >
                      {thread.threadType !== 'direct' && thread.threadImageUrl ? (
                        <img
                          src={getAssetThumbnailUrl(thread.threadImageUrl, 96)}
                          alt={thread.contactName}
                          onError={(event) => handleAssetThumbnailError(event, thread.threadImageUrl)}
                          className="h-11 w-11 rounded-full border border-gray-200 object-cover dark:border-gray-700 sm:h-10 sm:w-10"
                        />
                      ) : thread.threadType !== 'direct' ? (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-primary-500/10 text-primary-500 dark:border-gray-700 dark:text-blue-100 sm:h-10 sm:w-10">
                          {thread.threadType === 'district' ? <Building2 size={17} /> : <Users size={17} />}
                        </span>
                      ) : thread.contactProfilePictureUrl ? (
                        <img
                          src={getAssetThumbnailUrl(thread.contactProfilePictureUrl, 96)}
                          alt={thread.contactName}
                          onError={(event) => handleAssetThumbnailError(event, thread.contactProfilePictureUrl)}
                          className="h-11 w-11 rounded-full border border-gray-200 object-cover dark:border-gray-700 sm:h-10 sm:w-10"
                        />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-accent/10 text-xs font-bold text-accent dark:border-gray-700 sm:h-10 sm:w-10">
                          {getInitials(thread.contactName)}
                        </span>
                      )}
                      {thread.threadType === 'direct' && (
                        <span
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-900 ${
                            presence.status === 'busy'
                              ? 'animate-pulse bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.22)]'
                              : presence.status === 'away'
                                ? 'animate-pulse bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.22)]'
                                : presence.online
                                  ? 'bg-green-500'
                                  : 'bg-gray-400'
                          }`}
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className="min-h-12 min-w-0 flex-1 text-left sm:min-h-11"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`truncate text-[15px] sm:text-sm ${thread.unreadCount > 0 ? 'font-bold text-primary-500' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                            <span className="truncate">{isPinned ? 'Pinned ' : ''}{thread.contactName}</span>
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {presence.label}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-400 sm:text-xs">{thread.latestMessage ? formatMessageTime(thread.latestMessage.createdAt) : 'New'}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="line-clamp-1 min-w-0 text-[13px] text-gray-500 dark:text-gray-400 sm:text-sm">
                          {thread.latestMessage ? `${thread.latestMessage.senderAccountId === currentUser.id ? 'You: ' : ''}${getMessagePreviewText(thread.latestMessage)}` : 'Start typing on the right'}
                        </p>
                        {thread.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                            {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinnedThread(thread.id)}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-accent/10 ${isPinned ? 'text-accent' : 'text-gray-500'} sm:h-9 sm:w-9`}
                      aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                      title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    >
                      {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreadPendingDelete(thread)}
                      disabled={!thread.latestMessage}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-white shadow-sm hover:bg-red-800 sm:h-9 sm:w-9"
                      aria-label="Delete conversation"
                      title="Delete conversation"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {isComposeOpen && createPortal((
            <>
            {isCompactComposeOpen && (
              <button
                type="button"
                className="fixed inset-0 z-[94] bg-black/35 backdrop-blur-[2px]"
                onClick={() => {
                  setIsComposeOpen(false);
                  setRecipientQuery('');
                  setRecipientResults([]);
                }}
                aria-label="Close new message"
              />
            )}
            <div
              className={[
                'quick-launch-context-menu fixed z-[95] overflow-y-auto border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-950 dark:ring-white/10',
                isCompactComposeOpen
                  ? 'inset-x-3 max-h-[min(42rem,calc(100dvh-2rem))] rounded-2xl p-4'
                  : 'max-h-[min(34rem,calc(100vh-6rem))] w-[min(25rem,calc(100vw-1.5rem))] rounded-lg p-3',
              ].join(' ')}
              style={isCompactComposeOpen ? { bottom: composeKeyboardInset } : { right: composePopoverPosition.right, bottom: composePopoverPosition.bottom }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-500 dark:text-blue-100">
                    <Send size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-gray-900 dark:text-gray-100">New Message</p>
                    <p className="truncate text-xs font-semibold text-gray-500 dark:text-gray-400">Start a chat, group, or district message</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsComposeOpen(false);
                    setRecipientQuery('');
                    setRecipientResults([]);
                    setDraftGroupRecipients([]);
                    setDraftThreadTitle('');
                  }}
                  className="icon-close-button h-8 w-8"
                  aria-label="Close new message"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  placeholder="Search name, PE, or email"
                  className="global-search-input w-full rounded-xl border border-gray-300 bg-white py-3 text-[16px] dark:border-gray-700 dark:bg-gray-900 sm:rounded sm:py-2 sm:text-sm"
                  autoFocus={!isCompactComposeOpen}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadDistrictRecipients()}
                  disabled={isLoadingDistrictRecipients}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 text-xs font-bold text-accent transition hover:bg-accent/15 disabled:opacity-60"
                  aria-label="Message district members"
                  title="Message district members"
                >
                  <Building2 size={14} />
                  <span>{isLoadingDistrictRecipients ? 'Loading...' : 'My District'}</span>
                </button>
                {draftGroupRecipients.length > 0 && (
                  <span className="inline-flex h-10 items-center rounded-full border border-primary-500/20 bg-primary-500/10 px-3 text-xs font-bold text-primary-500 dark:text-blue-100">
                    {draftGroupRecipients.length} selected
                  </span>
                )}
              </div>

              {draftGroupRecipients.length > 0 && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Group name</span>
                    <input
                      value={draftThreadTitle}
                      onChange={(event) => setDraftThreadTitle(event.target.value)}
                      placeholder="Optional group name"
                      className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-950"
                    />
                  </label>
                  <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {draftGroupRecipients.map((user) => (
                      <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-1 text-xs font-bold text-accent">
                        {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                        <button type="button" onClick={() => removeGroupRecipient(user.id)} aria-label="Remove recipient" title="Remove">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(getDraftGroupThreadId(draftGroupRecipients));
                      setIsComposeOpen(false);
                      setRecipientQuery('');
                      setRecipientResults([]);
                      focusReplyComposer();
                    }}
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-primary-500 px-3 text-sm font-bold text-white transition hover:bg-primary-600"
                  >
                    <Send size={15} />
                    Start Group Chat
                  </button>
                </div>
              )}

              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:rounded-lg">
                {isRecipientSearching ? (
                  <div className="px-3 py-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Searching...</div>
                ) : recipientResults.length === 0 ? (
                  <div className="px-3 py-4 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {recipientQuery.trim().length < 2 ? 'Type at least 2 characters to search people.' : 'No matching users found.'}
                  </div>
                ) : (
                  recipientResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 sm:py-2.5"
                    >
                      {user.profilePictureUrl ? (
                        <img
                          src={getAssetThumbnailUrl(user.profilePictureUrl, 96)}
                          alt={`${user.firstName} ${user.lastName}`}
                          onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                          {getInitials(`${user.firstName} ${user.lastName}`)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-gray-800 dark:text-gray-100">{user.firstName} {user.lastName}</span>
                        <span className="block truncate text-xs font-semibold text-gray-500">{user.email || user.peNumber}</span>
                      </span>
                      {user.receivesMessages === false ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-danger dark:bg-red-950">Off</span>
                      ) : (
                        <span className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDraftRecipient(user);
                              setDraftGroupRecipients([]);
                              setDraftThreadTitle('');
                              setSelectedThreadId(user.id);
                              setRecipientQuery('');
                              setRecipientResults([]);
                              setIsComposeOpen(false);
                              setReplyBody('');
                              setReplyAttachments([]);
                              focusReplyComposer();
                            }}
                            className="inline-flex h-9 items-center rounded-full bg-primary-500 px-3 text-xs font-bold text-white hover:bg-primary-600"
                          >
                            Chat
                          </button>
                          <button
                            type="button"
                            onClick={() => addGroupRecipient(user)}
                            className="inline-flex h-9 items-center rounded-full bg-accent px-3 text-xs font-bold text-white hover:bg-accent/90"
                          >
                            Add
                          </button>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            </>
          ), document.body)}
          <button
            ref={composeButtonRef}
            type="button"
            onClick={() => {
              setIsComposeOpen((value) => !value);
              setRecipientQuery('');
              setRecipientResults([]);
              if (isComposeOpen) {
                setDraftGroupRecipients([]);
                setDraftThreadTitle('');
              }
            }}
            className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600"
            aria-label="New message"
            title="New message"
          >
            {isComposeOpen ? <X size={22} /> : <Plus size={22} />}
          </button>
        </section>

        <section className={`${threadViewVisibilityClass} min-h-0 min-w-0 flex-col rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800`}>
          {!selectedThread ? (
            <div className="empty-state">Select a conversation to view it.</div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800 sm:px-4 sm:py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      returnToThreadList();
                    }}
                    className={`${mobileBackClass} flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-primary-500 shadow-sm dark:border-gray-700 dark:text-blue-100`}
                    aria-label="Back to conversations"
                    title="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="relative shrink-0">
                    {selectedThread.threadType !== 'direct' ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedThread.id.startsWith('draft-group:')) {
                            groupImageInputRef.current?.click();
                          }
                        }}
                        className="group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-primary-500/10 text-primary-500 shadow-sm dark:border-gray-700 dark:text-blue-100"
                        aria-label="Change group image"
                        title={selectedThread.id.startsWith('draft-group:') ? 'Send a message before changing group image' : 'Change group image'}
                      >
                        {selectedThread.threadImageUrl ? (
                          <img
                            src={getAssetThumbnailUrl(selectedThread.threadImageUrl, 96)}
                            alt={selectedThread.contactName}
                            onError={(event) => handleAssetThumbnailError(event, selectedThread.threadImageUrl)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          selectedThread.threadType === 'district' ? <Building2 size={20} /> : <Users size={20} />
                        )}
                        {!selectedThread.id.startsWith('draft-group:') && (
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white group-hover:flex">
                            <ImageIcon size={15} />
                          </span>
                        )}
                      </button>
                    ) : selectedThread.contactProfilePictureUrl ? (
                      <img
                        src={getAssetThumbnailUrl(selectedThread.contactProfilePictureUrl, 96)}
                        alt={selectedThread.contactName}
                        onError={(event) => handleAssetThumbnailError(event, selectedThread.contactProfilePictureUrl)}
                        className="h-12 w-12 rounded-full border border-gray-200 object-cover shadow-sm dark:border-gray-700"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-accent/10 text-sm font-bold text-accent shadow-sm dark:border-gray-700">
                        {getInitials(selectedThread.contactName)}
                      </div>
                    )}
                    <input
                      ref={groupImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void changeGroupImage(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="flex min-w-0 items-center gap-2">
                      {isEditingThreadTitle && selectedThread.threadType !== 'direct' ? (
                        <form
                          className="flex min-w-0 items-center gap-1.5"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveGroupTitle();
                          }}
                        >
                          <input
                            value={editingThreadTitle}
                            onChange={(event) => setEditingThreadTitle(event.target.value)}
                            className="min-w-0 rounded border border-gray-300 bg-white px-2 py-1 text-sm font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            aria-label="Group name"
                            maxLength={180}
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
                            disabled={isSavingThreadTitle}
                            aria-label="Save group name"
                            title="Save"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingThreadTitle(false);
                              setEditingThreadTitle(selectedThread.contactName);
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                            aria-label="Cancel group name edit"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <h2 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{selectedThread.contactName}</h2>
                          {selectedThread.threadType !== 'direct' && !selectedThread.id.startsWith('draft-group:') && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingThreadTitle(selectedThread.contactName);
                                setIsEditingThreadTitle(true);
                              }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-primary-500 dark:hover:bg-gray-800"
                              aria-label="Edit group name"
                              title="Edit group name"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {selectedThread.threadType === 'direct' && (
                            <PresenceDot isOnline={selectedPresence?.online === true} status={selectedPresence?.status || 'active'} />
                          )}
                        </>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RankBadge rank={selectedThread.contactRank} compact subtle />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {selectedPresence?.label || getPresenceLabel(selectedThread.contactLastSeenAt)}
                      </span>
                      {selectedThreadMemberPreviews.length > 0 && (
                        <div
                          className={`message-member-stack ${selectedThreadMemberPreviews.length > 6 ? 'message-member-stack-collapsed' : ''}`}
                          aria-label={`${selectedThreadMemberPreviews.length} group members`}
                        >
                          {selectedThreadMemberPreviews.slice(0, 6).map((member, index) => (
                            <span
                              key={member.id}
                              className="message-member-avatar"
                              style={{ zIndex: selectedThreadMemberPreviews.length - index }}
                              title={member.name}
                            >
                              {member.profilePictureUrl ? (
                                <img
                                  src={getAssetThumbnailUrl(member.profilePictureUrl, 96)}
                                  alt={member.name}
                                  onError={(event) => handleAssetThumbnailError(event, member.profilePictureUrl)}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span>{getInitials(member.name)}</span>
                              )}
                            </span>
                          ))}
                          {selectedThreadMemberPreviews.length > 6 && (
                            <span className="message-member-avatar message-member-overflow" title={`${selectedThreadMemberPreviews.length - 6} more members`}>
                              +{selectedThreadMemberPreviews.length - 6}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!selectedThreadAcceptsMessages && (
                      <p className="mt-1 text-xs font-bold text-danger">
                        Not accepting messages
                      </p>
                    )}
                  </div>
                  </div>
                </div>
                <div className="relative mt-2 sm:mt-3">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={threadSearchTerm}
                    onChange={(event) => setThreadSearchTerm(event.target.value)}
                    placeholder="Search this conversation"
                    className="global-search-input w-full rounded border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                </div>
                {selectedTyping && (
                  <p className="mt-2 text-xs font-semibold text-accent">{selectedTyping.name} is typing...</p>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-950 sm:space-y-4 sm:p-4">
                {selectedThread.messages.length === 0 && (
                  <div className="flex h-full min-h-48 items-center justify-center text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">New chat with {selectedThread.contactName}</p>
                      <p className="mt-1 text-xs font-semibold text-gray-400">Type below to send the first message.</p>
                    </div>
                  </div>
                )}
                {selectedThread.messages.length > 0 && displayedMessages.length === 0 && (
                  <div className="flex h-full min-h-48 items-center justify-center text-center text-sm font-semibold text-gray-500">
                    No messages match this search.
                  </div>
                )}
                {displayedMessages.map((message, index) => {
                  const isMine = message.senderAccountId === currentUser.id;
                  const previousMessage = displayedMessages[index - 1];
                  const myReaction = getMessageReactionForUser(message, currentUser.id);
                  const reactionIcons = getMessageReactionIcons(message, currentUser.id);
                  const showTimestamp =
                    !previousMessage ||
                    new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() > 10 * 60 * 1000;
                  const isSystem = isSystemMessage(message);
                  const isDeleted = isDeletedMessage(message);

                  return (
                    <div key={message.id} ref={index === displayedMessages.length - 1 ? latestMessageRef : undefined}>
                      {unreadDividerMessageId === message.id && !threadSearchTerm.trim() && (
                        <div className="my-3 flex items-center gap-3">
                          <span className="h-px flex-1 bg-accent/30" />
                          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">Unread</span>
                          <span className="h-px flex-1 bg-accent/30" />
                        </div>
                      )}
                      {showTimestamp && (
                        <div className="mb-3 text-center text-xs font-semibold text-gray-400">
                          {new Date(message.createdAt).toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                      {isSystem ? (
                        <div className="my-3 flex justify-center">
                          <span className="wrap-anywhere max-w-[90%] rounded-full border border-gray-200 bg-white px-3 py-1.5 text-center text-xs font-bold text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            {getSystemMessageText(message)}
                          </span>
                        </div>
                      ) : (
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`group flex min-w-0 max-w-[86%] flex-col sm:max-w-[78%] ${isMine ? 'items-end text-right' : 'items-start text-left'}`}>
                          <div className={`wrap-anywhere relative inline-block w-fit max-w-full rounded-[1.25rem] px-3.5 py-2.5 shadow-sm sm:rounded-[1.35rem] sm:px-4 ${
                            isDeleted
                              ? 'border border-dashed border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              : isMine
                                ? 'rounded-br-md bg-[#007AFF] text-white'
                                : 'rounded-bl-md border border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-white dark:text-gray-900'
                          }`}>
                            {!isDeleted && reactionIcons.length > 0 && (
                              <span
                                key={`${message.id}-${reactionIcons.join('-')}`}
                                className="message-tapback absolute -left-2 -top-3 inline-flex min-h-7 min-w-8 items-center justify-center gap-0.5 rounded-full border border-white bg-white px-1.5 text-sm shadow-lg ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-900 dark:ring-white/10"
                              >
                                {reactionIcons.map((icon, reactionIndex) => (
                                  <span key={`${icon}-${reactionIndex}`} className="leading-none">{icon}</span>
                                ))}
                              </span>
                            )}
                            <div className="wrap-anywhere min-w-0 space-y-2 text-left text-[15px] leading-6 sm:text-sm">
                              {isDeleted ? (
                                <p className="text-sm font-semibold italic">Message deleted</p>
                              ) : message.body.split(/\n/gu).map((line, lineIndex) => {
                                const attachment = parseAttachmentLine(line);
                                return attachment ? (
                                  <a
                                    key={`${message.id}-attachment-${lineIndex}`}
                                    href={getAssetUrl(attachment.fileUrl)}
                                    download={attachment.fileName}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                                      isMine
                                        ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                                        : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                                    }`}
                                  >
                                    <Download size={15} />
                                    <span className="wrap-anywhere min-w-0 flex-1">{attachment.fileName}</span>
                                  </a>
                                ) : isMessageImageUrl(line) ? (
                                  <img
                                    key={`${message.id}-image-${lineIndex}`}
                                    src={getAssetUrl(line)}
                                    alt="Message upload"
                                    onError={handleAssetImageError}
                                    className="max-h-72 max-w-full rounded-lg object-contain"
                                  />
                                ) : (
                                  <p key={`${message.id}-text-${lineIndex}`} className="wrap-anywhere whitespace-pre-wrap">
                                    <MentionText
                                      text={line || ' '}
                                      className="wrap-anywhere"
                                      mentionClassName={isMine ? 'font-bold text-white underline decoration-white/80 underline-offset-2' : 'font-bold text-blue-700 underline underline-offset-2'}
                                      onMentionClick={openMentionProfile}
                                    />
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                          <div className={`mt-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-gray-400 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span>{formatMessageTime(message.createdAt)}</span>
                            {isMine && (
                              <span className="inline-flex items-center gap-1">
                                {message.isRead ? <CheckCheck size={12} /> : <Check size={12} />}
                                {getDeliveryLabel(message)}
                              </span>
                            )}
                          </div>
                          <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-400 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {!isDeleted && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setMessagePendingDelete(message)}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white opacity-100 shadow-sm transition hover:bg-red-800 sm:opacity-0 sm:group-hover:opacity-100"
                                  aria-label="Delete message"
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                  <SmilePlus size={13} />
                                  {messageReactionOptions.map((reaction) => (
                                    <button
                                      key={reaction.key}
                                      type="button"
                                      onClick={() => void reactToMessage(message, reaction.key)}
                                      className={`rounded-full px-1.5 py-0.5 hover:bg-accent/10 ${myReaction === reaction.key ? 'bg-accent/10 text-accent' : ''}`}
                                      aria-label={reaction.label}
                                      title={reaction.label}
                                    >
                                      {reaction.icon}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
                {selectedTyping && (
                  <div className="flex justify-start">
                    <div className="rounded-[1.35rem] rounded-bl-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-500 shadow-sm dark:border-gray-800">
                      typing...
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={sendReply}
                onDragOver={handleReplyDragOver}
                onDragLeave={handleReplyDragLeave}
                onDrop={handleReplyDrop}
                className={`relative border-t border-gray-200 p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] transition dark:border-gray-800 sm:p-4 ${isReplyDragOver ? 'bg-accent/5' : ''}`}
              >
                {isReplyDragOver && (
                  <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-white/85 text-sm font-black uppercase tracking-[0.14em] text-accent shadow-lg backdrop-blur dark:bg-gray-950/85">
                    Drop files to attach
                  </div>
                )}
                {!selectedThreadAcceptsMessages && (
                  <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-danger dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {selectedThread.contactName} is not accepting messages right now.
                  </div>
                )}
                {replyAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {replyAttachments.map((file) => (
                      <span key={`${file.name}-${file.size}`} className="wrap-anywhere min-w-0 max-w-full rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`relative flex min-h-14 items-end gap-1.5 rounded-2xl border bg-white px-2.5 py-2 shadow-sm transition duration-200 dark:bg-gray-950 sm:items-center sm:gap-2 sm:rounded-full sm:px-3 sm:py-1.5 ${
                  isComposerFocused
                    ? 'border-primary-500 shadow-[0_10px_28px_rgba(26,54,93,0.16)] ring-2 ring-primary-500/10 dark:border-blue-300 dark:ring-blue-300/10'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen((value) => !value)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg hover:bg-gray-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8"
                    aria-label="Add emoji"
                  >
                    {emojiButtonLabel}
                  </button>
                  {isEmojiPickerOpen && (
                    <div className="absolute bottom-[calc(100%+0.75rem)] left-0 z-40 overflow-hidden rounded-lg border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                      <Suspense fallback={<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading...</div>}>
                        <EmojiPicker
                          onEmojiClick={addEmojiToReply}
                          width={280}
                          height={320}
                          previewConfig={{ showPreview: false }}
                          searchDisabled={false}
                          skinTonesDisabled
                        />
                      </Suspense>
                    </div>
                  )}
                  <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-500 hover:bg-gray-100 dark:text-blue-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8" title="Attach files">
                    <Paperclip size={18} />
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addFilesToReply(Array.from(event.target.files || []));
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => messageImageInputRef.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary-500 hover:bg-gray-100 dark:text-blue-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8"
                    aria-label="Upload image"
                    title="Upload image"
                  >
                    <ImageIcon size={18} />
                  </button>
                  <input
                    ref={messageImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void appendMessageImage(file);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                  <MentionTextarea
                    ref={replyTextareaRef}
                    value={replyBody}
                    onChange={updateReplyBody}
                    wrapperClassName="min-w-0 flex-1"
                    onKeyDown={handleReplyKeyDown}
                    onPaste={handleMessagePaste}
                    onFocus={() => setIsComposerFocused(true)}
                    onBlur={() => setIsComposerFocused(false)}
                    placeholder={selectedThreadAcceptsMessages ? 'Message' : 'Messages are disabled for this user'}
                    disabled={!selectedThreadAcceptsMessages}
                    rows={1}
                    className="min-h-10 resize-none overflow-hidden border-0 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none ring-0 focus:border-0 focus:ring-0 dark:bg-transparent sm:min-h-8 sm:py-1.5 sm:text-sm sm:leading-5"
                  />
                  <button type="submit" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9" disabled={isSending || !selectedThreadAcceptsMessages} aria-label="Send message">
                    <Send size={17} />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {threadPendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Conversation</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Delete the conversation with {threadPendingDelete.contactName}?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThreadPendingDelete(null)}
                className="icon-close-button h-9 w-9"
                aria-label="Close delete confirmation"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setThreadPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete conversation" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" onClick={() => deleteThread(threadPendingDelete)} className="btn-danger" aria-label="Delete conversation" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {messagePendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Message</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Delete this message from your mailbox?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMessagePendingDelete(null)} className="btn-secondary" aria-label="Cancel delete message" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" onClick={() => deleteMessage(messagePendingDelete)} className="btn-danger" aria-label="Delete message" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMentionUser && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg">
            <UserDetail
              user={selectedMentionUser}
              onClose={() => setSelectedMentionUser(null)}
              onToast={onToast}
              canEdit={currentUser.role === 'administrator'}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageInboxPage;
