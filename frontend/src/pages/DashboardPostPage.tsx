import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flag, Send, Trash2, X } from 'lucide-react';
import { AuthAccount, DashboardPost, DashboardPostComment, dashboardPostService } from '../services/api';

interface DashboardPostPageProps {
  currentUser: AuthAccount | null;
}

export function DashboardPostPage({ currentUser }: DashboardPostPageProps) {
  const { postId = '' } = useParams();
  const [post, setPost] = useState<DashboardPost | null>(null);
  const [comments, setComments] = useState<DashboardPostComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentPendingDelete, setCommentPendingDelete] = useState<DashboardPostComment | null>(null);
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
      setComments(commentsResponse.data);
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
      setComments((items) => [...items, response.data]);
      setCommentBody('');
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
      setComments((items) => items.map((item) => (item.id === comment.id ? response.data : item)));
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

  const getCommentInitials = (comment: DashboardPostComment) =>
    (comment.authorName || comment.authorEmail || 'User')
      .split(/\s+/u)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  if (isLoading) {
    return <div className="loading">Loading update...</div>;
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

      <section className="mt-6 rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h2>Comments</h2>
        {!post.allowComments ? (
          <div className="empty-state mt-4 rounded border border-dashed border-gray-300 dark:border-gray-700">Comments are disabled for this update.</div>
        ) : (
          <form onSubmit={submitComment} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              placeholder={currentUser ? 'Add a comment...' : 'Sign in to comment'}
              disabled={!currentUser}
            />
            <button type="submit" className="btn-primary" disabled={!currentUser || isSavingComment || !commentBody.trim()} aria-label="Post comment" title="Post Comment">
              <Send size={16} />
            </button>
          </form>
        )}

        <div className="mt-5 space-y-4">
          {comments.length === 0 ? (
            <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No comments yet.</div>
          ) : comments.map((comment) => (
            <div key={comment.id} className={`grid grid-cols-1 overflow-hidden rounded border dark:border-gray-800 md:grid-cols-[210px_minmax(0,1fr)] ${comment.isFlagged ? 'border-amber-300 dark:border-amber-800' : 'border-gray-200'}`}>
              <aside className="flex flex-col items-center justify-center border-b border-primary-600 bg-primary-500 p-5 text-center text-white dark:border-gray-800 dark:bg-gray-900 md:border-b-0 md:border-r">
                <div className="flex w-full flex-col items-center justify-center gap-3">
                  {comment.authorProfilePictureUrl ? (
                    <img src={comment.authorProfilePictureUrl} alt={comment.authorName || 'Comment author'} className="h-20 w-20 rounded-full border-2 border-white object-cover shadow" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-white text-xl font-bold text-primary-500 shadow">
                      {getCommentInitials(comment)}
                    </div>
                  )}
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
                    {comment.isFlagged && <p className="mt-1 text-xs font-bold uppercase text-amber-600">Flagged for review</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => flagComment(comment)} disabled={moderatingCommentId === comment.id || comment.isFlagged} className="btn-secondary" aria-label="Flag comment" title={comment.isFlagged ? 'Already Flagged' : 'Flag Comment'}>
                      <Flag size={16} />
                    </button>
                    {isAdministrator && (
                      <button type="button" onClick={() => setCommentPendingDelete(comment)} disabled={moderatingCommentId === comment.id} className="btn-danger" aria-label="Delete comment" title="Delete Comment">
                        <Trash2 size={16} />
                      </button>
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
    </div>
  );
}

export default DashboardPostPage;
