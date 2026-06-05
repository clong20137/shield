import { FormEvent, KeyboardEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Pin, PinOff, Search, SmilePlus, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { AuthAccount, getAssetThumbnailUrl, getMessageEventsUrl, handleAssetThumbnailError, messageService, userService, User, UserMessage } from '../services/api';
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
}

interface MessageThread {
  id: string;
  contactName: string;
  contactEmail: string;
  contactRank: string;
  contactProfilePictureUrl: string;
  contactLastSeenAt: string | null;
  contactReceivesMessages: boolean;
  subject: string;
  latestMessage?: UserMessage;
  messages: UserMessage[];
  unreadCount: number;
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

function getPresenceDisplay(value: string | null | undefined, isOnline: boolean): string {
  if (!value) {
    return 'Never';
  }

  const lastActivityTime = new Date(value).getTime();
  if (Number.isNaN(lastActivityTime)) {
    return 'Never';
  }

  return isOnline ? 'Active' : `Last online ${formatMessageTime(value)}`;
}

function PresenceDot({ isOnline, className = '' }: { isOnline: boolean; className?: string }) {
  return (
    <span
      className={`relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} ${className}`}
      title={isOnline ? 'Online' : 'Offline'}
      aria-label={isOnline ? 'Online' : 'Offline'}
    >
      {isOnline && <span className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-75" />}
    </span>
  );
}

function getThreadId(message: UserMessage, currentUserId: string): string {
  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function getContactName(message: UserMessage, currentUserId: string): string {
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

function MessageInboxPage({ currentUser, onToast, isModalView = false, targetRecipient = null }: MessageInboxPageProps) {
  const [inboxMessages, setInboxMessages] = useState<UserMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<UserMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
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
  const [isRecipientSearching, setIsRecipientSearching] = useState(false);
  const [messagePendingDelete, setMessagePendingDelete] = useState<UserMessage | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] = useState<MessageThread | null>(null);
  const [selectedMentionUser, setSelectedMentionUser] = useState<User | null>(null);
  const [presenceByAccount, setPresenceByAccount] = useState<Record<string, { online: boolean; lastSeenAt: string | null }>>({});
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
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
    setSelectedThreadId(targetRecipient.id);
    setIsComposeOpen(false);
    setRecipientQuery('');
    setRecipientResults([]);
    setReplyBody('');
    setReplyAttachments([]);
    setSearchTerm('');
  }, [currentUser.id, onToast, targetRecipient]);

  const loadMessages = async (showLoading = false) => {
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMessages(true);
    const eventsUrl = getMessageEventsUrl();
    const eventSource = new EventSource(eventsUrl, { withCredentials: true });
    const handleRealtimeMessageUpdate = () => loadMessages(false);
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
      eventSource?.close();
      window.removeEventListener('shield:api-reconnected', handleRealtimeMessageUpdate);
    };
  }, [currentUser.id]);

  useEffect(() => {
    window.localStorage.setItem(`${PINNED_THREADS_KEY_PREFIX}_${currentUser.id}`, JSON.stringify(pinnedThreadIds));
  }, [currentUser.id, pinnedThreadIds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingByThread((current) => {
        const entries = Object.entries(current).filter(([, value]) => value.expiresAt > now);
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, []);

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
          setRecipientResults(
            response.data
              .filter((user: User) => user.id !== currentUser.id)
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
  }, [currentUser.id, isComposeOpen, recipientQuery]);

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
          contactLastSeenAt: getContactLastSeenAt(message, currentUser.id),
          contactReceivesMessages: getContactReceivesMessages(message, currentUser.id),
          subject,
          latestMessage: message,
          messages: [message],
          unreadCount: message.recipientUserId === currentUser.id && !message.isRead ? 1 : 0,
        });
        return;
      }

      existingThread.messages.push(message);
      existingThread.latestMessage = message;
      existingThread.contactLastSeenAt = getContactLastSeenAt(message, currentUser.id);
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
    const draftThread: MessageThread | null = draftRecipient && !existingDraftThread
      ? {
          id: draftRecipient.id,
          contactName: `${draftRecipient.firstName || ''} ${draftRecipient.lastName || ''}`.trim() || draftRecipient.email || 'New Chat',
          contactEmail: draftRecipient.email || '',
          contactRank: draftRecipient.rank || '',
          contactProfilePictureUrl: draftRecipient.profilePictureUrl || '',
          contactLastSeenAt: draftRecipient.lastSeenAt || null,
          contactReceivesMessages: draftRecipient.receivesMessages !== false,
          subject: 'Message',
          messages: [],
          unreadCount: 0,
        }
      : null;
    const visibleThreads = draftThread ? [draftThread, ...threads] : threads;
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
  }, [draftRecipient, searchTerm, threads]);

  const selectedThread = filteredThreads.find((thread) => thread.id === selectedThreadId) || null;
  const selectedThreadAcceptsMessages = selectedThread?.contactReceivesMessages !== false;
  const selectedTyping = selectedThreadId ? typingByThread[selectedThreadId] : null;
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
    const realtimePresence = presenceByAccount[thread.id];
    const lastSeenAt = realtimePresence?.lastSeenAt || thread.contactLastSeenAt;
    const online = realtimePresence?.online === true;
    return {
      online,
      lastSeenAt,
      label: getPresenceDisplay(lastSeenAt, online),
    };
  };
  const selectedPresence = selectedThread ? getThreadPresence(selectedThread) : null;

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

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

  const withAttachmentSummary = (body: string, files: File[]) => {
    if (files.length === 0) {
      return body;
    }

    return `${body.trim()}\n\nAttachments: ${files.map((file) => file.name).join(', ')}`;
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

    if (!selectedThread || !selectedThreadAcceptsMessages) {
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
      messageService.sendTyping(
        currentUser.id,
        selectedThread.id,
        currentUser.displayName || currentUser.email || 'Someone',
        false,
      ).catch((err) => console.error('Failed to clear typing status:', err));
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

  const sendReply = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!selectedThread || !replyBody.trim()) {
      onToast('error', 'Enter a message.');
      return;
    }

    if (selectedThread.contactReceivesMessages === false) {
      onToast('error', `${selectedThread.contactName} is not accepting messages right now.`);
      return;
    }

    setIsSending(true);
    try {
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: selectedThread.id,
        subject: selectedThread.subject,
        body: withAttachmentSummary(replyBody, replyAttachments),
      });
      setReplyBody('');
      setReplyAttachments([]);
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      messageService.sendTyping(
        currentUser.id,
        selectedThread.id,
        currentUser.displayName || currentUser.email || 'Someone',
        false,
      ).catch((err) => console.error('Failed to clear typing status:', err));
      setDraftRecipient(null);
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
      await messageService.delete(message.id, currentUser.id);
      setInboxMessages((messages) => messages.filter((item) => item.id !== message.id));
      setSentMessages((messages) => messages.filter((item) => item.id !== message.id));
      setMessagePendingDelete(null);
      await loadMessages(false);
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
      await Promise.all(thread.messages.map((message) => messageService.delete(message.id, currentUser.id)));
      setInboxMessages((messages) => messages.filter((message) => !deletedMessageIds.has(message.id)));
      setSentMessages((messages) => messages.filter((message) => !deletedMessageIds.has(message.id)));
      setDraftRecipient((recipient) => (recipient?.id === thread.id ? null : recipient));
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
        <section className={`relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 ${
          isModalView ? 'max-h-[34vh] min-h-[12rem] md:max-h-none md:min-h-0' : 'max-h-[34vh] min-h-[14rem] xl:max-h-none'
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
          {isComposeOpen && (
            <div className="border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">New Chat</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsComposeOpen(false);
                    setRecipientQuery('');
                    setRecipientResults([]);
                  }}
                  className="icon-close-button h-8 w-8"
                  aria-label="Close new chat search"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <input
                value={recipientQuery}
                onChange={(event) => setRecipientQuery(event.target.value)}
                placeholder="Type a name"
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-900"
              />
              {(recipientResults.length > 0 || isRecipientSearching) && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {isRecipientSearching ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
                  ) : (
                    recipientResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        disabled={user.receivesMessages === false}
                        onClick={() => {
                          setDraftRecipient(user);
                          setSelectedThreadId(user.id);
                          setRecipientQuery('');
                          setRecipientResults([]);
                          setIsComposeOpen(false);
                          setReplyBody('');
                          setReplyAttachments([]);
                        }}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-red-50 disabled:text-danger dark:hover:bg-gray-800 dark:disabled:bg-red-950 sm:gap-3 sm:px-3"
                      >
                        {user.profilePictureUrl ? (
                          <img
                            src={getAssetThumbnailUrl(user.profilePictureUrl, 96)}
                            alt={`${user.firstName} ${user.lastName}`}
                            onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                            className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent sm:h-9 sm:w-9">
                            {getInitials(`${user.firstName} ${user.lastName}`)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{user.firstName} {user.lastName}</span>
                          <span className="block truncate text-xs text-gray-500">{user.email || user.peNumber}</span>
                        </span>
                        {user.receivesMessages === false && <span className="text-xs font-bold text-danger">Off</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {isLoading ? (
            <div className="loading">Loading conversations...</div>
          ) : filteredThreads.length === 0 ? (
            <div className="empty-state">No conversations found.</div>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto pb-20 dark:divide-gray-800">
              {filteredThreads.map((thread) => {
                const presence = getThreadPresence(thread);
                const isPinned = pinnedThreadIds.includes(thread.id);
                return (
                  <div
                    key={thread.id}
                    className={`flex min-w-0 items-center gap-2 px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 sm:gap-2.5 sm:px-3 sm:py-3 ${
                      selectedThreadId === thread.id ? 'bg-accent/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className="relative shrink-0"
                      aria-label={`Open ${thread.contactName}`}
                    >
                      {thread.contactProfilePictureUrl ? (
                        <img
                          src={getAssetThumbnailUrl(thread.contactProfilePictureUrl, 96)}
                          alt={thread.contactName}
                          onError={(event) => handleAssetThumbnailError(event, thread.contactProfilePictureUrl)}
                          className="h-10 w-10 rounded-full border border-gray-200 object-cover dark:border-gray-700"
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-accent/10 text-xs font-bold text-accent dark:border-gray-700">
                          {getInitials(thread.contactName)}
                        </span>
                      )}
                      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-900 ${presence.online ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className="min-h-11 min-w-0 flex-1 text-left"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${thread.unreadCount > 0 ? 'font-bold text-primary-500' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                            <span className="truncate">{isPinned ? 'Pinned ' : ''}{thread.contactName}</span>
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {presence.label}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-400 sm:text-xs">{thread.latestMessage ? formatMessageTime(thread.latestMessage.createdAt) : 'New'}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="line-clamp-1 min-w-0 text-sm text-gray-500 dark:text-gray-400">
                          {thread.latestMessage ? `${thread.latestMessage.senderAccountId === currentUser.id ? 'You: ' : ''}${thread.latestMessage.body}` : 'Start typing on the right'}
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
          <button
            type="button"
            onClick={() => {
              setIsComposeOpen((value) => !value);
              setRecipientQuery('');
              setRecipientResults([]);
            }}
            className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600"
            aria-label="New message"
            title="New message"
          >
            {isComposeOpen ? <X size={22} /> : <Plus size={22} />}
          </button>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          {!selectedThread ? (
            <div className="empty-state">Select a conversation to view it.</div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    {selectedThread.contactProfilePictureUrl ? (
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
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{selectedThread.contactName}</h2>
                      <PresenceDot isOnline={selectedPresence?.online === true} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RankBadge rank={selectedThread.contactRank} compact subtle />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {selectedPresence?.label || getPresenceLabel(selectedThread.contactLastSeenAt)}
                      </span>
                    </div>
                    {!selectedThreadAcceptsMessages && (
                      <p className="mt-1 text-xs font-bold text-danger">
                        Not accepting messages
                      </p>
                    )}
                  </div>
                  </div>
                </div>
                <div className="relative mt-3">
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

              <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-950 sm:p-4">
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
                  const otherReaction = getMessageReactionForOtherUser(message, currentUser.id);
                  const showTimestamp =
                    !previousMessage ||
                    new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() > 10 * 60 * 1000;

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
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`group flex max-w-[90%] flex-col sm:max-w-[78%] ${isMine ? 'items-end text-right' : 'items-start text-left'}`}>
                          <div className={`inline-block w-fit max-w-full rounded-[1.35rem] px-4 py-2.5 shadow-sm ${
                            isMine
                              ? 'rounded-br-md bg-[#007AFF] text-white'
                              : 'rounded-bl-md border border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-white dark:text-gray-900'
                          }`}>
                            <p className="whitespace-pre-wrap text-left text-sm leading-6">
                              <MentionText
                                text={message.body}
                                mentionClassName={isMine ? 'font-bold text-white underline decoration-white/80 underline-offset-2' : 'font-bold text-blue-700 underline underline-offset-2'}
                                onMentionClick={openMentionProfile}
                              />
                            </p>
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
                          {(myReaction || otherReaction) && (
                            <div className={`mt-1 flex gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              {otherReaction && <span className="rounded-full bg-white px-2 py-0.5 text-xs shadow dark:bg-gray-900">{getReactionIcon(otherReaction)}</span>}
                              {myReaction && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent shadow">{getReactionIcon(myReaction)}</span>}
                            </div>
                          )}
                          <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-400 ${isMine ? 'justify-end' : 'justify-start'}`}>
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
                          </div>
                        </div>
                      </div>
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

              <form onSubmit={sendReply} className="border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4">
                {!selectedThreadAcceptsMessages && (
                  <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-danger dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {selectedThread.contactName} is not accepting messages right now.
                  </div>
                )}
                {replyAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {replyAttachments.map((file) => (
                      <span key={`${file.name}-${file.size}`} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 sm:rounded-full sm:py-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen((value) => !value)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg hover:bg-gray-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8"
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
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-500 hover:bg-gray-100 dark:text-blue-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8" title="Attach files">
                    <Paperclip size={18} />
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setReplyAttachments(Array.from(event.target.files || []))}
                    />
                  </label>
                  <MentionTextarea
                    value={replyBody}
                    onChange={updateReplyBody}
                    wrapperClassName="min-w-0 flex-1"
                    onKeyDown={handleReplyKeyDown}
                    placeholder={selectedThreadAcceptsMessages ? 'Message. Use @name to mention someone.' : 'Messages are disabled for this user'}
                    disabled={!selectedThreadAcceptsMessages}
                    rows={1}
                    className="min-h-10 resize-none overflow-hidden border-0 bg-transparent px-1 py-2 text-sm leading-5 outline-none ring-0 focus:border-0 focus:ring-0 dark:bg-transparent sm:min-h-8 sm:py-1.5"
                  />
                  <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9" disabled={isSending || !selectedThreadAcceptsMessages} aria-label="Send message">
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
