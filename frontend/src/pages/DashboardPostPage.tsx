import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Edit3, Flag, Heart, LucideIcon, Megaphone, MessageSquare, PartyPopper, Pin, PinOff, Reply, Send, ShieldCheck, Smile, ThumbsUp, Trash2, X } from 'lucide-react';
import { RichPostEditor } from './DashboardPage';
import { UserDetail } from '../components/UserDetail';
import { FormattedText } from '../components/FormattedText';
import { MentionTextarea } from '../components/MentionTextarea';
import { MentionText } from '../components/MentionText';
import { AuthAccount, DashboardPost, DashboardPostComment, DashboardReaction, User, dashboardPostService, getAssetUrl, handleAssetImageError, userService } from '../services/api';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

const dashboardReactionOptions: Array<{ value: DashboardReaction; label: string; icon: LucideIcon }> = [
  { value: 'like', label: 'Like', icon: ThumbsUp },
  { value: 'celebrate', label: 'Celebrate', icon: PartyPopper },
  { value: 'important', label: 'Important', icon: Megaphone },
  { value: 'thanks', label: 'Thanks', icon: Heart },
];

interface DashboardPostPageProps {
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface DashboardPostComposeForm {
  title: string;
  body: string;
  category: DashboardPost['category'];
  imageUrl: string;
  allowComments: boolean;
}

const defaultComposeForm: DashboardPostComposeForm = {
  title: '',
  body: '',
  category: 'Update',
  imageUrl: '',
  allowComments: true,
};

const sortComments = (items: DashboardPostComment[]) =>
  [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

export function DashboardPostPage({ currentUser, onToast }: DashboardPostPageProps) {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const isCreateMode = postId === 'new';
  const [post, setPost] = useState<DashboardPost | null>(null);
  const [comments, setComments] = useState<DashboardPostComment[]>([]);
  const [composeForm, setComposeForm] = useState<DashboardPostComposeForm>(defaultComposeForm);
  const [commentBody, setCommentBody] = useState('');
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(() => new Set());
  const [commentPage, setCommentPage] = useState(1);
  const [commentPendingDelete, setCommentPendingDelete] = useState<DashboardPostComment | null>(null);
  const [selectedCommentUser, setSelectedCommentUser] = useState<User | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [savingReplyParentId, setSavingReplyParentId] = useState<string | null>(null);
  const [savingEditCommentId, setSavingEditCommentId] = useState<string | null>(null);
  const [moderatingCommentId, setModeratingCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reactionPulseMap, setReactionPulseMap] = useState<Record<string, number>>({});
  const canManageDashboard = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('dashboard:manage'));
  const canCreateDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:create'));
  const isAdministrator = currentUser?.role === 'administrator';
  const canManageComments = Boolean(
    isAdministrator ||
    currentUser?.permissions?.includes('dashboard:manage') ||
    currentUser?.permissions?.includes('dashboard:delete'),
  );

  const loadPost = async () => {
    if (!postId || isCreateMode) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [postResponse, commentsResponse] = await Promise.all([
        dashboardPostService.getById(postId),
        dashboardPostService.getComments(postId),
      ]);
      setPost(postResponse.data);
      const sortedComments = sortComments(commentsResponse.data);
      setComments(sortedComments);
      const parentsWithReplies = new Set(
        sortedComments
          .filter((comment) => sortedComments.some((reply) => reply.parentCommentId === comment.id))
          .map((comment) => comment.id),
      );
      setCollapsedThreadIds(parentsWithReplies);
    } catch (err) {
      console.error('Failed to load update:', err);
      setError('Failed to load this update.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isCreateMode) {
      setPost(null);
      setComments([]);
      setIsLoading(false);
      return;
    }

    void loadPost();
  }, [postId, isCreateMode]);

  useEffect(() => {
    if (!postId || isCreateMode) return;

    const handleDashboardUpdate = (event: Event) => {
      try {
        const payload = event instanceof MessageEvent
          ? JSON.parse(event.data || '{}') as { entityId?: string }
          : (event as CustomEvent<{ entityId?: string }>).detail || {};
        if (!payload.entityId || payload.entityId === postId) {
          void loadPost();
        }
      } catch {
        void loadPost();
      }
    };

    window.addEventListener('shield:dashboard-updated', handleDashboardUpdate);
    return () => window.removeEventListener('shield:dashboard-updated', handleDashboardUpdate);
  }, [postId]);

