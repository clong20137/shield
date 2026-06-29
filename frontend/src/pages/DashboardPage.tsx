import React, { lazy, Suspense, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Bell, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GripHorizontal, Heart, Image, LucideIcon, MapPinned, Megaphone, NotebookPen, PartyPopper, Pencil, Pin, PinOff, Plus, Save, Search, Send, ThumbsUp, Trash2, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authService, AuthAccount, calendarService, CalendarEntry, DashboardReaction, dashboardPostService, DashboardPost, dashboardSummaryService, DashboardSummary, districtFeedService, DistrictFeedPost, DistrictFeedPostCategory, getAssetThumbnailUrl, getAssetUrl, handleAssetImageError, handleAssetThumbnailError, mediaService, MediaLibraryItem, pinnedProfileService, PinnedProfile, quickNoteService, reminderService, Reminder, userService, User } from '../services/api';
import { subscribeMessageRealtime } from '../services/realtime';
import { districtOptions } from '../constants/districts';
import { UserDetail } from '../components/UserDetail';
import { getPostBodyText } from '../components/RichPostEditor';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;
type DashboardPostForm = Pick<DashboardPost, 'title' | 'body' | 'category' | 'imageUrl' | 'allowComments'>;

const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Day Off'];

const entryColors = [
  { label: 'Accent', value: '#9C865C' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Green', value: '#16A34A' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Purple', value: '#7C3AED' },
];

const defaultPostForm: DashboardPostForm = {
  title: '',
  body: '',
  category: 'Update',
  imageUrl: '',
  allowComments: true,
};

const dashboardReactionOptions: Array<{ value: DashboardReaction; label: string; icon: LucideIcon }> = [
  { value: 'like', label: 'Like', icon: ThumbsUp },
  { value: 'celebrate', label: 'Celebrate', icon: PartyPopper },
  { value: 'important', label: 'Important', icon: Megaphone },
  { value: 'thanks', label: 'Thanks', icon: Heart },
];

const RichPostEditor = lazy(() => import('../components/RichPostEditor').then((module) => ({ default: module.RichPostEditor })));

const MEDIA_PICKER_PAGE_SIZE = 18;
const DASHBOARD_POST_MEDIA_FOLDER = 'dashboard-posts';
const getPostCategoryBannerClass = (category: DashboardPost['category']) => {
  if (category === 'Alert') {
    return 'bg-danger text-white shadow-red-950/30';
  }

  if (category === 'News') {
    return 'bg-primary-500 text-white shadow-blue-950/30';
  }

  return 'bg-accent text-white shadow-black/25';
};

const createDefaultEntryForm = (date: string): CalendarEntryForm => ({
  category: 'General Information',
  date,
  dutyHours: '',
  districtWorked: districtOptions[0],
  specialStatus: specialStatusOptions[0],
  color: entryColors[0].value,
  submissionStatus: 'Draft',
  details: {},
});

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const getReadableDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
};

const getReminderDueAt = (reminder: Reminder) => {
  const dueDate = new Date(reminder.remindAt || `${reminder.remindOn}T00:00`);
  return Number.isFinite(dueDate.getTime()) ? dueDate.getTime() : 0;
};

