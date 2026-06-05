import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, Search, X } from 'lucide-react';
import { auditService, AuditLog, AuditLogFilters, AuditLogResponse } from '../services/api';

const DEFAULT_RESPONSE: AuditLogResponse = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  actions: [],
  entityTypes: [],
};

function safeDetails(details: string | null) {
  if (!details) {
    return null;
  }

  try {
    return JSON.parse(details);
  } catch {
    return details;
  }
}

function stringifyDetails(details: string | null) {
  const parsed = safeDetails(details);
  if (parsed === null) {
    return 'N/A';
  }

  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
}

function buildAuditCopyText(log: AuditLog) {
  return [
    `Time: ${new Date(log.createdAt).toLocaleString()}`,
    `Actor: ${log.actorName || log.actorId || 'System'}`,
    `Action: ${formatActionLabel(log.action)}`,
    `Entity: ${log.entityType}${log.entityId ? ` (${log.entityId})` : ''}`,
    `IP: ${log.ipAddress || 'N/A'}`,
    `User Agent: ${log.userAgent || 'N/A'}`,
    `Details: ${stringifyDetails(log.details)}`,
  ].join('\n');
}

function formatActionLabel(action: string): string {
  return action
    .replace(/[._-]/gu, ' ')
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function summarizeDetails(details: string | null): string {
  const rendered = stringifyDetails(details);
  if (rendered === 'N/A') {
    return 'No extra details.';
  }

  return rendered.length > 140 ? `${rendered.slice(0, 137)}...` : rendered;
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/gu, ' ');
  return `"${text.replace(/"/gu, '""')}"`;
}

