import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Inbox, Paperclip, Send, X } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { AuthAccount, messageService, userService, User, UserMessage } from '../services/api';

interface MessageInboxPageProps {
  currentUser: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

function MessageInboxPage({ currentUser, onToast }: MessageInboxPageProps) {
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [inboxMessages, setInboxMessages] = useState<UserMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<UserMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<UserMessage | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiTarget, setEmojiTarget] = useState<'reply' | 'compose'>('reply');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<User[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isRecipientSearching, setIsRecipientSearching] = useState(false);
  const emojiButton = useMemo(() => ['🙂', '😀', '😎', '👍', '✨'][Math.floor(Math.random() * 5)], []);

  const withAttachmentSummary = (body: string, files: File[]) => {
    if (files.length === 0) {
      return body;
    }

    return `${body.trim()}\n\nAttachments: ${files.map((file) => file.name).join(', ')}`;
  };

  const loadMessages = async () => {
    setIsLoading(true);
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
    loadMessages();
  }, [currentUser.id]);

  useEffect(() => {
    if (!isComposeOpen || recipientQuery.trim().length < 2 || selectedRecipient) {
      setRecipientResults([]);
      return;
    }

    let isMounted = true;
    setIsRecipientSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.search(recipientQuery);
        if (isMounted) {
          setRecipientResults(response.data.slice(0, 8));
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
  }, [isComposeOpen, recipientQuery, selectedRecipient]);

  const activeMessages = tab === 'inbox' ? inboxMessages : sentMessages;
  const filteredMessages = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return activeMessages;

    return activeMessages.filter((message) =>
      [message.subject, message.body, message.senderName, message.senderEmail, message.recipientName, message.recipientEmail]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [activeMessages, searchTerm]);
  const unreadCount = inboxMessages.filter((message) => !message.isRead).length;

  const openMessage = async (message: UserMessage) => {
    setSelectedMessage(message);
    setReplyBody('');

    if (tab === 'inbox' && !message.isRead) {
      try {
        await messageService.markRead(message.id, currentUser.id);
        setInboxMessages((messages) =>
          messages.map((item) => (item.id === message.id ? { ...item, isRead: true } : item)),
        );
        window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedMessage || !replyBody.trim()) {
      onToast('error', 'Enter a reply message.');
      return;
    }

    setIsSending(true);
    try {
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: selectedMessage.senderAccountId,
        subject: selectedMessage.subject.startsWith('Re:') ? selectedMessage.subject : `Re: ${selectedMessage.subject}`,
        body: withAttachmentSummary(replyBody, replyAttachments),
      });
      setReplyBody('');
      setReplyAttachments([]);
      await loadMessages();
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Reply sent.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  const addEmoji = (emojiData: EmojiClickData) => {
    if (emojiTarget === 'compose') {
      setComposeBody((body) => `${body}${emojiData.emoji}`);
      return;
    }

    setReplyBody((body) => `${body}${emojiData.emoji}`);
  };

  const sendNewMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedRecipient || !composeSubject.trim() || !composeBody.trim()) {
      onToast('error', 'Choose a recipient and enter a subject and message.');
      return;
    }

    setIsSending(true);
    try {
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: selectedRecipient.id,
        subject: composeSubject,
        body: withAttachmentSummary(composeBody, composeAttachments),
      });
      setSelectedRecipient(null);
      setRecipientQuery('');
      setComposeSubject('');
      setComposeBody('');
      setComposeAttachments([]);
      setIsComposeOpen(false);
      setIsEmojiPickerOpen(false);
      await loadMessages();
      setTab('sent');
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Message sent.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const archiveSelectedMessage = async () => {
    if (!selectedMessage || tab !== 'inbox') return;

    try {
      await messageService.archive(selectedMessage.id, currentUser.id);
      setInboxMessages((messages) => messages.filter((message) => message.id !== selectedMessage.id));
      setSelectedMessage(null);
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Message archived.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to archive message.');
    }
  };

  const deleteSelectedMessage = async () => {
    if (!selectedMessage) return;

    if (!window.confirm('Delete this message from your mailbox?')) {
      return;
    }

    try {
      await messageService.delete(selectedMessage.id, currentUser.id);
      if (tab === 'inbox') {
        setInboxMessages((messages) => messages.filter((message) => message.id !== selectedMessage.id));
      } else {
        setSentMessages((messages) => messages.filter((message) => message.id !== selectedMessage.id));
      }
      setSelectedMessage(null);
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
      onToast('success', 'Message deleted.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to delete message.');
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Messages</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Review inbox and sent messages.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setIsComposeOpen(true)} className="btn-primary">
            Compose
          </button>
          <button type="button" onClick={loadMessages} className="btn-secondary">
            Refresh Messages
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab('inbox')} className={tab === 'inbox' ? 'btn-primary' : 'btn-secondary'}>
            <span className="inline-flex items-center gap-2"><Inbox size={16} /> Inbox {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
          </button>
          <button type="button" onClick={() => setTab('sent')} className={tab === 'sent' ? 'btn-primary' : 'btn-secondary'}>
            <span className="inline-flex items-center gap-2"><Send size={16} /> Sent</span>
          </button>
        </div>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search messages"
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </div>

      <div className="grid min-h-[640px] grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          {isLoading ? (
            <div className="loading">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="empty-state">No messages found.</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredMessages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => openMessage(message)}
                  className="block w-full px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${!message.isRead && tab === 'inbox' ? 'font-bold text-primary-500' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                        {message.subject}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        {tab === 'inbox' ? message.senderName || message.senderEmail : message.recipientName || message.recipientEmail}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(message.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{message.body}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-[640px] flex-col rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          {!selectedMessage ? (
            <div className="empty-state">Select a message to view it.</div>
          ) : (
            <>
              <div className="border-b border-gray-200 p-5 dark:border-gray-800">
                <h2>{selectedMessage.subject}</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  From {selectedMessage.senderName || selectedMessage.senderEmail || 'Unknown'} to {selectedMessage.recipientName || selectedMessage.recipientEmail || 'Unknown'}
                </p>
                <p className="mt-1 text-xs text-gray-400">{new Date(selectedMessage.createdAt).toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tab === 'inbox' && (
                    <button type="button" onClick={archiveSelectedMessage} className="btn-secondary">
                      Archive
                    </button>
                  )}
                  <button type="button" onClick={deleteSelectedMessage} className="btn-danger">
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5 dark:bg-gray-950">
                <div className={`flex ${tab === 'sent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                    tab === 'sent'
                      ? 'rounded-br bg-accent text-white'
                      : 'rounded-bl bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm leading-6">{selectedMessage.body}</p>
                  </div>
                </div>
              </div>

              {tab === 'inbox' && (
                <form onSubmit={sendReply} className="border-t border-gray-200 p-4 dark:border-gray-800">
                  {replyAttachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {replyAttachments.map((file) => (
                        <span key={`${file.name}-${file.size}`} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiTarget('reply');
                        setIsEmojiPickerOpen(true);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                      aria-label="Add emoji"
                    >
                      {emojiButton}
                    </button>
                    <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-primary-500 hover:bg-gray-100 dark:text-blue-100 dark:hover:bg-gray-800" title="Attach files">
                      <Paperclip size={18} />
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => setReplyAttachments(Array.from(event.target.files || []))}
                      />
                    </label>
                    <textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder="Type a reply"
                      className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                    />
                    <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600" disabled={isSending} aria-label="Send reply">
                      <Send size={17} />
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={sendNewMessage} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2>Compose Message</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Search for a user and send a message.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsComposeOpen(false);
                  setIsEmojiPickerOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                aria-label="Close compose message"
              >
                <X size={20} />
              </button>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">To</span>
              <input
                value={selectedRecipient ? `${selectedRecipient.firstName} ${selectedRecipient.lastName}` : recipientQuery}
                onChange={(event) => {
                  setSelectedRecipient(null);
                  setRecipientQuery(event.target.value);
                }}
                placeholder="Search users by name, email, PE, badge..."
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
              {(recipientResults.length > 0 || isRecipientSearching) && !selectedRecipient && (
                <div className="mt-2 overflow-hidden rounded border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-950">
                  {isRecipientSearching ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
                  ) : (
                    recipientResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedRecipient(user);
                          setRecipientQuery('');
                          setRecipientResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="font-semibold">{user.firstName} {user.lastName}</span>
                        <span className="ml-2 text-gray-500">{user.email || user.peNumber}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </label>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Subject</span>
              <input
                value={composeSubject}
                onChange={(event) => setComposeSubject(event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Message</span>
              <textarea
                value={composeBody}
                onChange={(event) => setComposeBody(event.target.value)}
                className="min-h-40 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>

            {composeAttachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {composeAttachments.map((file) => (
                  <span key={`${file.name}-${file.size}`} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                    {file.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmojiTarget('compose');
                  setIsEmojiPickerOpen(true);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                aria-label="Add emoji"
              >
                {emojiButton}
              </button>
              <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-primary-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700" title="Attach files">
                <Paperclip size={18} />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setComposeAttachments(Array.from(event.target.files || []))}
                />
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={isSending}>
              {isSending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      )}

      {isEmojiPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsEmojiPickerOpen(false)}>
          <div className="max-h-[90vh] overflow-auto rounded-lg bg-white p-2 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <EmojiPicker onEmojiClick={addEmoji} />
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageInboxPage;
