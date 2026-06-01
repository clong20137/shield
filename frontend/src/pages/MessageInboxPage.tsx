import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { AuthAccount, getAssetUrl, getMessageEventsUrl, handleAssetImageError, messageService, userService, User, UserMessage } from '../services/api';
import { RankBadge } from '../components/RankBadge';
import { MentionText } from '../components/MentionText';
import { MentionTextarea } from '../components/MentionTextarea';
import { UserDetail } from '../components/UserDetail';

interface MessageInboxPageProps {
  currentUser: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  isModalView?: boolean;
}

interface MessageThread {
  id: string;
  contactName: string;
  contactEmail: string;
  contactRank: string;
  contactProfilePictureUrl: string;
  contactLastSeenAt: string;
  contactReceivesMessages: boolean;
  subject: string;
  latestMessage?: UserMessage;
  messages: UserMessage[];
  unreadCount: number;
}

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

function getPresenceLabel(value: string): string {
  return getPresenceDisplay(value, isOnlineFromLastSeen(value));
}

function isOnlineFromLastSeen(value: string, now = Date.now()): boolean {
  if (!value) {
    return false;
  }

  const lastActivityTime = new Date(value).getTime();
  if (Number.isNaN(lastActivityTime)) {
    return false;
  }

  return now - lastActivityTime <= 5 * 60 * 1000;
}

