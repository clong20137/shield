import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { AuthAccount, DashboardPost, DashboardPostComment, dashboardPostService } from '../services/api';

interface DashboardPostPageProps {
  currentUser: AuthAccount | null;
}

export function DashboardPostPage({ currentUser }: DashboardPostPageProps) {
  const { postId = '' } = useParams();
  const [post, setPost] = useState<DashboardPost | null>(null);
  const [comments, setComments] = useState<DashboardPostComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        <div className="mt-5 space-y-3">
          {comments.length === 0 ? (
            <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No comments yet.</div>
          ) : comments.map((comment) => (
            <div key={comment.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-gray-800 dark:text-gray-100">{comment.authorName || 'User'}</p>
                <p className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{comment.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default DashboardPostPage;
