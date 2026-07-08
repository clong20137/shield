import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Car, FileUp, RefreshCw, Search, Upload, UserCheck, X } from 'lucide-react';
import { AuthAccount, FleetVehicleImportResponse, FleetVehicleRecord, fleetVehicleService } from '../services/api';

interface FleetVehiclesPageProps {
  currentUser: AuthAccount | null;
}

function hasPermission(account: AuthAccount | null, permission: string): boolean {
  return account?.role === 'administrator' || Boolean(account?.permissions?.includes(permission));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }

  return fallback;
}

function vehicleDisplayName(vehicle: FleetVehicleRecord): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
}

export default function FleetVehiclesPage({ currentUser }: FleetVehiclesPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicleRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<FleetVehicleImportResponse | null>(null);
  const [error, setError] = useState('');

  const canManageFleetVehicles = hasPermission(currentUser, 'fleet:vehicles:manage');

  const loadVehicles = useCallback(async () => {
    if (!canManageFleetVehicles) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await fleetVehicleService.getAll({ q: searchTerm, pageSize: 500 });
      setVehicles(response.data.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load fleet vehicles.'));
    } finally {
      setIsLoading(false);
    }
  }, [canManageFleetVehicles, searchTerm]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadVehicles();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [loadVehicles]);

  const summary = useMemo(() => ({
    total: vehicles.length,
    assigned: vehicles.filter((vehicle) => vehicle.assignedUserId).length,
    unmatched: vehicles.filter((vehicle) => !vehicle.assignedUserId).length,
  }), [vehicles]);

  const handleSpreadsheetChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsImporting(true);
    setUploadProgress(0);
    setImportResult(null);
    setError('');

    try {
      const response = await fleetVehicleService.importSpreadsheet(file, setUploadProgress);
      setUploadProgress(100);
      setImportResult(response.data);
      await loadVehicles();
    } catch (importError) {
      setError(getErrorMessage(importError, 'Failed to import the vehicle spreadsheet.'));
    } finally {
      setIsImporting(false);
    }
  };

  if (!canManageFleetVehicles) {
    return (
      <main className="app-page">
        <section className="empty-state rounded border border-dashed border-gray-300 py-10 text-center dark:border-gray-700">
          Fleet vehicle management requires the Fleet vehicles permission.
        </section>
      </main>
    );
  }

  return (
    <main className="app-page space-y-5">
      <input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={handleSpreadsheetChange} />

      <header className="app-page-header">
        <div>
          <p className="app-page-kicker">Fleet</p>
          <h1 className="app-page-title">Vehicle Inventory</h1>
          <p className="app-page-subtitle">Review agency vehicles and link operators by PE number when Shield has a matching user.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void loadVehicles()} disabled={isLoading}>
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <FileUp size={18} />
            Upload XLSX
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Vehicles</p>
          <p className="mt-1 text-2xl font-black text-gray-900 dark:text-gray-100">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm dark:border-green-900/60 dark:bg-green-950/30">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700 dark:text-green-200">PE Matched</p>
          <p className="mt-1 text-2xl font-black text-green-800 dark:text-green-100">{summary.assigned}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/60 dark:bg-red-950/30">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-200">Needs Review</p>
          <p className="mt-1 text-2xl font-black text-red-800 dark:text-red-100">{summary.unmatched}</p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {importResult && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black">Import complete</p>
              <p className="mt-1">
                {importResult.createdCount} created, {importResult.updatedCount} updated, {importResult.matchedCount} matched by PE number.
                {importResult.skippedRows.length > 0 ? ` ${importResult.skippedRows.length} rows need review.` : ''}
              </p>
            </div>
            <button type="button" className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/50" onClick={() => setImportResult(null)} aria-label="Dismiss import result">
              <X size={18} />
            </button>
          </div>
          {importResult.skippedRows.length > 0 && (
            <div className="mt-3 max-h-36 overflow-auto rounded border border-green-200 bg-white/70 p-2 text-xs dark:border-green-900 dark:bg-gray-950/40">
              {importResult.skippedRows.slice(0, 8).map((row) => (
                <p key={`${row.lineNumber}-${row.text}`} className="truncate">
                  Row {row.lineNumber}: {row.text}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              className="input w-full pl-10"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search unit, plate, PE, operator, model..."
            />
          </div>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{vehicles.length} shown</p>
        </div>

        {isLoading ? (
          <div className="loading m-6">Loading fleet vehicles...</div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state m-6 rounded border border-dashed border-gray-300 py-10 text-center dark:border-gray-700">
            No vehicles found.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:bg-gray-950/60 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">License</th>
                  <th className="px-4 py-3">Dist / Dept</th>
                  <th className="px-4 py-3">Operator</th>
                  <th className="px-4 py-3">Shield Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-black text-gray-900 dark:text-gray-100">
                      <span className="inline-flex items-center gap-2">
                        <Car size={18} className="text-primary-500" />
                        {vehicle.unitNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{vehicleDisplayName(vehicle)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{vehicle.license || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{vehicle.districtDepartment || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{vehicle.operatorName || '-'}</p>
                      <p className="text-xs text-gray-500">{vehicle.title || 'No title'} {vehicle.peNumber ? `- PE ${vehicle.peNumber}` : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      {vehicle.assignedUserId ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-black text-green-700 dark:bg-green-950 dark:text-green-200">
                          <UserCheck size={14} />
                          {vehicle.assignedUserName || 'Matched'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-700 dark:bg-red-950 dark:text-red-200">
                          <AlertTriangle size={14} />
                          Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isImporting && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
                <Upload size={22} />
              </div>
              <div>
                <p className="font-black text-gray-900 dark:text-gray-100">Importing vehicle spreadsheet</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reading rows and matching PE numbers.</p>
              </div>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div className="h-full rounded-full bg-primary-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
              <span>Upload progress</span>
              <span>{uploadProgress}%</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
