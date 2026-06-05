import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Radio, Search, Send, Trash2 } from 'lucide-react';
import { districtOptions } from '../constants/districts';
import { urgentAlertService, UrgentAlert, UrgentAlertAudienceType, UrgentAlertSeverity, userService, User } from '../services/api';

interface UrgentAlertsPageProps {
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const severityOptions: UrgentAlertSeverity[] = ['Advisory', 'Important', 'Urgent', 'Critical'];

function getErrorMessage(error: unknown, fallback: string): string {
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

function getSeverityClass(severity: UrgentAlertSeverity) {
  if (severity === 'Critical') return 'bg-red-600 text-white';
  if (severity === 'Urgent') return 'bg-red-50 text-danger ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900';
  if (severity === 'Important') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900';
  return 'bg-blue-50 text-primary-500 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-900';
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

export default function UrgentAlertsPage({ onToast }: UrgentAlertsPageProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<UrgentAlertSeverity>('Urgent');
  const [audienceType, setAudienceType] = useState<UrgentAlertAudienceType>('everyone');
  const [targetDistrict, setTargetDistrict] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<User[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<User[]>([]);
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [recentAlerts, setRecentAlerts] = useState<UrgentAlert[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [removingAlertId, setRemovingAlertId] = useState<string | null>(null);

  const selectedPersonIds = useMemo(() => new Set(selectedPeople.map((person) => person.id)), [selectedPeople]);

  const loadRecent = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingRecent(true);
    }
    try {
      const response = await urgentAlertService.getRecent();
      setRecentAlerts(response.data);
    } catch (error) {
      console.error('Failed to load urgent alert history:', error);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const handleUrgentAlertUpdate = () => void loadRecent(false);
    window.addEventListener('shield:urgent-alert-updated', handleUrgentAlertUpdate);

    return () => window.removeEventListener('shield:urgent-alert-updated', handleUrgentAlertUpdate);
  }, [loadRecent]);

  useEffect(() => {
    if (audienceType !== 'users' || personQuery.trim().length < 2) {
      setPersonResults([]);
      return;
    }

    let isMounted = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.search(personQuery);
        if (!isMounted) return;
        setPersonResults((response.data as User[]).filter((user) => !selectedPersonIds.has(user.id)).slice(0, 8));
      } catch (error) {
        console.error('Failed to search users for alert:', error);
      }
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [audienceType, personQuery, selectedPersonIds]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!title.trim() || !message.trim()) {
      onToast('error', 'Alert title and message are required.');
      return;
    }

    if (audienceType === 'district' && !targetDistrict) {
      onToast('error', 'Choose a district.');
      return;
    }

    if (audienceType === 'users' && selectedPeople.length === 0) {
      onToast('error', 'Choose at least one person.');
      return;
    }

    setIsSending(true);
    try {
      const response = await urgentAlertService.create({
        title,
        message,
        severity,
        audienceType,
        targetDistrict: audienceType === 'district' ? targetDistrict : undefined,
        targetUserIds: audienceType === 'users' ? selectedPeople.map((person) => person.id) : undefined,
        requireAcknowledgement,
        expiresAt: expiresAt || undefined,
      });
      onToast('success', `Urgent alert sent to ${response.data.audienceLabel || 'selected recipients'}.`);
      setTitle('');
      setMessage('');
      setSeverity('Urgent');
      setAudienceType('everyone');
      setTargetDistrict('');
      setPersonQuery('');
      setPersonResults([]);
      setSelectedPeople([]);
      setRequireAcknowledgement(true);
      setExpiresAt('');
      void loadRecent();
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to send urgent alert.'));
    } finally {
      setIsSending(false);
    }
  };

  const handleRemoveAlert = async (alert: UrgentAlert) => {
    const confirmed = window.confirm(`Remove "${alert.title}"? Recipients will no longer see this urgent alert.`);
    if (!confirmed) {
      return;
    }

    setRemovingAlertId(alert.id);
    try {
      await urgentAlertService.remove(alert.id);
      setRecentAlerts((alerts) => alerts.filter((item) => item.id !== alert.id));
      onToast('success', 'Urgent alert removed.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to remove urgent alert.'));
    } finally {
      setRemovingAlertId(null);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-danger text-white">
            <Radio size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Send Urgent Alert</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Broadcast an interrupting alert to selected personnel.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} className="min-h-32 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as UrgentAlertSeverity)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {severityOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Audience</span>
            <select value={audienceType} onChange={(event) => setAudienceType(event.target.value as UrgentAlertAudienceType)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              <option value="everyone">Everyone</option>
              <option value="district">District</option>
              <option value="users">Certain people</option>
            </select>
          </label>

          {audienceType === 'district' && (
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District</span>
              <select value={targetDistrict} onChange={(event) => setTargetDistrict(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                <option value="">Choose district</option>
                {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
            </label>
          )}

          {audienceType === 'users' && (
            <div className="lg:col-span-2">
              <label className="relative block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">People</span>
                <Search className="pointer-events-none absolute left-3 top-[2.35rem] text-gray-400" size={16} />
                <input value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Search personnel..." className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 dark:border-gray-700 dark:bg-gray-950" />
              </label>
              {personResults.length > 0 && (
                <div className="mt-2 overflow-hidden rounded border border-gray-200 dark:border-gray-800">
                  {personResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedPeople((people) => [...people, user]);
                        setPersonQuery('');
                        setPersonResults([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                    >
                      <span className="font-semibold">{user.firstName} {user.lastName}</span>
                      <span className="text-xs text-gray-500">{user.district || user.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedPeople.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPeople.map((person) => (
                    <button key={person.id} type="button" onClick={() => setSelectedPeople((people) => people.filter((item) => item.id !== person.id))} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-500 ring-1 ring-primary-100 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-900">
                      {person.firstName} {person.lastName} x
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Expires</span>
            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>

          <label className="flex items-center gap-3 rounded border border-gray-200 px-3 py-2 dark:border-gray-800">
            <input type="checkbox" checked={requireAcknowledgement} onChange={(event) => setRequireAcknowledgement(event.target.checked)} />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Require acknowledgement</span>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={isSending} className="btn-primary inline-flex items-center gap-2">
            <Send size={16} />
            {isSending ? 'Sending...' : 'Send Alert'}
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">Recent Alerts</h2>
        {isLoadingRecent ? (
          <div className="empty-state py-8 text-sm">Loading alert history...</div>
        ) : recentAlerts.length === 0 ? (
          <div className="empty-state py-8 text-sm">No urgent alerts have been sent.</div>
        ) : (
          <div className="space-y-2">
            {recentAlerts.map((alert) => {
              const recipientCount = alert.recipientCount || 0;
              const acknowledgedCount = alert.acknowledgedCount || 0;
              return (
                <div key={alert.id} className="rounded border border-gray-200 px-3 py-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 dark:text-gray-100">{alert.title}</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{alert.audienceLabel || alert.audienceType} - {formatDateTime(alert.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${getSeverityClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveAlert(alert)}
                        disabled={removingAlertId === alert.id}
                        className="btn-secondary h-8 w-8 p-0 text-danger hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900 dark:hover:bg-red-950"
                        aria-label={`Remove ${alert.title}`}
                        title="Remove alert"
                      >
                        {removingAlertId === alert.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <AlertTriangle size={14} />
                    <span>{acknowledgedCount} of {recipientCount} acknowledged</span>
                    <span>Expires: {formatDateTime(alert.expiresAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
