import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Inbox, Send, Smile } from 'lucide-react';
import { AuthAccount, messageService, UserMessage } from '../services/api';

interface MessageInboxPageProps {
  currentUser: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const emojiOptions = ['👍', '✅', '📌', '🚔', '📞', '🙏', '⚠️', '🎉'];

function MessageInboxPage({ currentUser, onToast }: MessageInboxPageProps) {
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [inboxMessages, setInboxMessages] = useState<UserMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<UserMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<UserMessage | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
        body: replyBody,
      });
      setReplyBody('');
      await loadMessages();
      onToast('success', 'Reply sent.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to send reply.');
    } finally {
      setIsSending(false);
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
        <button type="button" onClick={loadMessages} className="btn-secondary">
          Refresh Messages
        </button>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
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

        <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          {!selectedMessage ? (
            <div className="empty-state">Select a message to view it.</div>
          ) : (
            <div>
              <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
                <h2>{selectedMessage.subject}</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  From {selectedMessage.senderName || selectedMessage.senderEmail || 'Unknown'} to {selectedMessage.recipientName || selectedMessage.recipientEmail || 'Unknown'}
                </p>
                <p className="mt-1 text-xs text-gray-400">{new Date(selectedMessage.createdAt).toLocaleString()}</p>
              </div>
              <p className="whitespace-pre-wrap py-5 text-gray-800 dark:text-gray-100">{selectedMessage.body}</p>

              {tab === 'inbox' && (
                <form onSubmit={sendReply} className="border-t border-gray-200 pt-4 dark:border-gray-800">
                  <label className="mb-3 block">
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Reply</span>
                    <textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      className="min-h-32 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                    />
                  </label>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 dark:text-gray-400"><Smile size={16} /> Emoji</span>
                    {emojiOptions.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => setReplyBody((body) => `${body}${emoji}`)} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button type="submit" className="btn-primary" disabled={isSending}>
                    {isSending ? 'Sending...' : 'Send Reply'}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MessageInboxPage;