const getReminderDueLabel = (reminder: Reminder) => {
  const dueDate = new Date(reminder.remindAt || `${reminder.remindOn}T00:00`);
  if (!Number.isFinite(dueDate.getTime())) {
    return getReadableDate(reminder.remindOn);
  }

  return dueDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getReminderPriorityClass = (priority: Reminder['priority'] = 'Normal') => {
  if (priority === 'Critical') return 'bg-danger/10 text-danger';
  if (priority === 'High') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-100';
  if (priority === 'Low') return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300';
  return 'bg-primary-500/10 text-primary-500 dark:text-white';
};

export function DashboardCalendar() {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<CalendarEntryForm>(() =>
    createDefaultEntryForm(formatDateKey(new Date())),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const getAuditActor = async () => {
    try {
      const response = await authService.getSession();
      const account = response.data.account;
      return {
        actorId: account?.id,
        actorName: account?.displayName || account?.email,
      };
    } catch {
      return {};
    }
  };

  useEffect(() => {
    loadCalendarEntries();
  }, []);

  const loadCalendarEntries = async () => {
    setIsCalendarLoading(true);
    setCalendarError(null);
    try {
      const response = await calendarService.getAll('');
      setEntries(response.data);
    } catch (err) {
      console.error('Failed to load calendar entries:', err);
      setCalendarError('Failed to load calendar entries.');
    } finally {
      setIsCalendarLoading(false);
    }
  };

  const openDay = (dateKey: string) => {
    setSelectedDate(dateKey);
    setEntryForm(createDefaultEntryForm(dateKey));
    setEditingEntryId(null);
  };

  const closeModal = () => {
    setSelectedDate(null);
  };

  const changeMonth = (offset: number) => {
    setCalendarMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + offset);
      return nextMonth;
    });
  };

  const saveEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hours = Number(entryForm.dutyHours);

    if (!entryForm.date || Number.isNaN(hours) || hours < 0) {
      return;
    }

    setCalendarError(null);
    try {
      const actor = await getAuditActor();
      const payload = {
        ...entryForm,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/, ''),
        accountId: '',
        ...actor,
      };

      if (editingEntryId) {
        const response = await calendarService.update(editingEntryId, payload);
        setEntries((currentEntries) =>
          currentEntries.map((entry) => (entry.id === editingEntryId ? response.data : entry)),
        );
        setEditingEntryId(null);
      } else {
        const response = await calendarService.create(payload);
        setEntries((currentEntries) => [response.data, ...currentEntries]);
      }
      setEntryForm(createDefaultEntryForm(entryForm.date));
    } catch (err) {
      console.error('Failed to save calendar entry:', err);
      setCalendarError('Failed to save calendar entry.');
    }
  };

  const deleteEntry = async (entryId: string) => {
    setCalendarError(null);
    try {
      const actor = await getAuditActor();
      await calendarService.delete(entryId, { ...actor, accountId: '' });
      setEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
    } catch (err) {
      console.error('Failed to delete calendar entry:', err);
      setCalendarError('Failed to delete calendar entry.');
    }
  };

  const editEntry = (entry: CalendarEntry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      category: entry.category,
      date: entry.date,
      dutyHours: entry.dutyHours,
      districtWorked: entry.districtWorked,
      specialStatus: entry.specialStatus,
      color: entry.color,
      submissionStatus: entry.submissionStatus || 'Submitted',
      details: entry.details || {},
    });
  };

  const visibleEntries = entries.filter((entry) => {
    const matchesDistrict = !districtFilter || entry.districtWorked === districtFilter;
    const matchesStatus = !statusFilter || entry.specialStatus === statusFilter;
    return matchesDistrict && matchesStatus;
  });

  const selectedEntries = selectedDate
    ? visibleEntries.filter((entry) => entry.date === selectedDate)
    : [];

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = monthStart.getDay();
  const calendarCells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - leadingEmptyDays + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null;
    }

    return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber);
  });
  const todayKey = formatDateKey(new Date());

  return (
    <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Interactive Calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Click a day to add color-coded duty information stored in the database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary" aria-label="Previous month" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-40 text-center font-bold text-gray-700 dark:text-gray-200">
            {getMonthLabel(calendarMonth)}
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="btn-secondary" aria-label="Next month" title="Next">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <select value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="">All Districts</option>
          {districtOptions.map((district) => <option key={district}>{district}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="">All Special Status</option>
          {specialStatusOptions.map((status) => <option key={status}>{status}</option>)}
        </select>
      </div>

      {calendarError && <div className="error">{calendarError}</div>}
      {isCalendarLoading && <div className="loading">Loading calendar entries...</div>}

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {calendarCells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-28 rounded border border-transparent" />;
          }

          const dateKey = formatDateKey(date);
          const dayEntries = visibleEntries.filter((entry) => entry.date === dateKey);
          const isToday = dateKey === todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => openDay(dateKey)}
              className={`min-h-28 rounded border bg-gray-50 p-2 text-left transition hover:border-accent hover:bg-accent/5 dark:bg-gray-950 ${
                isToday
                  ? 'border-accent ring-2 ring-accent/20'
                  : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold text-gray-800 dark:text-gray-100">{date.getDate()}</span>
                {dayEntries.length > 0 && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                    {dayEntries.length}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dayEntries.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="truncate rounded px-2 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: entry.color }}
                    title={`${entry.dutyHours} hours - ${entry.districtWorked}`}
                  >
                    {entry.dutyHours}h {entry.districtWorked}
                  </div>
                ))}
                {dayEntries.length > 3 && (
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    +{dayEntries.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="modal-window max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2>{getReadableDate(selectedDate)}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {editingEntryId ? 'Edit duty details for this calendar day.' : 'Add duty details for this calendar day.'}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="icon-close-button" aria-label="Close calendar modal" title="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveEntry} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Section</span>
                <select
                  value={entryForm.category}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({
                      ...currentForm,
                      category: event.target.value as CalendarEntry['category'],
                    }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option>General Information</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Date</span>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, date: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Duty Hours</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryForm.dutyHours}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, dutyHours: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District Worked</span>
                <select
                  value={entryForm.districtWorked}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, districtWorked: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {districtOptions.map((district) => (
                    <option key={district}>{district}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Special Status</span>
                <select
                  value={entryForm.specialStatus}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, specialStatus: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {specialStatusOptions.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Color Code</span>
                <select
                  value={entryForm.color}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, color: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {entryColors.map((color) => (
                    <option key={color.value} value={color.value}>
                      {color.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <button type="submit" className="btn-primary" aria-label={editingEntryId ? 'Save calendar entry' : 'Add calendar entry'} title={editingEntryId ? 'Save Entry' : 'Add Entry'}>
                  {editingEntryId ? <Save size={16} /> : <Plus size={16} />}
                </button>
                {editingEntryId && (
                  <button type="button" onClick={() => {
                    setEditingEntryId(null);
                    setEntryForm(createDefaultEntryForm(selectedDate));
                  }} className="btn-secondary ml-2" aria-label="Cancel edit" title="Cancel Edit">
                    <X size={16} />
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6">
              <h3 className="mb-3">Entries</h3>
              {selectedEntries.length === 0 ? (
                <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">
                  No entries for this day.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <div>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            {entry.dutyHours} duty hours
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {entry.districtWorked} - {entry.specialStatus}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editEntry(entry)} className="btn-secondary" aria-label="Edit entry" title="Edit">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => deleteEntry(entry.id)} className="btn-danger" aria-label="Delete entry" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DashboardNews({
  currentUser,
  initialPosts,
  isAppBackgrounded = false,
}: {
  currentUser: AuthAccount | null;
  initialPosts?: DashboardPost[];
  isAppBackgrounded?: boolean;
}) {
  const [posts, setPosts] = useState<DashboardPost[]>([]);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [postForm, setPostForm] = useState<DashboardPostForm>(defaultPostForm);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
  const [mediaSearchTerm, setMediaSearchTerm] = useState('');
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<DashboardPost | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<DashboardPost | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [reactionPulseMap, setReactionPulseMap] = useState<Record<string, number>>({});
  const postRefreshTimerRef = useRef<number | null>(null);
  const canManageDashboard = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('dashboard:manage'));
  const canCreateDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:create'));
  const canEditDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:edit'));
  const canDeleteDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:delete'));
  const canUploadMedia = canCreateDashboardPosts || canEditDashboardPosts || Boolean(currentUser?.permissions?.includes('media:upload'));
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialPosts) {
      return;
    }

    setPosts(initialPosts);
    setIsLoadingPosts(false);
  }, [initialPosts]);

  const loadPosts = useCallback(async (showLoading = true) => {
    if (currentUser?.mustChangePassword) {
      setIsLoadingPosts(false);
      return;
    }

    if (showLoading) {
      setIsLoadingPosts(true);
    }
    setPostError(null);
    try {
      const response = await dashboardPostService.getAll(8);
      setPosts(response.data);
    } catch (err) {
      console.error('Failed to load dashboard posts:', err);
      setPostError('Failed to load updates and news.');
    } finally {
      setIsLoadingPosts(false);
    }
  }, [currentUser?.mustChangePassword]);

  useEffect(() => {
    if (!initialPosts && !isAppBackgrounded) {
      loadPosts();
    }
    const handleDashboardUpdate = () => {
      if (isAppBackgrounded) {
        return;
      }

      if (postRefreshTimerRef.current) {
        window.clearTimeout(postRefreshTimerRef.current);
      }

      postRefreshTimerRef.current = window.setTimeout(() => {
        postRefreshTimerRef.current = null;
        loadPosts(false);
      }, 500);
    };

    window.addEventListener('shield:dashboard-updated', handleDashboardUpdate);
    return () => {
      window.removeEventListener('shield:dashboard-updated', handleDashboardUpdate);
      if (postRefreshTimerRef.current) {
        window.clearTimeout(postRefreshTimerRef.current);
        postRefreshTimerRef.current = null;
      }
    };
  }, [initialPosts, isAppBackgrounded, loadPosts]);

  const featuredPosts = useMemo(() => posts.slice(0, 4), [posts]);

  useEffect(() => {
    setActiveFeaturedIndex(0);
  }, [posts.length]);

  useEffect(() => {
    if (featuredPosts.length < 2 || isAppBackgrounded) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveFeaturedIndex((index) => (index + 1) % featuredPosts.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [featuredPosts.length, isAppBackgrounded]);

  const createPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser || !postForm.title.trim() || !getPostBodyText(postForm.body)) {
      setPostError('Title and body are required.');
      return;
    }

    setIsSavingPost(true);
    setPostError(null);
    try {
      const response = await dashboardPostService.create({
        ...postForm,
        requesterId: currentUser.id,
        authorName: currentUser.displayName || currentUser.email,
      });
      setPosts((currentPosts) => [response.data, ...currentPosts]);
      setPostForm(defaultPostForm);
      setIsCreatePostOpen(false);
    } catch (err) {
      console.error('Failed to create dashboard post:', err);
      setPostError('Failed to publish update.');
    } finally {
      setIsSavingPost(false);
    }
  };

  const deletePost = async (post: DashboardPost) => {
    if (!currentUser) {
      return;
    }

    setPostError(null);
    try {
      await dashboardPostService.delete(post.id, currentUser.id);
      setPosts((currentPosts) => currentPosts.filter((currentPost) => currentPost.id !== post.id));
      setPostPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete dashboard post:', err);
      setPostError('Failed to delete update.');
    }
  };

  const startEditingPost = (post: DashboardPost) => {
    navigate(`/updates/${post.id}/edit`);
  };

  const reactToPost = async (post: DashboardPost, reaction: DashboardReaction) => {
    if (!currentUser) {
      setPostError('Sign in to react to stories.');
      return;
    }

    const pulseId = `${post.id}:${reaction}`;
    setReactionPulseMap((currentMap) => ({
      ...currentMap,
      [pulseId]: (currentMap[pulseId] || 0) + 1,
    }));
    setPostError(null);
    try {
      const nextReaction = post.myReaction === reaction ? null : reaction;
      const response = await dashboardPostService.react(post.id, nextReaction);
      setPosts((currentPosts) => currentPosts.map((currentPost) => (
        currentPost.id === post.id ? response.data : currentPost
      )));
    } catch (err) {
      console.error('Failed to update dashboard reaction:', err);
      setPostError('Failed to update reaction.');
    }
  };

  const closePostForm = () => {
    setIsCreatePostOpen(false);
    setEditingPost(null);
    setIsMediaPickerOpen(false);
    setPostForm(defaultPostForm);
  };

  const loadMediaItems = useCallback(async () => {
    setIsLoadingMedia(true);
    setPostError(null);
    try {
      const response = await mediaService.getAll({
        folder: DASHBOARD_POST_MEDIA_FOLDER,
        q: mediaSearchTerm.trim() || undefined,
        page: 1,
        limit: MEDIA_PICKER_PAGE_SIZE,
      });
      setMediaItems(response.data.items);
    } catch (err) {
      console.error('Failed to load media library images:', err);
      setPostError('Failed to load media library.');
    } finally {
      setIsLoadingMedia(false);
    }
  }, [mediaSearchTerm]);

  useEffect(() => {
    if (!isMediaPickerOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void loadMediaItems();
    }, 200);

    return () => window.clearTimeout(timer);
  }, [isMediaPickerOpen, loadMediaItems]);

  const uploadMediaImage = async (file: File) => {
    if (!canUploadMedia) {
      setPostError('You do not have permission to upload media.');
      return;
    }

    setIsUploadingMedia(true);
    setPostError(null);
    try {
      const response = await mediaService.uploadImages(DASHBOARD_POST_MEDIA_FOLDER, [file]);
      const uploadedFileName = response.data.uploaded[0];
      if (!uploadedFileName) {
        setPostError(response.data.skipped[0]?.reason || 'No image was uploaded.');
        return;
      }
      setPostForm((form) => ({ ...form, imageUrl: `/uploads/${DASHBOARD_POST_MEDIA_FOLDER}/${uploadedFileName}` }));
      await loadMediaItems();
    } catch (err) {
      console.error('Failed to upload media image:', err);
      setPostError('Failed to upload image to media library.');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const uploadInlineStoryImage = async (file: File) => {
    if (!canUploadMedia) {
      setPostError('You do not have permission to upload media.');
      throw new Error('Missing media upload permission');
    }

    setPostError(null);
    try {
      const response = await dashboardPostService.uploadImage(file);
      return response.data.imageUrl;
    } catch (err) {
      console.error('Failed to upload inline story image:', err);
      setPostError('Failed to insert image into story.');
      throw err;
    }
  };

  const updatePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingPost || !postForm.title.trim() || !getPostBodyText(postForm.body)) {
      setPostError('Title and body are required.');
      return;
    }

    setIsSavingPost(true);
    setPostError(null);
    try {
      const response = await dashboardPostService.update(editingPost.id, postForm);
      setPosts((currentPosts) =>
        currentPosts.map((currentPost) => (currentPost.id === editingPost.id ? response.data : currentPost)),
      );
      closePostForm();
    } catch (err) {
      console.error('Failed to update dashboard post:', err);
      setPostError('Failed to update post.');
    } finally {
      setIsSavingPost(false);
    }
  };

  const showFeaturedPost = (index: number) => {
    setActiveFeaturedIndex((index + featuredPosts.length) % featuredPosts.length);
  };
  const normalizedActiveFeaturedIndex = activeFeaturedIndex % Math.max(featuredPosts.length, 1);

  return (
    <section data-onboarding-target="dashboard-news" className="flex h-full min-h-[24rem] flex-col overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      {postError && <div className="error m-3 sm:m-4">{postError}</div>}

      {isLoadingPosts ? (
        <div className="loading p-4">Loading updates...</div>
      ) : posts.length === 0 ? (
        <div className="m-3 rounded border border-dashed border-gray-300 dark:border-gray-700 sm:m-4">
          <div className="empty-state flex flex-col items-center gap-3">
            <span>No updates posted yet.</span>
            {canCreateDashboardPosts && (
              <button
                type="button"
                onClick={() => navigate('/updates/new')}
                className="btn-primary"
                aria-label="Create new story"
                title="New Story"
              >
                <Plus size={16} />
                <span>New Story</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-950 text-white">
          <div
            className="flex h-full transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${normalizedActiveFeaturedIndex * 100}%)` }}
          >
            {featuredPosts.map((post, index) => (
              <div key={post.id} className="relative min-h-[24rem] w-full shrink-0 overflow-hidden">
                <Link to={`/updates/${post.id}`} className="group absolute inset-0 overflow-hidden bg-gray-900" aria-label={`Read ${post.title}`}>
                  {post.imageUrl ? (
                    <img
                      src={getAssetThumbnailUrl(post.imageUrl, 960)}
                      alt=""
                      onError={(event) => handleAssetThumbnailError(event, post.imageUrl)}
                      className={`h-full w-full object-cover opacity-95 transition duration-700 ease-out group-hover:scale-[1.025] ${index === normalizedActiveFeaturedIndex ? 'dashboard-news-image-outward' : ''}`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-primary-500/30 text-blue-100">
                      <Image size={52} />
                    </div>
                  )}
                </Link>
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 to-transparent" />
                <span className={`absolute left-0 top-4 z-10 min-w-32 rounded-r px-5 py-2 pr-8 text-xs font-black uppercase tracking-[0.18em] shadow-lg [clip-path:polygon(0_0,100%_0,calc(100%-14px)_50%,100%_100%,0_100%)] ${getPostCategoryBannerClass(post.category)}`}>
                  {post.category}
                </span>
                <div className="absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-2">
                  {canCreateDashboardPosts && index === normalizedActiveFeaturedIndex && (
                    <button
                      type="button"
                      onClick={() => navigate('/updates/new')}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-accent/60 bg-accent px-2.5 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:bg-accent/90"
                      aria-label="Create new story"
                      title="New Story"
                    >
                      <Plus size={14} />
                      <span>New Story</span>
                    </button>
                  )}
                  {canEditDashboardPosts && (
                    <button
                      type="button"
                      onClick={() => startEditingPost(post)}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-white/20 bg-black/35 px-2.5 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:bg-white/15"
                      aria-label={`Edit ${post.title}`}
                      title="Edit Story"
                    >
                      <Pencil size={14} />
                      <span>Edit</span>
                    </button>
                  )}
                  {canDeleteDashboardPosts && (
                    <button
                      type="button"
                      onClick={() => setPostPendingDelete(post)}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-red-300/40 bg-red-500/25 px-2.5 text-xs font-bold text-red-100 shadow-lg backdrop-blur transition hover:bg-red-500/35"
                      aria-label={`Delete ${post.title}`}
                      title="Delete Story"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
                <div className="relative z-10 flex min-h-[24rem] max-w-3xl flex-col justify-between p-5 pb-16 sm:p-6 sm:pb-16 lg:p-7 lg:pb-16">
                  <div />
                  <div>
                    <Link to={`/updates/${post.id}`} className="block text-2xl font-black leading-tight text-white drop-shadow transition hover:text-blue-100 sm:text-4xl">
                      {post.title}
                    </Link>
                    <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-6 text-gray-100/90 sm:text-base">{getPostBodyText(post.body)}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-200/80">
                      {post.authorName || 'Administrator'} - {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      {dashboardReactionOptions.map((option) => {
                        const Icon = option.icon;
                        const isActive = post.myReaction === option.value;
                        const count = post.reactions?.[option.value] || 0;
                        const pulseId = `${post.id}:${option.value}`;
                        const pulseCount = reactionPulseMap[pulseId] || 0;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => void reactToPost(post, option.value)}
                            className={`dashboard-reaction-button inline-flex h-9 items-center gap-1.5 rounded border px-2.5 text-xs font-bold shadow-lg backdrop-blur transition ${
                              isActive
                                ? 'border-accent bg-accent text-white'
                                : 'border-white/20 bg-black/25 text-gray-100 hover:bg-white/15'
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
                      <Link to={`/updates/${post.id}`} className="inline-flex h-9 w-fit items-center rounded border border-accent/60 bg-black/25 px-3 text-sm font-bold text-accent shadow-lg backdrop-blur transition hover:bg-accent/15">
                        Read More
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {featuredPosts.length > 1 && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 shadow-lg backdrop-blur">
                  {featuredPosts.map((post, index) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => showFeaturedPost(index)}
                      className={`h-2.5 rounded-full transition-all ${index === normalizedActiveFeaturedIndex ? 'w-8 bg-accent' : 'w-2.5 bg-white/45 hover:bg-white/75'}`}
                      aria-label={`Show featured post ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-3">
                <button
                  type="button"
                  onClick={() => showFeaturedPost(activeFeaturedIndex - 1)}
                  className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-black/35 text-white shadow-lg backdrop-blur transition hover:bg-white/15"
                  aria-label="Previous featured post"
                  title="Previous"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => showFeaturedPost(activeFeaturedIndex + 1)}
                  className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-black/35 text-white shadow-lg backdrop-blur transition hover:bg-white/15"
                  aria-label="Next featured post"
                  title="Next"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {(isCreatePostOpen || editingPost) && (
        <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editingPost ? 'Edit Update' : 'Create Update'}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {editingPost ? 'Update this published story.' : 'Publish news, updates, or alerts to the dashboard.'}
                </p>
              </div>
              <button type="button" onClick={closePostForm} className="icon-close-button" aria-label="Close update modal" title="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={editingPost ? updatePost : createPost} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Type</span>
                  <select
                    value={postForm.category}
                    onChange={(event) => setPostForm((form) => ({ ...form, category: event.target.value as DashboardPost['category'] }))}
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
                    value={postForm.title}
                    onChange={(event) => setPostForm((form) => ({ ...form, title: event.target.value }))}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  />
                </label>
              </div>
              <div className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Post</span>
                <Suspense fallback={<div className="min-h-64 rounded border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">Loading editor...</div>}>
                  <RichPostEditor
                    value={postForm.body}
                    onChange={(body) => setPostForm((form) => ({ ...form, body }))}
                    onImageUpload={canUploadMedia ? uploadInlineStoryImage : undefined}
                  />
                </Suspense>
              </div>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Media library image</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Choose an existing image or upload into Dashboard Posts.</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsMediaPickerOpen((isOpen) => !isOpen)} className="btn-secondary" aria-label="Choose media library image" title="Choose Image">
                      <Image size={16} />
                    </button>
                    {postForm.imageUrl && (
                      <button type="button" onClick={() => setPostForm((form) => ({ ...form, imageUrl: '' }))} className="btn-danger" aria-label="Remove dashboard post image" title="Remove Image">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {isMediaPickerOpen && (
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[14rem] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                          value={mediaSearchTerm}
                          onChange={(event) => setMediaSearchTerm(event.target.value)}
                          placeholder="Search media"
                          className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                        />
                      </div>
                      {canUploadMedia && (
                        <label className="btn-secondary cursor-pointer" aria-label="Upload media library image" title={isUploadingMedia ? 'Uploading' : 'Upload Image'}>
                          <Upload size={16} />
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/gif,image/webp"
                            className="hidden"
                            disabled={isUploadingMedia}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) {
                                void uploadMediaImage(file);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {isLoadingMedia ? (
                      <div className="loading py-6">Loading media...</div>
                    ) : mediaItems.length === 0 ? (
                      <div className="rounded border border-dashed border-gray-300 px-3 py-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        No dashboard post images found.
                      </div>
                    ) : (
                      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-6">
                        {mediaItems.map((item) => {
                          const isSelected = postForm.imageUrl === item.url;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setPostForm((form) => ({ ...form, imageUrl: item.url }))}
                              className={`group relative aspect-[4/3] overflow-hidden rounded border bg-white text-left transition hover:border-accent dark:bg-gray-900 ${
                                isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-gray-200 dark:border-gray-800'
                              }`}
                              aria-label={`Use ${item.label}`}
                              title={item.label}
                            >
                              <img src={getAssetThumbnailUrl(item.url, 256)} alt="" onError={(event) => handleAssetThumbnailError(event, item.url)} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                                <span className="block truncate">{item.label}</span>
                              </span>
                              {isSelected && (
                                <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow">
                                  <CheckCircle2 size={15} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {postForm.imageUrl ? (
                  <div className="mt-3 overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950">
                    <img src={getAssetUrl(postForm.imageUrl)} alt="" onError={handleAssetImageError} className="max-h-72 w-full object-contain" />
                  </div>
                ) : (
                  <div className="mt-3 flex h-28 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 dark:border-gray-700">
                    <Image size={24} />
                  </div>
                )}
              </div>
              <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                <span>
                  <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Allow comments</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Readers can comment on the full story page.</span>
                </span>
                <input
                  type="checkbox"
                  checked={postForm.allowComments}
                  onChange={(event) => setPostForm((form) => ({ ...form, allowComments: event.target.checked }))}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closePostForm} className="btn-secondary" aria-label="Cancel update" title="Cancel">
                  <X size={16} />
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingPost} aria-label={editingPost ? 'Save post' : 'Publish post'} title={isSavingPost ? 'Saving' : editingPost ? 'Save Post' : 'Publish Post'}>
                  {editingPost ? <Save size={16} /> : <Send size={16} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {postPendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Post</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete "{postPendingDelete.title}" from the dashboard?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPostPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete post" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" onClick={() => deletePost(postPendingDelete)} className="btn-danger" aria-label="Delete post" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  const source = `${firstName || ''} ${lastName || ''}`.trim() || email || 'User';
  const parts = source.split(/\s+/u).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : source.slice(0, 2).toUpperCase();
}

function isProfileOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  return !Number.isNaN(value) && Date.now() - value < 2 * 60 * 1000;
}

function isProfileAway(lastSeenAt?: string | null): boolean {
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

type PinnedPresenceStatus = 'active' | 'away' | 'busy';
type PinnedPresenceState = {
  online: boolean;
  away: boolean;
  status: PinnedPresenceStatus;
  lastSeenAt: string | null;
};

function getPinnedPresence(profile: Pick<PinnedProfile, 'id' | 'lastSeenAt'>, presenceByAccount: Record<string, PinnedPresenceState>) {
  const realtime = presenceByAccount[profile.id];
  const online = realtime ? realtime.online : isProfileOnline(profile.lastSeenAt);
  const away = realtime ? realtime.away : !online && isProfileAway(profile.lastSeenAt);
  const status = realtime?.status || (away ? 'away' : online ? 'active' : 'active');

  if (realtime && status === 'busy') {
    return {
      label: 'Busy',
      dotClass: 'bg-red-500',
      ringClass: 'border-red-300/70 shadow-[0_0_0_1px_rgba(239,68,68,0.18)]',
      pulseClass: 'border-red-300/50',
      showPulse: true,
    };
  }

  if ((realtime && status === 'away') || away) {
    return {
      label: 'Away',
      dotClass: 'bg-amber-400',
      ringClass: 'border-amber-300/70 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]',
      pulseClass: 'border-amber-300/70',
      showPulse: true,
    };
  }

  if (online) {
    return {
      label: 'Active',
      dotClass: 'bg-green-500',
      ringClass: 'border-green-400/45 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]',
      pulseClass: 'border-green-400/45',
      showPulse: true,
    };
  }

  return {
    label: 'Offline',
    dotClass: 'bg-gray-400',
    ringClass: 'border-gray-300/45 dark:border-gray-600/50',
    pulseClass: '',
    showPulse: false,
  };
}

function isMobileViewport() {
  return window.innerWidth < 768;
}

function getDocumentScale() {
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize || '16');
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize / 16 : 1;
}

function getInitialProfileWindowPosition() {
  const width = Math.min(window.innerWidth - 24, 920);
  return {
    x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(12, Math.round(window.innerHeight * 0.08)),
  };
}

function PinnedProfilesWidget({
  currentUser,
  onOpenProfile,
  initialProfiles,
}: {
  currentUser: AuthAccount | null;
  onOpenProfile: (user: User) => void;
  initialProfiles?: PinnedProfile[];
}) {
  const [profiles, setProfiles] = useState<PinnedProfile[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [isAddPopoverOpen, setIsAddPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceByAccount, setPresenceByAccount] = useState<Record<string, PinnedPresenceState>>({});
  const pinnedRailRef = useRef<HTMLDivElement | null>(null);
  const pinSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialProfiles) {
      return;
    }

    setProfiles(initialProfiles);
    setIsLoading(false);
  }, [initialProfiles]);

  const loadProfiles = useCallback(async () => {
    if (!currentUser) {
      setProfiles(initialProfiles ?? []);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await pinnedProfileService.getAll();
      setProfiles(response.data);
    } catch (err) {
      console.error('Failed to load pinned profiles:', err);
      setProfiles((currentProfiles) => (currentProfiles.length > 0 ? currentProfiles : initialProfiles ?? []));
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, initialProfiles]);

  useEffect(() => {
    if (!initialProfiles) {
      void loadProfiles();
    }
  }, [initialProfiles, loadProfiles]);

  useEffect(() => {
    if (!currentUser) {
      setPresenceByAccount({});
      return undefined;
    }

    const handlePresenceUpdate = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as {
          actorAccountId?: string;
          actorOnline?: boolean;
          actorAway?: boolean;
          actorStatus?: PinnedPresenceStatus;
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
      } catch (err) {
        console.error('Failed to parse pinned profile presence update:', err);
      }
    };

    const unsubscribePresence = subscribeMessageRealtime('presence-updated', handlePresenceUpdate);
    const unsubscribeError = subscribeMessageRealtime('error', (event) => {
      console.error('Pinned profile presence connection error:', event);
    });

    return () => {
      unsubscribePresence();
      unsubscribeError();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    let isMounted = true;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      userService.search(trimmedQuery)
        .then((response) => {
          if (!isMounted) return;
          const pinnedIds = new Set(profiles.map((profile) => profile.id));
          setResults((response.data as User[]).filter((user) => !pinnedIds.has(user.id)).slice(0, 6));
        })
        .catch((err) => {
          console.error('Failed to search profiles to pin:', err);
          if (isMounted) setResults([]);
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [profiles, query]);

  const pinProfile = async (user: User) => {
    try {
      const response = await pinnedProfileService.pin(user.id);
      setProfiles((currentProfiles) => [
        response.data,
        ...currentProfiles.filter((profile) => profile.id !== response.data.id),
      ]);
      setQuery('');
      setResults([]);
      setIsAddPopoverOpen(false);
    } catch (err) {
      console.error('Failed to pin profile:', err);
      setError('Failed to pin profile.');
    }
  };

  const unpinProfile = async (userId: string) => {
    try {
      await pinnedProfileService.unpin(userId);
      setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== userId));
    } catch (err) {
      console.error('Failed to unpin profile:', err);
      setError('Failed to remove pinned profile.');
    }
  };

  const slidePinnedProfiles = (direction: -1 | 1) => {
    const rail = pinnedRailRef.current;
    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.82, 180),
      behavior: 'smooth',
    });
  };

  return (
    <section
      data-onboarding-target="pinned-profiles"
      data-no-global-context-menu="true"
      className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Pinned Profiles</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading ? (
        <div className="loading">Loading pinned profiles...</div>
      ) : (
        <div className="relative">
          {profiles.length > 4 && (
            <>
              <button
                type="button"
                onClick={() => slidePinnedProfiles(-1)}
                className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-primary-500 shadow-lg transition hover:scale-105 hover:border-accent dark:border-gray-700 dark:bg-gray-900/95 dark:text-white"
                aria-label="Show previous pinned profiles"
                title="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => slidePinnedProfiles(1)}
                className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-primary-500 shadow-lg transition hover:scale-105 hover:border-accent dark:border-gray-700 dark:bg-gray-900/95 dark:text-white"
                aria-label="Show more pinned profiles"
                title="Next"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <div ref={pinnedRailRef} className="shield-scrollbar-hidden flex snap-x gap-3 overflow-x-auto scroll-smooth px-1 py-1 sm:px-12">
            <div className="relative w-28 shrink-0 snap-start sm:w-32">
              <button
                type="button"
                onClick={() => {
                  setIsAddPopoverOpen((isOpen) => !isOpen);
                  window.setTimeout(() => pinSearchInputRef.current?.focus(), 0);
                }}
                className="flex h-full min-h-[8.75rem] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-accent/60 bg-accent/5 p-3 text-center text-accent transition hover:-translate-y-1 hover:bg-accent/10 hover:shadow-lg dark:bg-accent/10"
                aria-label="Add pinned profile"
                title="Add Profile"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-accent/25 dark:bg-gray-900">
                  <Plus size={24} />
                </span>
                <span className="text-sm font-bold">Add Profile</span>
              </button>
            </div>
            {profiles.map((profile) => {
              const presence = getPinnedPresence(profile, presenceByAccount);
              return (
              <article key={profile.id} className="group relative w-28 shrink-0 snap-start rounded-lg border border-gray-200 bg-gray-50 p-3 text-center transition hover:-translate-y-1 hover:scale-[1.04] hover:border-accent hover:bg-white hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900 sm:w-32">
                <button type="button" onClick={() => onOpenProfile(profile)} className="block w-full" aria-label={`Open ${profile.firstName} ${profile.lastName}`}>
                  <span className="relative mx-auto block h-16 w-16 rounded-full sm:h-[4.5rem] sm:w-[4.5rem]">
                    {presence.showPulse && (
                      <span className={`pointer-events-none absolute -inset-1 rounded-full border shadow-[0_0_0_1px_rgba(15,23,42,0.12)] shield-online-pulse ${presence.pulseClass}`} />
                    )}
                    <span className="relative block h-full w-full overflow-hidden rounded-full border-2 border-white bg-primary-500 shadow group-hover:ring-4 group-hover:ring-accent/20">
                      {profile.profilePictureUrl ? (
                        <img src={getAssetThumbnailUrl(profile.profilePictureUrl, 96)} alt={`${profile.firstName} ${profile.lastName}`} onError={(event) => handleAssetThumbnailError(event, profile.profilePictureUrl)} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                          {getInitials(profile.firstName, profile.lastName, profile.email)}
                        </span>
                      )}
                    </span>
                    <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/10 dark:bg-gray-950 dark:ring-white/10" title={presence.label} aria-label={presence.label}>
                      <span className={`h-3 w-3 rounded-full ${presence.dotClass}`} />
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-bold text-gray-900 dark:text-gray-100">{profile.firstName} {profile.lastName}</span>
                  <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">{presence.label}</span>
                </button>
                <button type="button" onClick={() => void unpinProfile(profile.id)} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white opacity-100 shadow-sm hover:bg-red-800 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Unpin ${profile.firstName} ${profile.lastName}`} title="Unpin">
                  <PinOff size={14} />
                </button>
              </article>
            );
            })}
          </div>
          {isAddPopoverOpen && (
            <div className="absolute left-1 top-2 z-30 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:left-12">
              <div className="border-b border-gray-200 p-3 dark:border-gray-800">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    ref={pinSearchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search profiles"
                    className="pinned-profile-search-input w-full rounded border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                </div>
              </div>
              {isSearching ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Searching...</div>
              ) : query.trim().length < 2 ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Type a name, PE number, or email.</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">No available profiles found.</div>
              ) : results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => void pinProfile(user)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {user.profilePictureUrl ? (
                    <img src={getAssetThumbnailUrl(user.profilePictureUrl, 96)} alt={`${user.firstName} ${user.lastName}`} onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                      {getInitials(user.firstName, user.lastName, user.email)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{user.rank || user.email || user.peNumber}</span>
                  </span>
                  <Pin size={15} className="text-accent" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MyDayWidget({
  currentUser,
  initialEntries,
  initialReminders,
  isAppBackgrounded = false,
}: {
  currentUser: AuthAccount | null;
  initialEntries?: CalendarEntry[];
  initialReminders?: Reminder[];
  isAppBackgrounded?: boolean;
}) {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const myDayRefreshTimerRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<'entries' | 'reminders'>('entries');
  const todayKey = formatDateKey(new Date());

  useEffect(() => {
    if (!initialEntries || !initialReminders) {
      return;
    }

    setEntries(initialEntries);
    setReminders(initialReminders);
    setIsLoading(false);
  }, [initialEntries, initialReminders]);

  const loadMyDay = useCallback(async (showLoading = true) => {
    if (!currentUser) {
      setEntries([]);
      setReminders([]);
      setIsLoading(false);
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [calendarResponse, reminderResponse] = await Promise.all([
        calendarService.getAll(currentUser.id),
        reminderService.getAll(),
      ]);
      setEntries(calendarResponse.data);
      setReminders(reminderResponse.data);
    } catch (err) {
      console.error('Failed to load My Day:', err);
      setError('Could not load today.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if ((!initialEntries || !initialReminders) && !isAppBackgrounded) {
      void loadMyDay();
    }
    const refresh = () => {
      if (isAppBackgrounded) {
        return;
      }

      if (myDayRefreshTimerRef.current) {
        window.clearTimeout(myDayRefreshTimerRef.current);
      }

      myDayRefreshTimerRef.current = window.setTimeout(() => {
        myDayRefreshTimerRef.current = null;
        void loadMyDay(false);
      }, 500);
    };

    window.addEventListener('shield:calendar-updated', refresh);
    window.addEventListener('shield:reminder-updated', refresh);

    return () => {
      window.removeEventListener('shield:calendar-updated', refresh);
      window.removeEventListener('shield:reminder-updated', refresh);
      if (myDayRefreshTimerRef.current) {
        window.clearTimeout(myDayRefreshTimerRef.current);
        myDayRefreshTimerRef.current = null;
      }
    };
  }, [initialEntries, initialReminders, isAppBackgrounded, loadMyDay]);

  const todaysEntries = entries
    .filter((entry) => entry.date === todayKey)
    .sort((a, b) => a.category.localeCompare(b.category));
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartKey = formatDateKey(weekStart);
  const weekEndKey = formatDateKey(weekEnd);
  const weeklyMiles = entries
    .filter((entry) => entry.date >= weekStartKey && entry.date <= weekEndKey)
    .reduce((total, entry) => total + (Number.parseFloat(entry.details?.regularDutyMiles || '0') || 0), 0);
  const openReminders = reminders
    .filter((reminder) => !reminder.completedAt)
    .sort((a, b) => getReminderDueAt(a) - getReminderDueAt(b) || a.title.localeCompare(b.title));
  const activeReminders = openReminders
    .filter((reminder) => getReminderDueAt(reminder) <= Date.now())
    .sort((a, b) => getReminderDueAt(a) - getReminderDueAt(b) || a.title.localeCompare(b.title));
  const upcomingReminders = openReminders.filter((reminder) => getReminderDueAt(reminder) > Date.now()).slice(0, 3);
  const overdueCount = activeReminders.filter((reminder) => reminder.remindOn < todayKey).length;
  const submittedCount = todaysEntries.filter((entry) => entry.submissionStatus === 'Submitted').length;

  const completeReminder = async (reminder: Reminder) => {
    try {
      await reminderService.update(reminder.id, { completed: true });
      setReminders((current) => current.map((item) => (
        item.id === reminder.id ? { ...item, completedAt: new Date().toISOString() } : item
      )));
      window.dispatchEvent(new Event('shield:reminder-updated'));
    } catch (err) {
      console.error('Failed to complete reminder:', err);
      setError('Could not complete reminder.');
    }
  };

  const snoozeReminder = async (reminder: Reminder) => {
    try {
      const response = await reminderService.update(reminder.id, {
        remindOn: addDaysToDateKey(todayKey, 1),
        remindAt: `${addDaysToDateKey(todayKey, 1)}T09:00`,
        completed: false,
      });
      setReminders((current) => current.map((item) => (item.id === reminder.id ? response.data : item)));
      window.dispatchEvent(new Event('shield:reminder-updated'));
    } catch (err) {
      console.error('Failed to snooze reminder:', err);
      setError('Could not snooze reminder.');
    }
  };

  const deleteReminder = async (reminder: Reminder) => {
    try {
      await reminderService.delete(reminder.id);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      window.dispatchEvent(new Event('shield:reminder-updated'));
    } catch (err) {
      console.error('Failed to delete reminder:', err);
      setError('Could not delete reminder.');
    }
  };

  return (
    <section data-onboarding-target="my-day" className="relative flex h-full min-h-[24rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
      <div className="border-b border-white/10 bg-primary-500 px-4 py-4 text-white dark:bg-gray-950 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-danger text-white shadow-lg shadow-red-950/25 ring-1 ring-white/15">
              <CalendarDays size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100 dark:text-gray-400">My Day</p>
              <h2 className="mt-1 truncate text-xl font-black text-white">{getReadableDate(todayKey)}</h2>
            </div>
          </div>
        </div>
        <div className="my-day-mileage-summary mt-4 rounded border border-white/15 bg-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-100 dark:text-gray-400">Miles reported this week</span>
            <span className="text-2xl font-black text-white">{weeklyMiles.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-blue-100/90 dark:text-gray-400">
            {new Date(`${weekStartKey}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(`${weekEndKey}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
      </div>

      {error && <div className="error m-3 sm:m-4">{error}</div>}
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        {isLoading ? (
          <div className="loading">Loading your day...</div>
        ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded bg-gray-100 p-1 dark:bg-gray-950">
            <button
              type="button"
              onClick={() => setActiveTab('entries')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-black transition ${activeTab === 'entries' ? 'bg-white text-primary-500 shadow-sm dark:bg-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
            >
              <NotebookPen size={15} />
              Entries
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reminders')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-black transition ${activeTab === 'reminders' ? 'bg-white text-primary-500 shadow-sm dark:bg-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
            >
              <Bell size={15} />
              Reminders
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeTab === 'entries' ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Today</h3>
                  {submittedCount > 0 && <span className="text-xs font-semibold text-success">{submittedCount} submitted</span>}
                </div>
                {todaysEntries.length === 0 ? (
                  <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No calendar entries for today.</div>
                ) : (
                  <div className="space-y-2">
                    {todaysEntries.slice(0, 5).map((entry) => (
                      <Link key={entry.id} to="/calendar" className="group relative block overflow-hidden rounded border border-gray-200 bg-gray-50 p-3 pl-4 transition hover:-translate-y-0.5 hover:border-accent hover:bg-white hover:shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900">
                        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: entry.color || entryColors[0].value }} />
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{entry.category}</span>
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${entry.submissionStatus === 'Submitted' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
                            {entry.submissionStatus}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {entry.districtWorked || 'No district'} - {entry.dutyHours || '0'} hrs
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Open reminders</h3>
                  {overdueCount > 0 && <span className="text-xs font-semibold text-danger">{overdueCount} overdue</span>}
                </div>
                {openReminders.length === 0 ? (
                  <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No open reminders.</div>
                ) : (
                  <div className="space-y-2">
                    {activeReminders.slice(0, 5).map((reminder) => (
                      <div key={reminder.id} className={`rounded border p-3 shadow-sm ${reminder.remindOn < todayKey ? 'border-danger/30 bg-danger/5 dark:bg-red-950/20' : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950'}`}>
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => void completeReminder(reminder)}
                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-400 transition hover:border-success hover:text-success dark:border-gray-700"
                            aria-label={`Complete ${reminder.title}`}
                            title="Complete"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-gray-100">{reminder.title}</p>
                              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getReminderPriorityClass(reminder.priority)}`}>{reminder.priority}</span>
                            </div>
                            <p className={`mt-1 flex items-center gap-1 text-xs ${reminder.remindOn < todayKey ? 'text-danger' : 'text-gray-500 dark:text-gray-400'}`}>
                              <Bell size={12} /> Due {getReminderDueLabel(reminder)}
                            </p>
                            {reminder.notes && <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{reminder.notes}</p>}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 pl-9">
                          <button type="button" onClick={() => void snoozeReminder(reminder)} className="btn-secondary px-2 py-1 text-xs" aria-label={`Snooze ${reminder.title}`} title="Snooze until tomorrow">
                            <Clock3 size={13} />
                          </button>
                          <button type="button" onClick={() => void deleteReminder(reminder)} className="btn-danger px-2 py-1 text-xs" aria-label={`Delete ${reminder.title}`} title="Delete Reminder">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {activeReminders.length === 0 && (
                      <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No reminders due right now.</div>
                    )}
                    {upcomingReminders.length > 0 && (
                      <div className="space-y-2 border-t border-gray-200 pt-2 dark:border-gray-800">
                        <p className="text-xs font-bold uppercase text-gray-400">Upcoming</p>
                        {upcomingReminders.map((reminder) => (
                          <div key={reminder.id} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{reminder.title}</p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getReminderPriorityClass(reminder.priority)}`}>{reminder.priority}</span>
                                <button
                                  type="button"
                                  onClick={() => void deleteReminder(reminder)}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-red-200 text-danger transition hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/40"
                                  aria-label={`Delete ${reminder.title}`}
                                  title="Delete Reminder"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Bell size={12} /> Due {getReminderDueLabel(reminder)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

function QuickNotesWidget({
  currentUser,
  initialNote,
}: {
  currentUser: AuthAccount | null;
  initialNote?: DashboardSummary['quickNote'];
}) {
  type StickyNote = {
    id: string;
    content: string;
    x: number;
    y: number;
    z: number;
    color: 'yellow' | 'blue' | 'green' | 'pink';
    updatedAt: string;
  };

  const stickyColors: Array<StickyNote['color']> = ['yellow', 'blue', 'green', 'pink'];
  const stickyColorMeta: Record<StickyNote['color'], { label: string; className: string; swatch: string }> = {
    yellow: {
      label: 'General',
      className: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-50',
      swatch: 'bg-amber-300',
    },
    blue: {
      label: 'Info',
      className: 'bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-50',
      swatch: 'bg-sky-300',
    },
    green: {
      label: 'Done',
      className: 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50',
      swatch: 'bg-emerald-300',
    },
    pink: {
      label: 'Urgent',
      className: 'bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-50',
      swatch: 'bg-rose-300',
    },
  };

  const parseStickyNotes = (value: string): StickyNote[] => {
    if (!value.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as { version?: number; notes?: unknown };
      if (parsed.version === 1 && Array.isArray(parsed.notes)) {
        return parsed.notes
          .map((note, index): StickyNote | null => {
            if (typeof note !== 'object' || note === null) {
              return null;
            }

            const item = note as Partial<StickyNote>;
            const color = stickyColors.includes(item.color as StickyNote['color']) ? item.color as StickyNote['color'] : stickyColors[index % stickyColors.length];
            return {
              id: typeof item.id === 'string' ? item.id : `note-${index}`,
              content: typeof item.content === 'string' ? item.content : '',
              x: Number.isFinite(item.x) ? Number(item.x) : 18 + index * 28,
              y: Number.isFinite(item.y) ? Number(item.y) : 18 + index * 28,
              z: Number.isFinite(item.z) ? Number(item.z) : index + 1,
              color,
              updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
            };
          })
          .filter((note): note is StickyNote => Boolean(note));
      }
    } catch {
      // Plain text notes from the previous dashboard become one sticky note.
    }

    return [{
      id: `note-${Date.now()}`,
      content: value,
      x: 18,
      y: 18,
      z: 1,
      color: 'yellow',
      updatedAt: new Date().toISOString(),
    }];
  };

  const serializeStickyNotes = (notes: StickyNote[]): string =>
    JSON.stringify({
      version: 1,
      notes: notes.map((note) => ({
        ...note,
        content: note.content.slice(0, 1800),
        updatedAt: note.updatedAt,
      })),
    });

  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [topNoteZ, setTopNoteZ] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const hasLoadedNoteRef = useRef(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, noteX: 0, noteY: 0 });

  useEffect(() => {
    if (!currentUser) {
      setNotes([]);
      setTopNoteZ(1);
      hasLoadedNoteRef.current = false;
      return;
    }

    if (initialNote) {
      hasLoadedNoteRef.current = false;
      const parsedNotes = parseStickyNotes(initialNote.content || '');
      setNotes(parsedNotes);
      setTopNoteZ(Math.max(1, ...parsedNotes.map((note) => note.z)));
      setLastSavedAt(initialNote.updatedAt ? new Date(initialNote.updatedAt).toLocaleTimeString() : null);
      setStatus('saved');
      window.setTimeout(() => {
        hasLoadedNoteRef.current = true;
      }, 0);
      return;
    }

    hasLoadedNoteRef.current = false;
    setStatus('idle');
    quickNoteService.get()
      .then((response) => {
        const parsedNotes = parseStickyNotes(response.data.content || '');
        setNotes(parsedNotes);
        setTopNoteZ(Math.max(1, ...parsedNotes.map((note) => note.z)));
        setLastSavedAt(response.data.updatedAt ? new Date(response.data.updatedAt).toLocaleTimeString() : null);
        setStatus('saved');
      })
      .catch((err) => {
        console.error('Failed to load quick note:', err);
        setStatus('error');
      })
      .finally(() => {
        hasLoadedNoteRef.current = true;
      });
  }, [currentUser, initialNote]);

  useEffect(() => {
    if (!currentUser || !hasLoadedNoteRef.current) {
      return undefined;
    }

    setStatus('saving');
    const timer = window.setTimeout(() => {
      quickNoteService.save(serializeStickyNotes(notes))
        .then((response) => {
          setLastSavedAt(new Date(response.data.updatedAt).toLocaleTimeString());
          setStatus('saved');
        })
        .catch((err) => {
          console.error('Failed to save quick note:', err);
          setStatus('error');
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [currentUser, notes]);

  useEffect(() => {
    if (!draggingNoteId) {
      return undefined;
    }

    const moveNote = (event: PointerEvent) => {
      const board = boardRef.current;
      if (!board) {
        return;
      }

      const rect = board.getBoundingClientRect();
      const noteWidth = 224;
      const noteHeight = 184;
      const maxX = Math.max(0, rect.width - noteWidth - 8);
      const maxY = Math.max(0, rect.height - noteHeight - 8);
      const scale = getDocumentScale();
      const nextX = Math.min(
        Math.max(8, dragStartRef.current.noteX + ((event.clientX - dragStartRef.current.pointerX) / scale)),
        maxX,
      );
      const nextY = Math.min(
        Math.max(8, dragStartRef.current.noteY + ((event.clientY - dragStartRef.current.pointerY) / scale)),
        maxY,
      );

      setNotes((currentNotes) => currentNotes.map((note) => (
        note.id === draggingNoteId ? { ...note, x: Math.round(nextX), y: Math.round(nextY) } : note
      )));
    };

    const stopDragging = () => setDraggingNoteId(null);

    window.addEventListener('pointermove', moveNote);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', moveNote);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [draggingNoteId]);

  const statusLabel = status === 'saving'
    ? 'Saving...'
    : status === 'saved'
      ? lastSavedAt ? `Saved ${lastSavedAt}` : 'Saved'
      : status === 'error'
        ? 'Could not save'
        : 'Ready';

  const formatNoteTimestamp = (value: string) => {
    if (!value) return 'Edited just now';
    const timestamp = new Date(value).getTime();
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (elapsedSeconds < 60) return 'Edited just now';
    if (elapsedSeconds < 3600) return `Edited ${Math.round(elapsedSeconds / 60)}m ago`;
    if (elapsedSeconds < 86400) return `Edited ${Math.round(elapsedSeconds / 3600)}h ago`;
    return `Edited ${new Date(value).toLocaleDateString()}`;
  };

  const addNote = () => {
    setNotes((currentNotes) => {
      const index = currentNotes.length;
      return [
        ...currentNotes,
        {
          id: `note-${Date.now()}`,
          content: '',
          x: 18 + (index % 3) * 32,
          y: 18 + (index % 3) * 28,
          z: topNoteZ + 1,
          color: stickyColors[index % stickyColors.length],
          updatedAt: new Date().toISOString(),
        },
      ];
    });
    setTopNoteZ((currentZ) => currentZ + 1);
  };

  const bringNoteToFront = (id: string) => {
    setTopNoteZ((currentZ) => {
      const nextZ = currentZ + 1;
      setNotes((currentNotes) => currentNotes.map((note) => (
        note.id === id ? { ...note, z: nextZ } : note
      )));
      return nextZ;
    });
  };

  const updateNoteContent = (id: string, content: string) => {
    setNotes((currentNotes) => currentNotes.map((note) => (
      note.id === id ? { ...note, content, updatedAt: new Date().toISOString() } : note
    )));
  };

  const updateNoteColor = (id: string, color: StickyNote['color']) => {
    setNotes((currentNotes) => currentNotes.map((note) => (
      note.id === id ? { ...note, color, updatedAt: new Date().toISOString() } : note
    )));
  };

  const duplicateNote = (note: StickyNote) => {
    const nextZ = topNoteZ + 1;
    setNotes((currentNotes) => [
      ...currentNotes,
      {
        ...note,
        id: `note-${Date.now()}`,
        x: note.x + 18,
        y: note.y + 18,
        z: nextZ,
        updatedAt: new Date().toISOString(),
      },
    ]);
    setTopNoteZ(nextZ);
  };

  const cycleNoteColor = (id: string) => {
    setNotes((currentNotes) => currentNotes.map((note) => (
      note.id === id ? { ...note, color: stickyColors[(stickyColors.indexOf(note.color) + 1) % stickyColors.length], updatedAt: new Date().toISOString() } : note
    )));
  };

  const deleteNote = (id: string) => {
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id));
  };

  const startDraggingNote = (event: React.PointerEvent<HTMLDivElement>, note: StickyNote) => {
    bringNoteToFront(note.id);

    if (event.button !== 0 || (event.target as HTMLElement).closest('textarea,button')) {
      return;
    }

    const card = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - card.left,
      y: event.clientY - card.top,
    };
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      noteX: note.x,
      noteY: note.y,
    };
    setDraggingNoteId(note.id);
  };

  return (
    <section data-onboarding-target="quick-notes" className="relative z-0 isolate flex h-full min-h-[32rem] flex-col rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent dark:text-white">
            <NotebookPen size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-primary-500 dark:text-white">Quick Notes</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-white">
              {status === 'saving' ? <Clock3 size={14} /> : status === 'saved' ? <CheckCircle2 size={14} className="text-success" /> : status === 'error' ? <AlertCircle size={14} className="text-danger" /> : <NotebookPen size={14} />}
              {statusLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={addNote}
          className="btn-primary shrink-0"
          aria-label="Add sticky note"
          title="Add Note"
        >
          <Plus size={16} />
        </button>
      </div>
      <div ref={boardRef} className="relative min-h-0 flex-1 overflow-hidden rounded border border-gray-200 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.28)_1px,transparent_0)] bg-[length:18px_18px] dark:border-gray-800 dark:bg-gray-950">
        {notes.length === 0 ? (
          <button
            type="button"
            onClick={addNote}
            className="absolute inset-4 flex items-center justify-center rounded border border-dashed border-gray-300 text-sm font-semibold text-gray-500 transition hover:border-accent hover:text-accent dark:border-gray-700 dark:text-white dark:hover:text-white"
          >
            <Plus size={17} />
          </button>
        ) : notes.map((note) => (
          <div
            key={note.id}
            onPointerDown={(event) => startDraggingNote(event, note)}
            className={`absolute flex h-44 w-56 cursor-grab flex-col rounded-sm p-3 shadow-lg ring-1 ring-black/5 transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-xl ${draggingNoteId === note.id ? 'cursor-grabbing scale-[1.035] rotate-1 shadow-2xl ring-2 ring-accent/40' : ''} ${stickyColorMeta[note.color].className}`}
            style={{ left: note.x, top: note.y, zIndex: note.z }}
          >
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => cycleNoteColor(note.id)}
                className="flex h-7 items-center gap-1 rounded-full bg-black/10 px-2 text-[10px] font-bold uppercase tracking-wide text-current transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
                aria-label={`Change note priority from ${stickyColorMeta[note.color].label}`}
                title={stickyColorMeta[note.color].label}
              >
                <span className={`h-2 w-2 rounded-full ${stickyColorMeta[note.color].swatch}`} />
                {stickyColorMeta[note.color].label}
              </button>
              <span className="flex items-center text-current/45" title="Drag note">
                <GripHorizontal size={15} />
              </span>
              <button
                type="button"
                onClick={() => duplicateNote(note)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-current transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
                aria-label="Duplicate sticky note"
                title="Duplicate Note"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                onClick={() => deleteNote(note.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-current transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
                aria-label="Delete sticky note"
                title="Delete Note"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mb-2 flex gap-1">
              {stickyColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateNoteColor(note.id, color)}
                  className={`h-3 flex-1 rounded-full ${stickyColorMeta[color].swatch} ${note.color === color ? 'ring-2 ring-current ring-offset-1 ring-offset-transparent' : 'opacity-65 hover:opacity-100'}`}
                  aria-label={`Set note priority to ${stickyColorMeta[color].label}`}
                  title={stickyColorMeta[color].label}
                />
              ))}
            </div>
            <textarea
              value={note.content}
              onChange={(event) => updateNoteContent(note.id, event.target.value)}
              placeholder="New note"
              maxLength={1800}
              className="sticky-note-editor min-h-0 flex-1 resize-none border-0 bg-transparent text-sm leading-5 outline-none placeholder:text-current/45"
            />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-current/10 pt-2 text-[10px] font-semibold uppercase tracking-wide text-current/55">
              <span>{formatNoteTimestamp(note.updatedAt)}</span>
              <span>{note.content.length}/1800</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistrictFeedWidget({
  currentUser,
  initialPosts,
}: {
  currentUser: AuthAccount | null;
  initialPosts?: DistrictFeedPost[];
}) {
  const districtName = currentUser?.district?.trim() || '';
  const canPost = Boolean(
    currentUser?.role === 'administrator' ||
    currentUser?.permissions?.includes('district-feed:post') ||
    currentUser?.permissions?.includes('dashboard:manage'),
  );
  const [posts, setPosts] = useState<DistrictFeedPost[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postCategory, setPostCategory] = useState<DistrictFeedPostCategory>('Announcement');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<DistrictFeedPost | null>(null);

  useEffect(() => {
    setPosts(initialPosts || []);
  }, [initialPosts]);

  const getCategoryClass = (category: DistrictFeedPostCategory) => {
    if (category === 'Alert') return 'bg-danger text-white';
    if (category === 'News') return 'bg-emerald-600 text-white';
    if (category === 'Update') return 'bg-primary-500 text-white';
    return 'bg-accent text-white';
  };

  const resetComposer = () => {
    setPostTitle('');
    setPostBody('');
    setPostCategory('Announcement');
    setEditingPostId(null);
    setPostError(null);
  };

  const startEditingPost = (post: DistrictFeedPost) => {
    setPostTitle(post.title);
    setPostBody(post.body);
    setPostCategory(post.category);
    setEditingPostId(post.id);
    setPostError(null);
    setIsComposerOpen(true);
  };

  const submitDistrictPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!postTitle.trim() || !postBody.trim()) {
      setPostError('Title and message are required.');
      return;
    }

    setIsPosting(true);
    setPostError(null);
    try {
      const payload = {
        category: postCategory,
        title: postTitle,
        body: postBody,
      };
      const response = editingPostId
        ? await districtFeedService.updatePost(editingPostId, payload)
        : await districtFeedService.createPost(payload);
      setPosts((current) => (
        editingPostId
          ? current.map((post) => (post.id === editingPostId ? response.data : post))
          : [response.data, ...current].slice(0, 8)
      ));
      resetComposer();
      setIsComposerOpen(false);
      window.dispatchEvent(new Event('shield:dashboard-updated'));
    } catch (err) {
      console.error('Failed to post district feed update:', err);
      setPostError(editingPostId ? 'Could not update the district feed post.' : 'Could not post to the district feed.');
    } finally {
      setIsPosting(false);
    }
  };

  const deleteDistrictPost = async (post: DistrictFeedPost) => {
    setPostError(null);
    try {
      await districtFeedService.deletePost(post.id);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setPostPendingDelete(null);
      if (editingPostId === post.id) {
        resetComposer();
        setIsComposerOpen(false);
      }
      window.dispatchEvent(new Event('shield:dashboard-updated'));
    } catch (err) {
      console.error('Failed to delete district feed post:', err);
      setPostError('Could not delete the district feed post.');
    }
  };

  return (
    <section data-onboarding-target="district-feed" className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
      <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary-500/10 text-primary-500 dark:text-white">
              <MapPinned size={19} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-primary-500 dark:text-white">District Feed</h2>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-white">
                {districtName ? `${districtName} command posts only` : 'No assigned district'}
              </p>
            </div>
          </div>
          {canPost && districtName && (
            <button
              type="button"
              onClick={() => {
                if (isComposerOpen) {
                  resetComposer();
                }
                setIsComposerOpen((value) => !value);
              }}
              className="btn-primary shrink-0"
              aria-label="Post to district feed"
              title="Post to District Feed"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {!districtName ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 px-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-white">
            Assign a district to your profile to see district activity.
          </div>
        ) : (
          <div className="space-y-3">
            {isComposerOpen && (
              <form onSubmit={submitDistrictPost} className="rounded border border-accent/30 bg-accent/5 p-3 dark:bg-accent/10">
                {postError && <div className="error mb-3">{postError}</div>}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <select
                    value={postCategory}
                    onChange={(event) => setPostCategory(event.target.value as DistrictFeedPostCategory)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  >
                    <option value="Announcement">Announcement</option>
                    <option value="Update">Update</option>
                    <option value="News">News</option>
                    <option value="Alert">Alert</option>
                  </select>
                  <input
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                    maxLength={140}
                    placeholder="Feed title"
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>
                <textarea
                  value={postBody}
                  onChange={(event) => setPostBody(event.target.value)}
                  maxLength={1600}
                  placeholder={`Post to ${districtName}`}
                  className="mt-2 min-h-24 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-white">{postBody.length}/1600</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => {
                      resetComposer();
                      setIsComposerOpen(false);
                    }} className="btn-secondary" aria-label="Cancel district feed post" title="Cancel">
                      <X size={16} />
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isPosting || !postTitle.trim() || !postBody.trim()} aria-label={editingPostId ? 'Save district feed post' : 'Post district feed update'} title={editingPostId ? 'Save' : 'Post'}>
                      <Send size={16} />
                      {editingPostId ? 'Save' : 'Post'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {posts.length === 0 ? (
              <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-white">
                No command posts have been added for {districtName} yet.
              </div>
            ) : posts.map((post) => (
              <article key={post.id} className="rounded border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${getCategoryClass(post.category)}`}>
                      {post.category}
                    </span>
                    <h3 className="mt-2 line-clamp-2 text-sm font-black text-gray-900 dark:text-white">{post.title}</h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-400 dark:text-white">
                      {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    {canPost && (
                      <>
                        <button type="button" onClick={() => startEditingPost(post)} className="btn-secondary px-2 py-1 text-xs" aria-label={`Edit ${post.title}`} title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => setPostPendingDelete(post)} className="btn-danger px-2 py-1 text-xs" aria-label={`Delete ${post.title}`} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-white">{post.body}</p>
                <p className="mt-3 text-xs font-semibold text-gray-400 dark:text-white">Posted by {post.authorName}</p>
              </article>
            ))}

          </div>
        )}
      </div>
      {postPendingDelete && createPortal((
        <div className="modal-backdrop fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4" onClick={() => setPostPendingDelete(null)}>
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete District Post</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Remove "{postPendingDelete.title}" from the {postPendingDelete.district} feed?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPostPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete district post" title="Cancel">
                <X size={16} />
                Cancel
              </button>
              <button type="button" onClick={() => void deleteDistrictPost(postPendingDelete)} className="btn-danger" aria-label="Delete district post" title="Delete">
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </section>
  );
}

const DashboardPage: React.FC<{
  currentUser: AuthAccount | null;
  isAppBackgrounded?: boolean;
}> = ({
  currentUser,
  isAppBackgrounded = false,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null);
  const [profileWindowPosition, setProfileWindowPosition] = useState(getInitialProfileWindowPosition);
  const [isProfileDragging, setIsProfileDragging] = useState(false);
  const [isMobileProfileLayout, setIsMobileProfileLayout] = useState(() => isMobileViewport());
  const [profileZIndex, setProfileZIndex] = useState(85);
  const profileWindowRef = useRef<HTMLDivElement | null>(null);
  const profileDragOffsetRef = useRef({ x: 0, y: 0 });
  const profileDragStartRef = useRef({ pointerX: 0, pointerY: 0, windowX: 0, windowY: 0 });
  const dashboardRefreshTimerRef = useRef<number | null>(null);
  const isAdministrator = currentUser?.role === 'administrator';

  useEffect(() => {
    const syncProfileLayout = () => {
      const nextIsMobile = isMobileViewport();
      setIsMobileProfileLayout(nextIsMobile);
      if (nextIsMobile) {
        setIsProfileDragging(false);
      }
    };

    syncProfileLayout();
    window.addEventListener('resize', syncProfileLayout);

    return () => window.removeEventListener('resize', syncProfileLayout);
  }, []);

  useEffect(() => {
    const handleFloatingFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ app?: string }>).detail;
      setProfileZIndex(detail?.app === 'profile' ? 85 : 58);
    };

    window.addEventListener('shield:floating-focus', handleFloatingFocus);
    return () => window.removeEventListener('shield:floating-focus', handleFloatingFocus);
  }, []);

  useEffect(() => {
    if (!isProfileDragging || isMobileProfileLayout) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = profileWindowRef.current?.offsetWidth || Math.min(window.innerWidth - 24, 920);
      const height = profileWindowRef.current?.offsetHeight || Math.min(window.innerHeight - 24, 760);
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      setProfileWindowPosition({
        x: Math.min(
          Math.max(12, profileDragStartRef.current.windowX + (event.clientX - profileDragStartRef.current.pointerX)),
          maxX,
        ),
        y: Math.min(
          Math.max(12, profileDragStartRef.current.windowY + (event.clientY - profileDragStartRef.current.pointerY)),
          maxY,
        ),
      });
    };

    const stopDragging = () => setIsProfileDragging(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isProfileDragging, isMobileProfileLayout]);

  useEffect(() => {
    const keepProfileInView = () => {
      if (isMobileViewport()) {
        return;
      }

      const width = profileWindowRef.current?.offsetWidth || Math.min(window.innerWidth - 24, 920);
      const height = profileWindowRef.current?.offsetHeight || Math.min(window.innerHeight - 24, 760);
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      setProfileWindowPosition((current) => ({
        x: Math.min(Math.max(12, current.x), maxX),
        y: Math.min(Math.max(12, current.y), maxY),
      }));
    };

    window.addEventListener('resize', keepProfileInView);
    return () => window.removeEventListener('resize', keepProfileInView);
  }, []);

  const focusProfileWindow = () => {
    setProfileZIndex(85);
    window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app: 'profile' } }));
  };

  const openPinnedProfile = (user: User) => {
    focusProfileWindow();
    setSelectedProfile(null);
    window.setTimeout(() => setSelectedProfile({ ...user }), 0);
  };

  const startDraggingProfile = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isMobileProfileLayout) {
      return;
    }

    if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) {
      return;
    }

    focusProfileWindow();

    const rect = profileWindowRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    profileDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    profileDragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      windowX: profileWindowPosition.x,
      windowY: profileWindowPosition.y,
    };
    setIsProfileDragging(true);
  };

  useEffect(() => {
    if (!currentUser) {
      setDashboardSummary(null);
      setLoading(false);
      return;
    }

    if (!isAppBackgrounded) {
      loadDashboard();
    }
    const handleDashboardUpdate = () => {
      if (isAppBackgrounded) {
        return;
      }

      if (dashboardRefreshTimerRef.current) {
        window.clearTimeout(dashboardRefreshTimerRef.current);
      }

      dashboardRefreshTimerRef.current = window.setTimeout(() => {
        dashboardRefreshTimerRef.current = null;
        loadDashboard(false);
      }, 500);
    };

    window.addEventListener('shield:dashboard-updated', handleDashboardUpdate);
    window.addEventListener('shield:device-updated', handleDashboardUpdate);
    window.addEventListener('shield:calendar-updated', handleDashboardUpdate);
    window.addEventListener('shield:mileage-updated', handleDashboardUpdate);
    window.addEventListener('shield:performance-evaluation-updated', handleDashboardUpdate);
    window.addEventListener('shield:permission-updated', handleDashboardUpdate);
    window.addEventListener('shield:user-updated', handleDashboardUpdate);
    return () => {
      window.removeEventListener('shield:dashboard-updated', handleDashboardUpdate);
      window.removeEventListener('shield:device-updated', handleDashboardUpdate);
      window.removeEventListener('shield:calendar-updated', handleDashboardUpdate);
      window.removeEventListener('shield:mileage-updated', handleDashboardUpdate);
      window.removeEventListener('shield:performance-evaluation-updated', handleDashboardUpdate);
      window.removeEventListener('shield:permission-updated', handleDashboardUpdate);
      window.removeEventListener('shield:user-updated', handleDashboardUpdate);
      if (dashboardRefreshTimerRef.current) {
        window.clearTimeout(dashboardRefreshTimerRef.current);
        dashboardRefreshTimerRef.current = null;
      }
    };
  }, [currentUser?.id, isAppBackgrounded]);

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await dashboardSummaryService.get();
      setDashboardSummary(response.data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError('Failed to load dashboard data. Check that the backend is running and MySQL is available.');
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const profileWindow = selectedProfile ? createPortal((
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: profileZIndex }}>
      <div
        ref={profileWindowRef}
        className={`pointer-events-auto fixed inset-0 h-[100dvh] w-full resize-none overflow-hidden rounded-none shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-black/10 dark:ring-white/10 md:inset-auto md:h-[min(82dvh,700px)] md:min-h-[min(480px,calc(100dvh-1.5rem))] md:w-[min(920px,calc(100vw-1.5rem))] md:min-w-[min(420px,calc(100vw-1.5rem))] md:resize md:rounded-lg ${isProfileDragging ? 'md:cursor-grabbing' : ''}`}
        style={isMobileProfileLayout ? undefined : { left: profileWindowPosition.x, top: profileWindowPosition.y }}
        onMouseDownCapture={focusProfileWindow}
      >
        <UserDetail
          user={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onEdit={(user) => {
            setSelectedProfile(null);
            navigate(`/search?userId=${encodeURIComponent(user.id)}&edit=1&q=${encodeURIComponent(`${user.firstName} ${user.lastName}`.trim() || user.email || user.id)}`);
          }}
          onMessage={(user) => window.dispatchEvent(new CustomEvent('shield:open-message-thread', { detail: user }))}
          canEdit={isAdministrator}
          currentUser={currentUser}
          onHeaderPointerDown={startDraggingProfile}
          isFloatingProfile
        />
      </div>
    </div>
  ), document.body) : null;

  if (!isAdministrator) {
    return (
      <div>
        <div className="mb-8">
          <h1>Dashboard</h1>
        </div>
        <PinnedProfilesWidget currentUser={currentUser} onOpenProfile={openPinnedProfile} initialProfiles={dashboardSummary?.pinnedProfiles} />
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)]">
          <MyDayWidget currentUser={currentUser} initialEntries={dashboardSummary?.calendarEntries} initialReminders={dashboardSummary?.reminders} isAppBackgrounded={isAppBackgrounded} />
          <DashboardNews currentUser={currentUser} initialPosts={dashboardSummary?.posts} isAppBackgrounded={isAppBackgrounded} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <QuickNotesWidget currentUser={currentUser} initialNote={dashboardSummary?.quickNote} />
          <DistrictFeedWidget currentUser={currentUser} initialPosts={dashboardSummary?.districtFeedPosts} />
        </div>
        {profileWindow}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div>
          <h1>Dashboard</h1>
          {isAdministrator && lastUpdated && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Live data updated at {lastUpdated}</p>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <PinnedProfilesWidget currentUser={currentUser} onOpenProfile={openPinnedProfile} initialProfiles={dashboardSummary?.pinnedProfiles} />
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)]">
        <MyDayWidget currentUser={currentUser} initialEntries={dashboardSummary?.calendarEntries} initialReminders={dashboardSummary?.reminders} isAppBackgrounded={isAppBackgrounded} />
        <DashboardNews currentUser={currentUser} initialPosts={dashboardSummary?.posts} isAppBackgrounded={isAppBackgrounded} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <QuickNotesWidget currentUser={currentUser} initialNote={dashboardSummary?.quickNote} />
        <DistrictFeedWidget currentUser={currentUser} initialPosts={dashboardSummary?.districtFeedPosts} />
      </div>
      {profileWindow}
    </div>
  );
};

export default DashboardPage;

