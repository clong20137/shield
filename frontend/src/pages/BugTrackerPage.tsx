import { useEffect, useState } from 'react';
import { Bug, Save } from 'lucide-react';
import { BugReport, BugReportStatus } from '../services/api';

interface BugTrackerPageProps {
  reports: BugReport[];
  onStatusChange: (report: BugReport, status: BugReportStatus, adminNotes: string) => void;
}

export function BugTrackerPage({ reports, onStatusChange }: BugTrackerPageProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(reports[0]?.id || null);
  const selectedReport = reports.find((report) => report.id === selectedReportId) || reports[0] || null;
  const [status, setStatus] = useState<BugReportStatus>(selectedReport?.status || 'New');
  const [adminNotes, setAdminNotes] = useState(selectedReport?.adminNotes || '');

  useEffect(() => {
    if (!selectedReport) return;
    setStatus(selectedReport.status);
    setAdminNotes(selectedReport.adminNotes || '');
  }, [selectedReport?.id, selectedReport?.status, selectedReport?.adminNotes]);

  return (
    <div className="grid min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="min-h-0 overflow-y-auto rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Bug Reports</h3>
            <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{reports.length}</span>
          </div>
        </div>
        {reports.length === 0 ? (
          <div className="empty-state">No bug reports found.</div>
        ) : (
          reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReportId(report.id)}
              className={`block w-full border-b border-gray-200 px-4 py-3 text-left last:border-b-0 dark:border-gray-800 ${selectedReport?.id === report.id ? 'bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-1 font-bold text-gray-900 dark:text-gray-100">{report.title}</p>
                <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${
                  report.status === 'Fixed' || report.status === 'Closed'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-accent/10 text-accent'
                }`}>{report.status}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-gray-500 dark:text-gray-400">{report.location || 'No location'} - {report.priority}</p>
              <p className="mt-1 text-xs text-gray-400">{new Date(report.createdAt).toLocaleString()}</p>
            </button>
          ))
        )}
      </section>
      <section className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {!selectedReport ? (
          <div className="empty-state">Select a bug report.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
                    <Bug size={18} />
                  </div>
                  <div className="min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedReport.title}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Reported by {selectedReport.reporterName || selectedReport.reporterEmail || 'Unknown'} on {new Date(selectedReport.createdAt).toLocaleString()}
                  </p>
                  </div>
                </div>
                <span className="rounded bg-accent/10 px-3 py-1 text-sm font-bold text-accent">{selectedReport.priority}</span>
              </div>
              <p className="mt-3 rounded bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:bg-gray-950 dark:text-gray-300">{selectedReport.description}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as BugReportStatus)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                {['New', 'Pending', 'Fixed', 'Closed'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Admin notes</span>
              <textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} className="min-h-32 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <div className="flex justify-end">
              <button type="button" onClick={() => onStatusChange(selectedReport, status, adminNotes)} className="btn-primary" aria-label="Save bug status" title="Save Bug Status">
                <Save size={16} />
                <span>Save</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default BugTrackerPage;