function getPresenceDisplay(value: string, isOnline: boolean): string {
  if (!value) {
    return 'Last online unavailable';
  }

  const lastActivityTime = new Date(value).getTime();
  if (Number.isNaN(lastActivityTime)) {
    return 'Last online unavailable';
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

function getContactLastSeenAt(message: UserMessage, currentUserId: string): string {
  return message.senderAccountId === currentUserId
    ? message.recipientLastSeenAt || message.createdAt
    : message.senderLastSeenAt || message.createdAt;
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

function MessageInboxPage({ currentUser, onToast, isModalView = false }: MessageInboxPageProps) {
  const [inboxMessages, setInboxMessages] = useState<UserMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<UserMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<User[]>([]);
  const [draftRecipient, setDraftRecipient] = useState<User | null>(null);
  const [isRecipientSearching, setIsRecipientSearching] = useState(false);
  const [messagePendingDelete, setMessagePendingDelete] = useState<UserMessage | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] = useState<MessageThread | null>(null);
  const [selectedMentionUser, setSelectedMentionUser] = useState<User | null>(null);
  const [presenceByAccount, setPresenceByAccount] = useState<Record<string, { online: boolean; lastSeenAt: string }>>({});
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonLabel = useMemo(() => ['🙂', '😀', '😎', '👍', '✨'][Math.floor(Math.random() * 5)], []);

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
    const eventSource = eventsUrl ? new EventSource(eventsUrl) : null;
    const handleRealtimeMessageUpdate = () => loadMessages(false);
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
            lastSeenAt: payload.actorLastSeenAt || new Date().toISOString(),
          },
        }));
      } catch (err) {
        console.error('Presence update parse error:', err);
        loadMessages(false);
      }
    };
    eventSource?.addEventListener('message-created', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-read', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-archived', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-deleted', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('presence-updated', handlePresenceUpdate);
    eventSource?.addEventListener('error', (event) => {
      console.error('Message realtime connection error:', event);
    });

    return () => eventSource?.close();
  }, [currentUser.id]);

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

    return Array.from(threadMap.values()).sort(
      (a, b) => new Date(b.latestMessage?.createdAt || 0).getTime() - new Date(a.latestMessage?.createdAt || 0).getTime(),
    );
  }, [currentUser.id, inboxMessages, sentMessages]);

  const filteredThreads = useMemo(() => {
    const existingDraftThread = draftRecipient && threads.some((thread) => thread.id === draftRecipient.id);
    const draftThread: MessageThread | null = draftRecipient && !existingDraftThread
      ? {
          id: draftRecipient.id,
          contactName: `${draftRecipient.firstName || ''} ${draftRecipient.lastName || ''}`.trim() || draftRecipient.email || 'New Chat',
          contactEmail: draftRecipient.email || '',
          contactRank: draftRecipient.rank || '',
          contactProfilePictureUrl: draftRecipient.profilePictureUrl || '',
          contactLastSeenAt: draftRecipient.lastSeenAt || new Date().toISOString(),
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
      ].join(' ').toLowerCase().includes(term),
    );
  }, [draftRecipient, searchTerm, threads]);

  const selectedThread = filteredThreads.find((thread) => thread.id === selectedThreadId) || null;
  const selectedThreadAcceptsMessages = selectedThread?.contactReceivesMessages !== false;
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
    setReplyBody((body) => `${body}${emojiData.emoji}`);
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
      await Promise.all(thread.messages.map((message) => messageService.delete(message.id, currentUser.id)));
      setInboxMessages((messages) => messages.filter((message) => !thread.messages.some((item) => item.id === message.id)));
      setSentMessages((messages) => messages.filter((message) => !thread.messages.some((item) => item.id === message.id)));
      if (selectedThreadId === thread.id) {
        const nextThread = threads.find((item) => item.id !== thread.id);
        setSelectedThreadId(nextThread?.id ?? null);
      }
      setThreadPendingDelete(null);
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
        <div className="mb-5">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations"
            className="w-full max-w-md rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
        </div>
      )}

      <div
        className={
          isModalView
            ? 'grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[340px_minmax(0,1fr)]'
            : 'grid min-h-[70vh] grid-cols-1 gap-4 xl:h-[calc(100vh-230px)] xl:grid-cols-[380px_minmax(0,1fr)]'
        }
      >
        <section className="relative flex max-h-[34vh] min-h-[14rem] flex-col overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 xl:max-h-none">
          {isModalView && (
            <div className="border-b border-gray-200 p-3 dark:border-gray-800">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search conversations"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
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
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-red-50 disabled:text-danger dark:hover:bg-gray-800 dark:disabled:bg-red-950"
                      >
                        {user.profilePictureUrl ? (
                          <img
                            src={getAssetUrl(user.profilePictureUrl)}
                            alt={`${user.firstName} ${user.lastName}`}
                            onError={handleAssetImageError}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
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
                return (
                  <div
                    key={thread.id}
                    className={`flex items-center gap-2 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      selectedThreadId === thread.id ? 'bg-accent/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className="min-h-11 min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${thread.unreadCount > 0 ? 'font-bold text-primary-500' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                            <span className="truncate">{thread.contactName}</span>
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {presence.label}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">{thread.latestMessage ? formatMessageTime(thread.latestMessage.createdAt) : 'New'}</span>
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
                      onClick={() => setThreadPendingDelete(thread)}
                      disabled={!thread.latestMessage}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-red-50 hover:text-danger dark:hover:bg-red-950"
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

        <section className="flex min-h-0 flex-col rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          {!selectedThread ? (
            <div className="empty-state">Select a conversation to view it.</div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="flex items-center justify-center gap-3 text-center">
                  <div className="relative shrink-0">
                    {selectedThread.contactProfilePictureUrl ? (
                      <img
                        src={getAssetUrl(selectedThread.contactProfilePictureUrl)}
                        alt={selectedThread.contactName}
                        onError={handleAssetImageError}
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

              <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-950 sm:p-4">
                {selectedThread.messages.length === 0 && (
                  <div className="flex h-full min-h-48 items-center justify-center text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">New chat with {selectedThread.contactName}</p>
                      <p className="mt-1 text-xs font-semibold text-gray-400">Type below to send the first message.</p>
                    </div>
                  </div>
                )}
                {selectedThread.messages.map((message, index) => {
                  const isMine = message.senderAccountId === currentUser.id;
                  const previousMessage = selectedThread.messages[index - 1];
                  const showTimestamp =
                    !previousMessage ||
                    new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() > 10 * 60 * 1000;

                  return (
                    <div key={message.id} ref={index === selectedThread.messages.length - 1 ? latestMessageRef : undefined}>
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
                          <div className={`inline-block w-fit max-w-full rounded-2xl px-4 py-3 shadow-sm ${
                            isMine
                              ? 'rounded-br bg-accent text-white'
                              : 'rounded-bl bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100'
                          }`}>
                            <p className="whitespace-pre-wrap text-left text-sm leading-6">
                              <MentionText
                                text={message.body}
                                mentionClassName={isMine ? 'font-bold text-white underline decoration-white/80 underline-offset-2' : 'font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300'}
                                onMentionClick={openMentionProfile}
                              />
                            </p>
                          </div>
                          <div className={`mt-1 flex items-center gap-2 text-xs font-semibold text-gray-400 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span>{formatMessageTime(message.createdAt)}</span>
                            {isMine && (
                              <span className="inline-flex items-center gap-1">
                                {message.isRead ? <CheckCheck size={13} /> : <Check size={13} />}
                                {getDeliveryLabel(message)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setMessagePendingDelete(message)}
                              className="flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition hover:bg-red-50 hover:text-danger dark:hover:bg-red-950 sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label="Delete message"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 sm:rounded-full sm:py-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(true)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg hover:bg-gray-100 dark:hover:bg-gray-800 sm:h-8 sm:w-8"
                    aria-label="Add emoji"
                  >
                    {emojiButtonLabel}
                  </button>
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
                    onChange={setReplyBody}
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

      {isEmojiPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsEmojiPickerOpen(false)}>
          <div className="max-h-[80dvh] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg bg-white p-2 shadow-xl sm:max-h-[90vh]" onClick={(event) => event.stopPropagation()}>
            <EmojiPicker onEmojiClick={addEmojiToReply} />
          </div>
        </div>
      )}
      {selectedMentionUser && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg">
            <UserDetail
              user={selectedMentionUser}
              onClose={() => setSelectedMentionUser(null)}
              canEdit={currentUser.role === 'administrator'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageInboxPage;
