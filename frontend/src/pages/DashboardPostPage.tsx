import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Flag, MessageSquare, Pin, PinOff, Send, Smile, Trash2, X } from 'lucide-react';
import { UserDetail } from '../components/UserDetail';
import { AuthAccount, DashboardPost, DashboardPostComment, User, dashboardPostService, getAssetUrl, userService } from '../services/api';

interface DashboardPostPageProps {
  currentUser: AuthAccount | null;
}

const sortComments = (items: DashboardPostComment[]) =>
  [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

export function DashboardPostPage({ currentUser }: DashboardPostPageProps) {
  const { postId = '' } = useParams();
  const [post, setPost] = useState<DashboardPost | null>(null);
  const [comments, setComments] = useState<DashboardPostComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentPendingDelete, setCommentPendingDelete] = useState<DashboardPostComment | null>(null);
  const [selectedCommentUser, setSelectedCommentUser] = useState<User | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [moderatingCommentId, setModeratingCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdministrator = currentUser?.role === 'administrator';

  const loadPost = async () => {
    if (!postId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [postResponse, commentsResponse] = await Promise.all([
        dashboardPostService.getById(postId),
        dashboardPostService.getComments(postId),
      ]);
      setPost(postResponse.data);
      setComments(sortComments(commentsResponse.data));
    } catch (err) {
      console.error('Failed to load update:', err);
      setError('Failed to load this update.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPost();
  }, [postId]);

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!post || !commentBody.trim()) return;

    setIsSavingComment(true);
    setError(null);
    try {
      const response = await dashboardPostService.addComment(post.id, commentBody);
      setComments((items) => sortComments([...items, response.data]));
      setCommentBody('');
      setIsEmojiPickerOpen(false);
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError('Failed to add comment.');
    } finally {
      setIsSavingComment(false);
    }
  };

  const flagComment = async (comment: DashboardPostComment) => {
    if (!post) return;
    setModeratingCommentId(comment.id);
    setError(null);
    try {
      const response = await dashboardPostService.flagComment(post.id, comment.id, 'Flagged for admin review');
      setComments((items) => sortComments(items.map((item) => (item.id === comment.id ? response.data : item))));
    } catch (err) {
      console.error('Failed to flag comment:', err);
      setError('Failed to flag comment.');
    } finally {
      setModeratingCommentId(null);
    }
  };

  const deleteComment = async (comment: DashboardPostComment) => {
    if (!post) return;
    setModeratingCommentId(comment.id);
    setError(null);
    try {
      await dashboardPostService.deleteComment(post.id, comment.id);
      setComments((items) => items.filter((item) => item.id !== comment.id));
      setCommentPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete comment:', err);
      setError('Failed to delete comment.');
    } finally {
      setModeratingCommentId(null);
    }
  };

  const pinComment = async (comment: DashboardPostComment) => {
    if (!post) return;
    setModeratingCommentId(comment.id);
    setError(null);
    try {
      const response = await dashboardPostService.pinComment(post.id, comment.id, !comment.isPinned);
      setComments((items) => {
        const updated = comment.isPinned
          ? items.map((item) => (item.id === comment.id ? response.data : item))
          : items.map((item) => (item.id === comment.id ? response.data : { ...item, isPinned: false, pinnedBy: null, pinnedAt: null }));
        return sortComments(updated);
      });
    } catch (err) {
      console.error('Failed to pin comment:', err);
      setError('Failed to update pinned comment.');
    } finally {
      setModeratingCommentId(null);
    }
  };

  const openCommentAuthor = async (comment: DashboardPostComment) => {
    setError(null);
    try {
      const response = await userService.getById(comment.authorId);
      setSelectedCommentUser(response.data as User);
    } catch (err) {
      console.error('Failed to load comment author:', err);
      setError('Failed to load that profile.');
    }
  };

  const addEmoji = (emojiData: EmojiClickData) => {
    setCommentBody((body) => `${body}${emojiData.emoji}`.slice(0, 1200));
    setIsEmojiPickerOpen(false);
  };

  const getCommentInitials = (comment: DashboardPostComment) =>
    (comment.authorName || comment.authorEmail || 'User')
      .split(/\s+/u)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-8 space-y-3">
            <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h1>Update Not Found</h1>
        <Link to="/" className="mt-4 inline-flex text-sm font-bold text-accent">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {error && <div className="error">{error}</div>}
      <article className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <Link to="/" className="text-sm font-bold text-accent">Back to dashboard</Link>
        <div className="mt-5">
          <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold uppercase text-accent">{post.category}</span>
          <h1 className="mt-4">{post.title}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Posted by {post.authorName || 'Administrator'} on {new Date(post.createdAt).toLocaleString()}
          </p>
        </div>
        <p className="mt-6 whitespace-pre-wrap text-base leading-8 text-gray-700 dark:text-gray-300">{post.body}</p>
      </article>

      <section className="mt-6 rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Comments</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {comments.length} comment{comments.length === 1 ? '' : 's'} on this update
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded bg-accent/10 text-accent">
            <MessageSquare size={18} />
          </div>
        </div>
        {!post.allowComments ? (
          <div className="empty-state mt-4 rounded border border-dashed border-gray-300 dark:border-gray-700">Comments are disabled for this update.</div>
        ) : (
          <form onSubmit={submitComment} className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              className="min-h-24 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              placeholder={currentUser ? 'Add a comment...' : 'Sign in to comment'}
              disabled={!currentUser}
              maxLength={1200}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{commentBody.length}/1200</span>
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen((value) => !value)}
                  className="btn-secondary"
                  disabled={!currentUser}
                  aria-label="Add emoji"
                  title="Add Emoji"
                >
                  <Smile size={16} />
                </button>
                {isEmojiPickerOpen && (
                  <div className="absolute bottom-12 right-0 z-50 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <EmojiPicker onEmojiClick={addEmoji} />
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={!currentUser || isSavingComment || !commentBody.trim()} aria-label="Post comment" title={isSavingComment ? 'Posting' : 'Post Comment'}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="mt-5 space-y-4">
          {comments.length === 0 ? (
            <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No comments yet.</div>
          ) : comments.map((comment) => (
            <div key={comment.id} className={`grid grid-cols-1 overflow-hidden rounded border dark:border-gray-800 md:grid-cols-[210px_minmax(0,1fr)] ${comment.isPinned ? 'border-accent bg-accent/5 shadow-sm' : comment.isFlagged ? 'border-amber-300 dark:border-amber-800' : 'border-gray-200'}`}>
              <aside className="flex flex-col items-center justify-center border-b border-primary-600 bg-primary-500 p-5 text-center text-white dark:border-gray-800 dark:bg-gray-900 md:border-b-0 md:border-r">
                <div className="flex w-full flex-col items-center justify-center gap-3">
                  <button type="button" onClick={() => openCommentAuthor(comment)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-500" aria-label={`Open ${comment.authorName || 'comment author'} profile`} title="Open Profile">
                    {comment.authorProfilePictureUrl ? (
                      <img src={getAssetUrl(comment.authorProfilePictureUrl)} alt={comment.authorName || 'Comment author'} className="h-20 w-20 rounded-full border-2 border-white object-cover shadow transition hover:scale-105" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-white text-xl font-bold text-primary-500 shadow transition hover:scale-105">
                        {getCommentInitials(comment)}
                      </div>
                    )}
                  </button>
                  <div className="w-full min-w-0">
                    <p className="truncate text-base font-bold text-white">{comment.authorName || 'User'}</p>
                    <p className="mt-1 truncate text-xs font-semibold uppercase text-blue-100">{comment.authorRank || 'No rank listed'}</p>
                    <p className="mt-1 truncate text-xs text-blue-100">{comment.authorDistrict || 'No district listed'}</p>
                  </div>
                </div>
              </aside>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-400">{new Date(comment.createdAt).toLocaleString()}</p>
                    {comment.isPinned && <p className="mt-1 inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-1 text-xs font-bold uppercase text-accent"><Pin size={12} /> Pinned Comment</p>}
                    {comment.isFlagged && <p className="mt-1 text-xs font-bold uppercase text-amber-600">Flagged for review</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => flagComment(comment)} disabled={moderatingCommentId === comment.id || comment.isFlagged} className="btn-secondary" aria-label="Flag comment" title={comment.isFlagged ? 'Already Flagged' : 'Flag Comment'}>
                      <Flag size={16} />
                    </button>
                    {isAdministrator && (
                      <>
                        <button type="button" onClick={() => pinComment(comment)} disabled={moderatingCommentId === comment.id} className="btn-secondary" aria-label={comment.isPinned ? 'Unpin comment' : 'Pin comment'} title={comment.isPinned ? 'Unpin Comment' : 'Pin Comment'}>
                          {comment.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                        </button>
                        <button type="button" onClick={() => setCommentPendingDelete(comment)} disabled={moderatingCommentId === comment.id} className="btn-danger" aria-label="Delete comment" title="Delete Comment">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{comment.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      {commentPendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Comment</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Remove this comment from the update?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCommentPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete comment" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" onClick={() => deleteComment(commentPendingDelete)} className="btn-danger" aria-label="Delete comment" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedCommentUser && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg">
            <UserDetail user={selectedCommentUser} onClose={() => setSelectedCommentUser(null)} canEdit={false} />
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPostPage;