  const createStory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser) {
      setError('You need to sign in to publish a story.');
      return;
    }

    if (!canCreateDashboardPosts) {
      setError('You do not have permission to create stories.');
      return;
    }

    if (!composeForm.title.trim() || !composeForm.body.replace(/<[^>]*>/gu, '').trim()) {
      setError('Title and story body are required.');
      return;
    }

    setIsSavingPost(true);
    setError(null);
    try {
      const response = await dashboardPostService.create({
        ...composeForm,
        imageUrl: composeForm.imageUrl || null,
        requesterId: currentUser.id,
        authorName: currentUser.displayName || currentUser.email,
      });
      onToast('success', 'Story published.');
      navigate(`/updates/${response.data.id}`);
    } catch (err) {
      console.error('Failed to create story:', err);
      setError('Failed to publish story.');
    } finally {
      setIsSavingPost(false);
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!post || !commentBody.trim()) return;

    setIsSavingComment(true);
    setError(null);
    try {
      const response = await dashboardPostService.addComment(post.id, commentBody);
      setComments((items) => sortComments([...items, response.data]));
      setCommentPage(Math.max(1, Math.ceil((rootComments.length + 1) / commentsPerPage)));
      setCommentBody('');
      setIsEmojiPickerOpen(false);
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError('Failed to add comment.');
    } finally {
      setIsSavingComment(false);
    }
  };

  const submitReply = async (parentComment: DashboardPostComment) => {
    if (!post || !replyBody.trim()) return;

    setSavingReplyParentId(parentComment.id);
    setError(null);
    try {
      const response = await dashboardPostService.addComment(post.id, replyBody, parentComment.id);
      setComments((items) => sortComments([...items, response.data]));
      setCollapsedThreadIds((current) => new Set([...current, parentComment.id]));
      setReplyBody('');
      setReplyParentId(null);
    } catch (err) {
      console.error('Failed to add reply:', err);
      setError('Failed to add reply.');
    } finally {
      setSavingReplyParentId(null);
    }
  };

  const startEditingComment = (comment: DashboardPostComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
    setReplyParentId(null);
    setReplyBody('');
  };

  const saveCommentEdit = async (comment: DashboardPostComment) => {
    if (!post || !editingCommentBody.trim()) return;

    setSavingEditCommentId(comment.id);
    setError(null);
    try {
      const response = await dashboardPostService.updateComment(post.id, comment.id, editingCommentBody);
      setComments((items) => sortComments(items.map((item) => (item.id === comment.id ? response.data : item))));
      setEditingCommentId(null);
      setEditingCommentBody('');
    } catch (err) {
      console.error('Failed to update comment:', err);
      setError('Failed to update comment.');
    } finally {
      setSavingEditCommentId(null);
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

  const unflagComment = async (comment: DashboardPostComment) => {
    if (!post) return;
    setModeratingCommentId(comment.id);
    setError(null);
    try {
      const response = await dashboardPostService.unflagComment(post.id, comment.id);
      setComments((items) => sortComments(items.map((item) => (item.id === comment.id ? response.data : item))));
    } catch (err) {
      console.error('Failed to unflag comment:', err);
      setError('Failed to unflag comment.');
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
      setComments((items) => items.filter((item) => item.id !== comment.id && item.parentCommentId !== comment.id));
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

  const openMentionProfile = async (mention: string) => {
    const query = mention.replace(/^@/u, '').replace(/\s+/gu, ' ').trim();
    if (!query) return;

    setError(null);
    try {
      const response = await userService.search(query);
      const users = Array.isArray(response.data) ? response.data : response.data.data;
      const normalizedQuery = query.toLowerCase();
      const user = (users as User[]).find((item) =>
        `${item.firstName || ''} ${item.lastName || ''}`.trim().toLowerCase() === normalizedQuery ||
        item.email?.toLowerCase().startsWith(normalizedQuery) ||
        item.peNumber?.toLowerCase() === normalizedQuery,
      ) || users[0];

      if (user) {
        setSelectedCommentUser(user);
      }
    } catch (err) {
      console.error('Failed to load mentioned user:', err);
      setError('Failed to load that profile.');
    }
  };

  const addEmoji = (emojiData: EmojiClickData) => {
    setCommentBody((body) => `${body}${emojiData.emoji}`.slice(0, 1200));
    setIsEmojiPickerOpen(false);
  };

  const reactToPost = async (reaction: DashboardReaction) => {
    if (!post || !currentUser) {
      setError('Sign in to react to stories.');
      return;
    }

    setReactionPulseMap((currentMap) => ({
      ...currentMap,
      [reaction]: (currentMap[reaction] || 0) + 1,
    }));
    setError(null);
    try {
      const nextReaction = post.myReaction === reaction ? null : reaction;
      const response = await dashboardPostService.react(post.id, nextReaction);
      setPost(response.data);
    } catch (err) {
      console.error('Failed to update reaction:', err);
      setError('Failed to update reaction.');
    }
  };

  const getCommentInitials = (comment: DashboardPostComment) =>
    (comment.authorName || comment.authorEmail || 'User')
      .split(/\s+/u)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const canEditComment = (comment: DashboardPostComment) =>
    Boolean(currentUser && (canManageComments || comment.authorId === currentUser.id));

  const canDeleteComment = canEditComment;

  const toggleThreadCollapsed = (commentId: string) => {
    setCollapsedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const repliesByParent = comments.reduce<Record<string, DashboardPostComment[]>>((map, comment) => {
    if (comment.parentCommentId) {
      map[comment.parentCommentId] = [...(map[comment.parentCommentId] || []), comment].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return map;
  }, {});

  const rootComments = sortComments(comments.filter((comment) => !comment.parentCommentId));
  const commentsPerPage = 5;
  const commentPageCount = Math.max(1, Math.ceil(rootComments.length / commentsPerPage));
  const currentCommentPage = Math.min(commentPage, commentPageCount);
  const visibleRootComments = useMemo(
    () => rootComments.slice((currentCommentPage - 1) * commentsPerPage, currentCommentPage * commentsPerPage),
    [rootComments, currentCommentPage],
  );

  useEffect(() => {
    setCommentPage((page) => Math.min(page, commentPageCount));
  }, [commentPageCount]);

  const renderComment = (comment: DashboardPostComment, isReply = false) => {
    const replies = repliesByParent[comment.id] || [];
    const isEditing = editingCommentId === comment.id;
    const isReplying = replyParentId === comment.id;
    const isThreadCollapsed = collapsedThreadIds.has(comment.id);
    const wasEdited = new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime() + 1000;

    return (
      <div key={comment.id} className={isReply ? 'ml-4 border-l-2 border-accent/20 pl-4 sm:ml-8 sm:pl-5' : ''}>
        <div className={`grid grid-cols-1 overflow-hidden rounded border dark:border-gray-800 md:grid-cols-[210px_minmax(0,1fr)] ${comment.isAdminHighlighted ? 'border-primary-500 bg-primary-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/30' : comment.isPinned ? 'border-accent bg-accent/5 shadow-sm' : comment.isFlagged ? 'border-amber-300 dark:border-amber-800' : 'border-gray-200'}`}>
          <aside className={`flex flex-col items-center justify-center border-b p-5 text-center text-white md:border-b-0 md:border-r ${comment.isAdminHighlighted ? 'border-primary-700 bg-primary-600 dark:border-blue-700 dark:bg-blue-950' : 'border-primary-600 bg-primary-500 dark:border-gray-800 dark:bg-gray-900'}`}>
            <div className="flex w-full flex-col items-center justify-center gap-3">
              <button type="button" onClick={() => openCommentAuthor(comment)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-500" aria-label={`Open ${comment.authorName || 'comment author'} profile`} title="Open Profile">
                {comment.authorProfilePictureUrl ? (
                  <img src={getAssetUrl(comment.authorProfilePictureUrl)} alt={comment.authorName || 'Comment author'} onError={handleAssetImageError} className="h-20 w-20 rounded-full border-2 border-white object-cover shadow transition hover:scale-105" />
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
                <p className="text-xs font-bold uppercase text-gray-400">
                  {new Date(comment.createdAt).toLocaleString()}{wasEdited ? ' - Edited' : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {comment.isAdminHighlighted && <p className="inline-flex items-center gap-1 rounded bg-primary-500 px-2 py-1 text-xs font-bold uppercase text-white"><ShieldCheck size={12} /> Admin</p>}
                  {comment.isPinned && <p className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-1 text-xs font-bold uppercase text-accent"><Pin size={12} /> Pinned Comment</p>}
                  {comment.isFlagged && <p className="inline-flex items-center rounded bg-amber-100 px-2 py-1 text-xs font-bold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">Flagged for review</p>}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!isReply && (
                  <button type="button" onClick={() => {
                    setReplyParentId(isReplying ? null : comment.id);
                    setReplyBody('');
                    setEditingCommentId(null);
                  }} disabled={!currentUser} className="btn-secondary" aria-label="Reply to comment" title="Reply">
                    <Reply size={16} />
                  </button>
                )}
                {canEditComment(comment) && (
                  <button type="button" onClick={() => startEditingComment(comment)} disabled={moderatingCommentId === comment.id || savingEditCommentId === comment.id} className="btn-secondary" aria-label="Edit comment" title="Edit Comment">
                    <Edit3 size={16} />
                  </button>
                )}
                {comment.isFlagged && isAdministrator ? (
                  <button type="button" onClick={() => unflagComment(comment)} disabled={moderatingCommentId === comment.id} className="btn-secondary" aria-label="Unflag comment" title="Unflag Comment">
                    <Flag size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={() => flagComment(comment)} disabled={moderatingCommentId === comment.id || comment.isFlagged} className="btn-secondary" aria-label="Flag comment" title={comment.isFlagged ? 'Already Flagged' : 'Flag Comment'}>
                    <Flag size={16} />
                  </button>
                )}
                {isAdministrator && (
                  <>
                    <button type="button" onClick={() => pinComment(comment)} disabled={moderatingCommentId === comment.id} className="btn-secondary" aria-label={comment.isPinned ? 'Unpin comment' : 'Pin comment'} title={comment.isPinned ? 'Unpin Comment' : 'Pin Comment'}>
                      {comment.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                  </>
                )}
                {canDeleteComment(comment) && (
                  <button type="button" onClick={() => setCommentPendingDelete(comment)} disabled={moderatingCommentId === comment.id} className="btn-danger" aria-label="Delete comment" title="Delete Comment">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <MentionTextarea
                  value={editingCommentBody}
                  onChange={setEditingCommentBody}
                  wrapperClassName="w-full"
                  className="min-h-20 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
                  maxLength={1200}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => {
                    setEditingCommentId(null);
                    setEditingCommentBody('');
                  }} className="btn-secondary" aria-label="Cancel edit" title="Cancel">
                    <X size={16} />
                  </button>
                  <button type="button" onClick={() => void saveCommentEdit(comment)} disabled={savingEditCommentId === comment.id || !editingCommentBody.trim()} className="btn-primary" aria-label="Save comment" title="Save Comment">
                    <Check size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <MentionText
                text={comment.body}
                onMentionClick={openMentionProfile}
                className="mt-3 block whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300"
                mentionClassName="font-bold text-primary-500 underline underline-offset-2 dark:text-blue-200"
              />
            )}

            {!isReply && replies.length > 0 && (
              <button
                type="button"
                onClick={() => toggleThreadCollapsed(comment.id)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase text-gray-600 transition hover:border-accent hover:bg-accent/10 hover:text-accent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                aria-label={isThreadCollapsed ? 'Expand replies' : 'Collapse replies'}
                title={isThreadCollapsed ? 'Expand Replies' : 'Collapse Replies'}
              >
                {isThreadCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                {isThreadCollapsed ? 'View' : 'Hide'} {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
              </button>
            )}

            {isReplying && (
              <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <MentionTextarea
                  value={replyBody}
                  onChange={setReplyBody}
                  wrapperClassName="w-full"
                  className="min-h-20 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
                  placeholder="Write a reply..."
                  maxLength={1200}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => {
                    setReplyParentId(null);
                    setReplyBody('');
                  }} className="btn-secondary" aria-label="Cancel reply" title="Cancel">
                    <X size={16} />
                  </button>
                  <button type="button" onClick={() => void submitReply(comment)} disabled={savingReplyParentId === comment.id || !replyBody.trim()} className="btn-primary" aria-label="Post reply" title="Post Reply">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {replies.length > 0 && (
          <div
            className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${
              isThreadCollapsed ? 'grid-rows-[0fr] opacity-0 -translate-y-1' : 'grid-rows-[1fr] opacity-100 translate-y-0'
            }`}
            aria-hidden={isThreadCollapsed}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mt-3 space-y-3">
                {replies.map((reply) => renderComment(reply, true))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isCreateMode) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/" className="text-sm font-bold text-accent">Back to dashboard</Link>
              <h1 className="mt-2 text-xl font-bold sm:text-2xl">Create New Story</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-secondary"
              aria-label="Cancel story"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>

          {error && <div className="error mt-4">{error}</div>}

          {!canCreateDashboardPosts ? (
            <div className="mt-4 rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">
              You do not have permission to create stories.
            </div>
          ) : (
            <form onSubmit={createStory} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Type</span>
                  <select
                    value={composeForm.category}
                    onChange={(event) =>
                      setComposeForm((form) => ({ ...form, category: event.target.value as DashboardPost['category'] }))
                    }
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option>Update</option>
                    <option>News</option>
                    <option>Alert</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Title</span>
                  <input
                    value={composeForm.title}
                    onChange={(event) => setComposeForm((form) => ({ ...form, title: event.target.value }))}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                    placeholder="Add a story title"
                  />
                </label>
              </div>
              <div className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Post</span>
                <RichPostEditor
                  value={composeForm.body}
                  onChange={(body) => setComposeForm((form) => ({ ...form, body }))}
                />
              </div>
              <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                <span>
                  <span className="block text-sm font-bold text-gray-700 dark:text-gray-300">Allow comments</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    Readers can comment on the full story page.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={composeForm.allowComments}
                  onChange={(event) => setComposeForm((form) => ({ ...form, allowComments: event.target.checked }))}
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="btn-secondary"
                  aria-label="Cancel story"
                  title="Cancel"
                >
                  <X size={16} />
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingPost} aria-label="Publish story" title={isSavingPost ? 'Publishing' : 'Publish'}>
                  {isSavingPost ? (
                    <span>Publishing...</span>
                  ) : (
                    <span>Publish story</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <div className="skeleton-shimmer h-4 w-32" />
          <div className="skeleton-shimmer mt-6 h-8 w-2/3" />
          <div className="skeleton-shimmer mt-4 h-4 w-1/2" />
          <div className="mt-8 space-y-3">
            <div className="skeleton-shimmer h-4" />
            <div className="skeleton-shimmer h-4" />
            <div className="skeleton-shimmer h-4 w-4/5" />
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
        {post.imageUrl && (
          <div className="mt-6 overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950">
            <img src={getAssetUrl(post.imageUrl)} alt="" onError={handleAssetImageError} className="max-h-[620px] w-full object-contain" />
          </div>
        )}
        <FormattedText text={post.body} className="mt-6 text-base leading-8 text-gray-700 dark:text-gray-300" />
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
          {dashboardReactionOptions.map((option) => {
            const Icon = option.icon;
            const isActive = post.myReaction === option.value;
            const count = post.reactions?.[option.value] || 0;
            const pulseCount = reactionPulseMap[option.value] || 0;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void reactToPost(option.value)}
                className={`dashboard-reaction-button inline-flex h-9 items-center gap-1.5 rounded border px-2.5 text-xs font-bold shadow-sm transition ${
                  isActive
                    ? 'border-accent bg-accent text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent hover:bg-accent/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                }`}
                aria-label={`${option.label} reaction`}
                title={option.label}
              >
                <span key={pulseCount} className={`inline-flex ${pulseCount ? 'dashboard-reaction-pop' : ''}`}>
                  <Icon size={13} />
                </span>
                <span>{count}</span>
              </button>
            );
          })}
        </div>
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
            <MentionTextarea
              value={commentBody}
              onChange={setCommentBody}
              wrapperClassName="w-full"
              className="min-h-24 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              placeholder={currentUser ? 'Add a comment... use @ to mention someone' : 'Sign in to comment'}
              disabled={!currentUser}
              maxLength={1200}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">@ mentions notify users · {commentBody.length}/1200</span>
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
                    <Suspense fallback={<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading...</div>}>
                      <EmojiPicker onEmojiClick={addEmoji} />
                    </Suspense>
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
          ) : visibleRootComments.map((comment) => renderComment(comment))}
        </div>
        {rootComments.length > commentsPerPage && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
              Page {currentCommentPage} of {commentPageCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCommentPage((page) => Math.max(1, page - 1))}
                className="btn-secondary"
                disabled={currentCommentPage === 1}
                aria-label="Previous comments"
                title="Previous Comments"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCommentPage((page) => Math.min(commentPageCount, page + 1))}
                className="btn-secondary"
                disabled={currentCommentPage === commentPageCount}
                aria-label="Next comments"
                title="Next Comments"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      {commentPendingDelete && createPortal((
        <div className="modal-backdrop fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4" onClick={() => setCommentPendingDelete(null)}>
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Comment</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Remove this comment from the update?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCommentPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete comment" title="Cancel">
                <X size={16} />
                Cancel
              </button>
              <button type="button" onClick={() => void deleteComment(commentPendingDelete)} className="btn-danger" aria-label="Delete comment" title="Delete">
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
      {selectedCommentUser && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg">
            <UserDetail
              user={selectedCommentUser}
              onClose={() => setSelectedCommentUser(null)}
              canEdit={isAdministrator}
              onToast={onToast}
              currentUser={currentUser}
              onEdit={(user) => {
                setSelectedCommentUser(null);
                navigate(`/search?userId=${encodeURIComponent(user.id)}&q=${encodeURIComponent(`${user.firstName} ${user.lastName}`.trim() || user.email || user.id)}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPostPage;
