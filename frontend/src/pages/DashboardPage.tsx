import React, { useState, useEffect } from 'react';
import { authService, AuthAccount, calendarService, CalendarEntry, dashboardPostService, DashboardPost, userService, reportService, ReportRow, SystemStatistics, User } from '../services/api';
import { StatisticsCard } from '../components/StatisticsCard';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>;
type DashboardPostForm = Pick<DashboardPost, 'title' | 'body' | 'category'>;

const districtOptions = [
  'Area 1',
  'Toll Road',
  'Lowell',
  'Lafayette',
  'Peru',
  'Area 2',
  'Fort Wayne',
  'Bremen',
  'Area 3',
  'Bloomington',
  'Jasper',
  'Evansville',
  'Area 4',
  'Versailles',
  'Sellersburg',
  'Area 5',
  'Pendleton',
  'Indianapolis',
  'Putnamville',
  'Headquarters',
  'North Zone',
  'South Zone',
  'Central Zone',
  'Laboratory',
  'Polygraph',
  'CSI Section',
  'Digital Forensics Unit',
];

const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty'];

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
};

const createDefaultEntryForm = (date: string): CalendarEntryForm => ({
  category: 'General Information',
  date,
  dutyHours: '',
  districtWorked: districtOptions[0],
  specialStatus: specialStatusOptions[0],
  color: entryColors[0].value,
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
    <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Interactive Calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Click a day to add color-coded duty information stored in the database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary">
            Previous
          </button>
          <div className="min-w-40 text-center font-bold text-gray-700 dark:text-gray-200">
            {getMonthLabel(calendarMonth)}
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="btn-secondary">
            Next
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
              <button type="button" onClick={closeModal} className="btn-secondary">
                Close
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
                <button type="submit" className="btn-primary">
                  {editingEntryId ? 'Save Calendar Entry' : 'Add Calendar Entry'}
                </button>
                {editingEntryId && (
                  <button type="button" onClick={() => {
                    setEditingEntryId(null);
                    setEntryForm(createDefaultEntryForm(selectedDate));
                  }} className="btn-secondary ml-2">
                    Cancel Edit
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
                        <button type="button" onClick={() => editEntry(entry)} className="btn-secondary">
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteEntry(entry.id)} className="btn-danger">
                          Delete
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

function ReportBarChart({
  title,
  labelKey,
  data,
}: {
  title: string;
  labelKey: keyof Pick<ReportRow, 'rank' | 'district' | 'employmentType'>;
  data: ReportRow[];
}) {
  const maxCount = Math.max(...data.map((item) => Number(item.count) || 0), 1);
  const topItems = data.slice(0, 6);

  return (
    <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl">{title}</h2>
        <span className="rounded bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">
          Live
        </span>
      </div>
      <div className="space-y-4">
        {topItems.length === 0 ? (
          <div className="empty-state">No report data</div>
        ) : (
          topItems.map((item, index) => {
            const label = item[labelKey] || 'Unassigned';
            const count = Number(item.count) || 0;
            const percentage = Math.max((count / maxCount) * 100, 3);

            return (
              <div key={`${label}-${index}`}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400">{count}</span>
                </div>
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-3 rounded bg-primary-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DashboardNews({
  currentUser,
}: {
  currentUser: AuthAccount | null;
}) {
  const [posts, setPosts] = useState<DashboardPost[]>([]);
  const [postForm, setPostForm] = useState<DashboardPostForm>(defaultPostForm);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [postPendingDelete, setPostPendingDelete] = useState<DashboardPost | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const isAdministrator = currentUser?.role === 'administrator';

  const loadPosts = async (showLoading = true) => {
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
  };

  useEffect(() => {
    loadPosts();
    const interval = window.setInterval(() => loadPosts(false), 30000);

    return () => window.clearInterval(interval);
  }, []);

  const createPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser || !postForm.title.trim() || !postForm.body.trim()) {
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

  return (
    <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5">
        <div>
          <h2>Updates & News</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Administrative posts for everyone using SHIELD.</p>
        </div>
      </div>

      {postError && <div className="error">{postError}</div>}

      {isAdministrator && (
        <form onSubmit={createPost} className="mb-6 rounded border border-gray-200 p-4 dark:border-gray-800">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
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
            <label className="lg:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Post</span>
              <textarea
                value={postForm.body}
                onChange={(event) => setPostForm((form) => ({ ...form, body: event.target.value }))}
                className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
          </div>
          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={isSavingPost}>
              {isSavingPost ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
        </form>
      )}

      {isLoadingPosts ? (
        <div className="loading">Loading updates...</div>
      ) : posts.length === 0 ? (
        <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No updates posted yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {posts.map((post) => (
            <article key={post.id} className="rounded border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold uppercase text-accent">{post.category}</span>
                  <h3 className="mt-3 text-base">{post.title}</h3>
                </div>
                {isAdministrator && (
                  <button type="button" onClick={() => setPostPendingDelete(post)} className="btn-danger">
                    Delete
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{post.body}</p>
              <p className="mt-4 text-xs text-gray-400">
                Posted by {post.authorName || 'Administrator'} on {new Date(post.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      )}
      {postPendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Post</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete “{postPendingDelete.title}” from Updates & News?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPostPendingDelete(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={() => deletePost(postPendingDelete)} className="btn-danger">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const DashboardPage: React.FC<{ currentUser: AuthAccount | null }> = ({ currentUser }) => {
  const [stats, setStats] = useState<SystemStatistics | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [rankReport, setRankReport] = useState<ReportRow[]>([]);
  const [districtReport, setDistrictReport] = useState<ReportRow[]>([]);
  const [employmentReport, setEmploymentReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();

    const refreshInterval = window.setInterval(() => {
      loadDashboard(false);
    }, 30000);

    return () => window.clearInterval(refreshInterval);
  }, []);

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const [statsRes, usersRes, rankRes, districtRes, employmentRes] = await Promise.all([
        reportService.getStatistics(),
        userService.getAll(1, 10),
        reportService.getByRank(),
        reportService.getByDistrict(),
        reportService.getByEmploymentType(),
      ]);

      setStats(statsRes.data);
      setRecentUsers(usersRes.data.data);
      setRankReport(rankRes.data);
      setDistrictReport(districtRes.data);
      setEmploymentReport(employmentRes.data);
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

  const statItems = stats
    ? [
        { label: 'Total Users', value: stats.totalUsers || 0, icon: 'Users' },
        { label: 'Active Users', value: stats.activeUsers || 0, icon: 'On' },
        { label: 'Inactive Users', value: stats.inactiveUsers || 0, icon: 'Off' },
        { label: 'Districts', value: stats.totalDistricts || 0, icon: 'Map' },
        { label: 'Login Accounts', value: stats.totalAccounts || 0, icon: 'Accounts' },
        { label: 'Administrators', value: stats.administratorAccounts || 0, icon: 'Admin' },
        { label: 'Standard Users', value: stats.standardAccounts || 0, icon: 'User' },
      ]
    : [];

  return (
    <div>
      <div className="mb-8">
        <div>
          <h1>Dashboard</h1>
          {lastUpdated && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Live data updated at {lastUpdated}</p>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {stats && (
        <StatisticsCard
          stats={statItems}
          title="System Overview"
        />
      )}

      <DashboardNews currentUser={currentUser} />

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ReportBarChart title="Users by Rank" labelKey="rank" data={rankReport} />
        <ReportBarChart title="Users by District" labelKey="district" data={districtReport} />
        <ReportBarChart title="Employment Type" labelKey="employmentType" data={employmentReport} />
      </div>

      <div className="bg-white rounded-lg p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h2 className="mb-6">Recent Users</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recentUsers.map((user) => (
            <div
              key={user.id}
              className="bg-gradient-to-br from-gray-50 to-white border border-gray-300 rounded-lg p-5 transition hover:shadow-lg hover:-translate-y-1 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-primary-500 m-0 mb-2 text-base font-bold">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="m-0 mb-1 text-sm text-gray-600 font-semibold dark:text-gray-300">
                    Badge: {user.badgeNumber}
                  </p>
                  <p className="m-0 mb-1 text-sm text-secondary-500">
                    Rank: {user.rank}
                  </p>
                  <p className="m-0 text-sm text-accent">
                    District: {user.district}
                  </p>
                </div>
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    user.isActive
                      ? 'bg-green-100 text-success'
                      : 'bg-red-100 text-danger'
                  }`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