function getExportRows(logs: AuditLog[]) {
  return [
    ['Time', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Details'],
    ...logs.map((log) => [
      new Date(log.createdAt).toLocaleString(),
      log.actorName || log.actorId || 'System',
      formatActionLabel(log.action),
      log.entityType,
      log.entityId || '',
      log.ipAddress || '',
      stringifyDetails(log.details),
    ]),
  ];
}

function downloadCsv(logs: AuditLog[]) {
  const rows = getExportRows(logs);
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shield-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadXlsx(logs: AuditLog[]) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet(getExportRows(logs));
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 26 },
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 70 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Log');
  XLSX.writeFile(workbook, `shield-audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function AuditLogPage({ isModalView = false }: { isModalView?: boolean }) {
  const [response, setResponse] = useState<AuditLogResponse>(DEFAULT_RESPONSE);
  const [filters, setFilters] = useState<AuditLogFilters>({ page: 1, pageSize: 50 });
  const [draftSearch, setDraftSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const loadLogs = useCallback(async (nextFilters = filters, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await auditService.getAll(nextFilters);
      setResponse(result.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLogs(filters);
    const handleAuditUpdate = () => loadLogs(filters, false);

    window.addEventListener('shield:audit-updated', handleAuditUpdate);
    return () => window.removeEventListener('shield:audit-updated', handleAuditUpdate);
  }, [filters, loadLogs]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return undefined;
    }

    const closeExportMenu = () => setIsExportMenuOpen(false);
    window.addEventListener('click', closeExportMenu);

    return () => window.removeEventListener('click', closeExportMenu);
  }, [isExportMenuOpen]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftSearch.trim() || undefined, page: 1 }));
  };

  const updateFilter = (field: keyof AuditLogFilters, value: string | number | undefined) => {
    setFilters((current) => ({ ...current, [field]: value || undefined, page: field === 'page' ? Number(value) : 1 }));
  };

  const exportFilteredLogs = async (format: 'csv' | 'xlsx') => {
    setIsExportMenuOpen(false);
    setExporting(true);
    try {
      const firstPage = await auditService.getAll({ ...filters, page: 1, pageSize: 500 });
      const allLogs = [...firstPage.data.data];

      for (let page = 2; page <= firstPage.data.totalPages; page += 1) {
        const pageResult = await auditService.getAll({ ...filters, page, pageSize: 500 });
        allLogs.push(...pageResult.data.data);
      }

      if (format === 'xlsx') {
        await downloadXlsx(allLogs);
      } else {
        downloadCsv(allLogs);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to export audit logs.');
    } finally {
      setExporting(false);
    }
  };

  const copyAuditLog = async (log: AuditLog) => {
    const text = buildAuditCopyText(log);
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
      setCopiedLogId(log.id);
      window.setTimeout(() => setCopiedLogId((currentId) => (currentId === log.id ? null : currentId)), 1800);
    } catch (err) {
      console.error('Failed to copy audit log:', err);
      setError('Failed to copy audit log.');
    }
  };

  const pageStart = response.total === 0 ? 0 : ((response.page - 1) * response.pageSize) + 1;
  const pageEnd = Math.min(response.total, response.page * response.pageSize);

  return (
    <div>
      {!isModalView && (
        <div className="mb-8">
          <div>
            <h1>Audit Log</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Search, review, and export administrative activity.</p>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white py-2 pl-14 pr-3 text-sm font-semibold shadow-sm outline-none transition placeholder:font-normal focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-gray-700 dark:bg-gray-950"
                  placeholder="Search actor, action, entity, details, or IP"
                />
              </div>
              <button type="submit" className="btn-primary h-12 w-12 shrink-0 rounded-lg p-0" title="Search" aria-label="Search audit logs">
                <Search size={18} />
              </button>
            </form>

            <div className="relative flex items-stretch justify-end">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExportMenuOpen((value) => !value);
                }}
                disabled={exporting || response.total === 0}
                className="btn-primary relative h-12 w-12 shrink-0 rounded-lg p-0"
                aria-expanded={isExportMenuOpen}
                aria-haspopup="menu"
                aria-label="Export audit logs"
                title={exporting ? 'Exporting' : 'Export audit logs'}
              >
                {exporting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Download size={16} />}
              </button>
              {isExportMenuOpen && (
                <div className="absolute right-0 top-14 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-950" role="menu">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportFilteredLogs('csv');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    role="menuitem"
                  >
                    <Download size={15} /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportFilteredLogs('xlsx');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    role="menuitem"
                  >
                    <FileSpreadsheet size={15} /> XLSX
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={filters.action || ''}
              onChange={(event) => updateFilter('action', event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">All actions</option>
              {response.actions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>

            <select
              value={filters.entityType || ''}
              onChange={(event) => updateFilter('entityType', event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">All entity types</option>
              {response.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>{entityType}</option>
              ))}
            </select>

            <input
              value={filters.actorId || ''}
              onChange={(event) => updateFilter('actorId', event.target.value.trim())}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              placeholder="Actor account ID"
            />

            <input
              type="date"
              value={filters.from || ''}
              onChange={(event) => updateFilter('from', event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              aria-label="From date"
            />

            <input
              type="date"
              value={filters.to || ''}
              onChange={(event) => updateFilter('to', event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              aria-label="To date"
            />
          </div>

          <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {pageStart}-{pageEnd} of {response.total.toLocaleString()} entries
            </span>
            <div className="flex items-center gap-2">
              <span>Rows</span>
              <select
                value={filters.pageSize || 50}
                onChange={(event) => updateFilter('pageSize', Number(event.target.value))}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {[25, 50, 100, 250, 500].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading audit logs...</div>
        ) : response.data.length === 0 ? (
          <div className="empty-state">No audit log entries match those filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">IP</th>
                  <th className="px-3 py-3">Details</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {response.data.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="cursor-pointer border-b border-gray-100 align-top transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-950"
                  >
                    <td className="whitespace-nowrap px-3 py-4 text-gray-700 dark:text-gray-200">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-4">
                      <div className="font-bold text-gray-900 dark:text-gray-100">{log.actorName || 'System'}</div>
                      {log.actorId && <div className="text-xs text-gray-500 dark:text-gray-400">{log.actorId}</div>}
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent ring-1 ring-accent/20">{formatActionLabel(log.action)}</span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="font-semibold text-gray-800 dark:text-gray-100">{log.entityType}</div>
                      {log.entityId && <div className="text-xs text-gray-500 dark:text-gray-400">{log.entityId}</div>}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{log.ipAddress || 'N/A'}</td>
                    <td className="max-w-xl px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="line-clamp-2 leading-5" title={stringifyDetails(log.details)}>{summarizeDetails(log.details)}</div>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyAuditLog(log);
                          }}
                          className="btn-secondary h-9 w-9 p-0"
                          title="Copy audit log"
                          aria-label="Copy audit log"
                        >
                          {copiedLogId === log.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => updateFilter('page', Math.max(1, response.page - 1))}
            disabled={response.page <= 1}
            className="btn-secondary h-10 w-10 p-0"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Page {response.page} of {response.totalPages}
          </span>
          <button
            type="button"
            onClick={() => updateFilter('page', Math.min(response.totalPages, response.page + 1))}
            disabled={response.page >= response.totalPages}
            className="btn-secondary h-10 w-10 p-0"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      {selectedLog && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setSelectedLog(null)}>
          <div className="modal-window max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2>Audit Details</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{new Date(selectedLog.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => void copyAuditLog(selectedLog)} aria-label="Copy audit details" title="Copy audit details">
                  {copiedLogId === selectedLog.id ? <Check size={18} /> : <Copy size={18} />}
                </button>
                <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => setSelectedLog(null)} aria-label="Close audit details">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="text-xs font-bold uppercase text-gray-500">Actor</div>
                <div className="mt-1 font-semibold">{selectedLog.actorName || 'System'}</div>
                <div className="break-all text-gray-500 dark:text-gray-400">{selectedLog.actorId || 'N/A'}</div>
              </div>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="text-xs font-bold uppercase text-gray-500">Request</div>
                <div className="mt-1">{selectedLog.ipAddress || 'N/A'}</div>
                <div className="break-all text-gray-500 dark:text-gray-400">{selectedLog.userAgent || 'N/A'}</div>
              </div>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="text-xs font-bold uppercase text-gray-500">Action</div>
                <div className="mt-1 font-semibold">{formatActionLabel(selectedLog.action)}</div>
              </div>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <div className="text-xs font-bold uppercase text-gray-500">Entity</div>
                <div className="mt-1 font-semibold">{selectedLog.entityType}</div>
                <div className="break-all text-gray-500 dark:text-gray-400">{selectedLog.entityId || 'N/A'}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-bold uppercase text-gray-500">Details</div>
              <pre className="max-h-[45vh] overflow-auto rounded bg-gray-950 p-4 text-xs text-gray-100">{stringifyDetails(selectedLog.details)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogPage;
