import { useEffect, useState } from 'react';
import { auditService, AuditLog } from '../services/api';

function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await auditService.getAll(200);
      setLogs(response.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    const interval = window.setInterval(() => loadLogs(false), 30000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="mb-8">
        <div>
          <h1>Audit Log</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Review administrative activity.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        {loading ? (
          <div className="loading">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">No audit log entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-4 text-sm">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-4">{log.actorName || log.actorId || 'System'}</td>
                    <td className="px-3 py-4">
                      <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold uppercase text-accent">{log.action}</span>
                    </td>
                    <td className="px-3 py-4">{log.entityType} {log.entityId ? `#${log.entityId}` : ''}</td>
                    <td className="max-w-xl truncate px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{log.details || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AuditLogPage;
