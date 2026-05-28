import React, { useCallback, useRef, useState, useEffect } from 'react';
import { AlignCenter, AlignLeft, AlignRight, AlertCircle, Bold, ChevronLeft, ChevronRight, Heading1, Heading2, Heart, Image, Indent, Italic, List, ListOrdered, LucideIcon, Outdent, Pencil, PartyPopper, Plus, Quote, Save, Send, ThumbsUp, Trash2, Underline, Upload, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authService, AuthAccount, calendarService, CalendarEntry, dashboardPostService, DashboardPost, DashboardReaction, getAssetUrl, handleAssetImageError } from '../services/api';
import { districtOptions } from '../constants/districts';
import { FormattedText } from '../components/FormattedText';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;
type DashboardPostForm = Pick<DashboardPost, 'title' | 'body' | 'category' | 'imageUrl' | 'allowComments'>;

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
  imageUrl: '',
  allowComments: true,
};

const reactionOptions: Array<{
  key: DashboardReaction;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: 'like', label: 'Like', Icon: ThumbsUp },
  { key: 'celebrate', label: 'Celebrate', Icon: PartyPopper },
  { key: 'important', label: 'Important', Icon: AlertCircle },
  { key: 'thanks', label: 'Thanks', Icon: Heart },
];

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

const postHtmlPattern = /<\/?(p|div|br|strong|b|em|i|u|ul|ol|li|span|h1|h2|h3|blockquote)\b[^>]*>/iu;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function renderLegacyInlineFormatting(value: string): string {
  return escapeHtml(value)
    .replace(/\+\+([^+]+)\+\+/gu, '<u>$1</u>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/gu, '<em>$1</em>');
}

function legacyPostBodyToHtml(value: string): string {
  if (postHtmlPattern.test(value)) {
    return value;
  }

  const blocks: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.join('')}</ul>`);
    listItems = [];
  };

  value.split(/\r?\n/u).forEach((line) => {
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/u);
    if (listMatch) {
      listItems.push(`<li>${renderLegacyInlineFormatting(listMatch[1])}</li>`);
      return;
    }

    flushList();
    blocks.push(line.trim() ? `<p>${renderLegacyInlineFormatting(line)}</p>` : '<p><br></p>');
  });

  flushList();
  return blocks.join('');
}

function getPostBodyText(value: string): string {
  if (!postHtmlPattern.test(value)) {
    return value.trim();
  }

  const container = document.createElement('div');
  container.innerHTML = value;
  return (container.textContent || '').trim();
}

function RichPostEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const runCommand = (command: string, commandValue = '') => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  };

  const applyBlockStyle = (block: string) => {
    runCommand('formatBlock', block);
  };

  const preserveEditorFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950">
        <select
          onChange={(event) => applyBlockStyle(event.target.value)}
          defaultValue="p"
          className="h-10 rounded border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          aria-label="Text style"
          title="Text Style"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('bold')} className="btn-secondary" aria-label="Bold selected text" title="Bold">
          <Bold size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('italic')} className="btn-secondary" aria-label="Italicize selected text" title="Italic">
          <Italic size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('underline')} className="btn-secondary" aria-label="Underline selected text" title="Underline">
          <Underline size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyLeft')} className="btn-secondary" aria-label="Align text left" title="Align Left">
          <AlignLeft size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyCenter')} className="btn-secondary" aria-label="Align text center" title="Align Center">
          <AlignCenter size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('justifyRight')} className="btn-secondary" aria-label="Align text right" title="Align Right">
          <AlignRight size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('insertUnorderedList')} className="btn-secondary" aria-label="Add bulleted list" title="Bulleted List">
          <List size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('insertOrderedList')} className="btn-secondary" aria-label="Add numbered list" title="Numbered List">
          <ListOrdered size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('outdent')} className="btn-secondary" aria-label="Outdent text" title="Outdent">
          <Outdent size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => runCommand('indent')} className="btn-secondary" aria-label="Indent text" title="Indent">
          <Indent size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => applyBlockStyle('h1')} className="btn-secondary" aria-label="Apply heading one" title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => applyBlockStyle('h2')} className="btn-secondary" aria-label="Apply heading two" title="Heading 2">
          <Heading2 size={16} />
        </button>
        <button type="button" onMouseDown={preserveEditorFocus} onClick={() => applyBlockStyle('blockquote')} className="btn-secondary" aria-label="Apply quote style" title="Quote">
          <Quote size={16} />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        role="textbox"
        aria-multiline="true"
        onClick={() => editorRef.current?.focus()}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onChange(event.currentTarget.innerHTML)}
        className="rich-post-editor min-h-64 w-full overflow-y-auto rounded border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
        data-placeholder="Write the update. Highlight text and use the toolbar, or click a style before typing."
      />
    </div>
  );
}

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
    <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
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
}: {
  currentUser: AuthAccount | null;
}) {
  const [posts, setPosts] = useState<DashboardPost[]>([]);
  const [postForm, setPostForm] = useState<DashboardPostForm>(defaultPostForm);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [isUploadingPostImage, setIsUploadingPostImage] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<DashboardPost | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<DashboardPost | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const canManageDashboard = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('dashboard:manage'));
  const canCreateDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:create'));
  const canEditDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:edit'));
  const canDeleteDashboardPosts = canManageDashboard || Boolean(currentUser?.permissions?.includes('dashboard:delete'));

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
    loadPosts();
    const handleDashboardUpdate = () => loadPosts(false);

    window.addEventListener('shield:dashboard-updated', handleDashboardUpdate);
    return () => window.removeEventListener('shield:dashboard-updated', handleDashboardUpdate);
  }, [loadPosts]);

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

  const openEditPost = (post: DashboardPost) => {
    setEditingPost(post);
    setPostForm({
      title: post.title,
      body: legacyPostBodyToHtml(post.body),
      category: post.category,
      imageUrl: post.imageUrl || '',
      allowComments: post.allowComments,
    });
    setIsCreatePostOpen(false);
  };

  const closePostForm = () => {
    setIsCreatePostOpen(false);
    setEditingPost(null);
    setPostForm(defaultPostForm);
  };

  const uploadPostImage = async (file: File) => {
    setIsUploadingPostImage(true);
    setPostError(null);
    try {
      const response = await dashboardPostService.uploadImage(file);
      setPostForm((form) => ({ ...form, imageUrl: response.data.imageUrl }));
    } catch (err) {
      console.error('Failed to upload dashboard post image:', err);
      setPostError('Failed to upload image.');
    } finally {
      setIsUploadingPostImage(false);
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

  const reactToPost = async (post: DashboardPost, reaction: DashboardReaction) => {
    const nextReaction = post.myReaction === reaction ? null : reaction;
    setPostError(null);
    try {
      const response = await dashboardPostService.react(post.id, nextReaction);
      setPosts((currentPosts) =>
        currentPosts.map((currentPost) => (currentPost.id === post.id ? response.data : currentPost)),
      );
    } catch (err) {
      console.error('Failed to update dashboard post reaction:', err);
      setPostError('Failed to update reaction.');
    }
  };

  return (
    <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Updates & News</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Administrative posts for everyone using SHIELD.</p>
        </div>
        {canCreateDashboardPosts && (
          <button
            type="button"
            onClick={() => setIsCreatePostOpen(true)}
            className="btn-primary"
            aria-label="Create update or news post"
            title="Create Update"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {postError && <div className="error">{postError}</div>}

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
                {(canEditDashboardPosts || canDeleteDashboardPosts) && (
                  <div className="flex gap-2">
                    {canEditDashboardPosts && (
                      <button type="button" onClick={() => openEditPost(post)} className="btn-secondary" aria-label="Edit post" title="Edit">
                        <Pencil size={16} />
                      </button>
                    )}
                    {canDeleteDashboardPosts && (
                      <button type="button" onClick={() => setPostPendingDelete(post)} className="btn-danger" aria-label="Delete post" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {post.imageUrl && (
                <div className="mb-4 overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950">
                  <img
                    src={getAssetUrl(post.imageUrl)}
                    alt=""
                    onError={handleAssetImageError}
                    className="h-44 w-full object-cover"
                  />
                </div>
              )}
              <FormattedText text={post.body} className="text-sm leading-6 text-gray-700 dark:text-gray-300" />
              <div className="mt-4">
                <Link to={`/updates/${post.id}`} className="inline-flex items-center rounded border border-accent/30 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/10">
                  Read More
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {reactionOptions.map(({ key, label, Icon }) => {
                  const isActive = post.myReaction === key;
                  const count = post.reactions?.[key] || 0;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => reactToPost(post, key)}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition ${
                        isActive
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-gray-200 text-gray-600 hover:border-accent hover:text-accent dark:border-gray-800 dark:text-gray-300'
                      }`}
                      aria-label={`${label} reaction`}
                      title={label}
                    >
                      <Icon size={16} />
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Posted by {post.authorName || 'Administrator'} on {new Date(post.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      )}
      {(isCreatePostOpen || editingPost) && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
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
                <RichPostEditor
                  value={postForm.body}
                  onChange={(body) => setPostForm((form) => ({ ...form, body }))}
                />
              </div>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Thumbnail image</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Shown with this update on the dashboard.</span>
                  </div>
                  <div className="flex gap-2">
                    <label className="btn-secondary cursor-pointer" aria-label="Upload dashboard post image" title={isUploadingPostImage ? 'Uploading' : 'Upload Image'}>
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        disabled={isUploadingPostImage}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) {
                            void uploadPostImage(file);
                          }
                        }}
                      />
                    </label>
                    {postForm.imageUrl && (
                      <button type="button" onClick={() => setPostForm((form) => ({ ...form, imageUrl: '' }))} className="btn-secondary" aria-label="Remove dashboard post image" title="Remove Image">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {postForm.imageUrl ? (
                  <div className="mt-3 overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950">
                    <img src={getAssetUrl(postForm.imageUrl)} alt="" onError={handleAssetImageError} className="h-48 w-full object-cover" />
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
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Post</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete "{postPendingDelete.title}" from Updates & News?
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

const DashboardPage: React.FC<{ currentUser: AuthAccount | null }> = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const isAdministrator = currentUser?.role === 'administrator';

  useEffect(() => {
    if (!isAdministrator) {
      setLoading(false);
      return;
    }

    loadDashboard();
    const handleDashboardUpdate = () => {
      loadDashboard(false);
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
    };
  }, [isAdministrator]);

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
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

  if (!isAdministrator) {
    return (
      <div>
        <div className="mb-8">
          <h1>Dashboard</h1>
        </div>
        <DashboardNews currentUser={currentUser} />
      </div>
    );
  }

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

      <DashboardNews currentUser={currentUser} />
    </div>
  );
};

export default DashboardPage;
