import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Search, X } from 'lucide-react';
import { ErrorLog, ErrorLogFilters, errorLogService } from '../services/api';

function getErrorText(error: ErrorLog) {
  return error.stack || error.message;
}

export function ErrorLogPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [filters, setFilters] = useState<ErrorLogFilters>({ q: '', page: 1, pageSize: 50 });
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null);

  const loadLogs = useCallback(async (nextFilters = filters, showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await errorLogService.getAll(nextFilters);
      setLogs(response.data.data);
      setTotal(response.data.total);
      setFilters((current) => {
        if (current.page === response.data.page && current.pageSize === response.data.pageSize) {
          return current;
        }

        return { ...current, page: response.data.page, pageSize: response.data.pageSize };
      });
    } catch (err) {
      console.error('Failed to load error logs:', err);
      setError('Failed to load error logs.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadLogs();
    const handleErrorUpdate = () => {
      void loadLogs(filters, false);
    };

    window.addEventListener('shield:error-updated', handleErrorUpdate);

    return () => window.removeEventListener('shield:error-updated', handleErrorUpdate);
  }, [filters, loadLogs]);

  const copyErrorLog = async (log: ErrorLog) => {
    const text = [
      `Time: ${new Date(log.createdAt).toLocaleString()}`,
      `Level: ${log.level}`,
      `Route: ${log.method || 'N/A'} ${log.route || 'N/A'}`,
      `User: ${log.userId || 'N/A'}`,
      `IP: ${log.ipAddress || 'N/A'}`,
      `User Agent: ${log.userAgent || 'N/A'}`,
      getErrorText(log),
    ].join('\n');

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        if (!copied) {
          throw new Error('Fallback copy failed');
        }
      }
      setCopiedErrorId(log.id);
      window.setTimeout(() => setCopiedErrorId((currentId) => (currentId === log.id ? null : currentId)), 1800);
    } catch (err) {
      console.error('Failed to copy error log:', err);
      setError('Failed to copy error log.');
    }
  };

  const searchLogs = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadLogs({ ...filters, page: 1 });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Error Log</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Unhandled backend errors captured for troubleshooting.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={searchLogs} className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
        <input
          value={filters.q || ''}
          onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
          placeholder="Search message, route, stack, IP..."
          className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
        />
        <select
          value={filters.level || ''}
          onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))}
          className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
        >
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
        </select>
        <button type="submit" className="btn-primary" aria-label="Search error logs" title="Search">
          <Search size={16} />
        </button>
      </form>

      {loading ? (
        <div className="loading">Loading error logs...</div>
      ) : logs.length === 0 ? (
        <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No errors found.</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-primary-500 text-white">
              <tr>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Level</th>
                <th className="px-3 py-3">Route</th>
                <th className="px-3 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} onClick={() => setSelectedLog(log)} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                  <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3 font-bold uppercase text-danger">{log.level}</td>
                  <td className="px-3 py-3">{log.method || 'N/A'} {log.route || 'N/A'}</td>
                  <td className="max-w-md truncate px-3 py-3">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400">{total.toLocaleString()} total error log entries</p>

      {selectedLog && (
        createPortal(
          <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setSelectedLog(null)}>
            <div className="modal-window max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Error Details</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void copyErrorLog(selectedLog)} className="btn-secondary h-9 w-9 p-0" aria-label="Copy error details" title="Copy error details">
                    {copiedErrorId === selectedLog.id ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                  <button type="button" onClick={() => setSelectedLog(null)} className="icon-close-button" aria-label="Close error details" title="Close">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <pre className="max-h-[60vh] min-h-0 overflow-auto rounded bg-gray-950 p-4 text-xs leading-5 text-gray-100">{getErrorText(selectedLog)}</pre>
            </div>
          </div>,
          document.body,
        )
      )}
    </div>
  );
}

export default ErrorLogPage;
