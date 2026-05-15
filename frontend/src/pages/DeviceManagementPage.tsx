import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Download, Eye, FileText, Laptop, Pencil, Plus, Printer, QrCode, RefreshCw, Radio, Router, Smartphone, Trash2, Upload, Wifi, Wrench, X } from 'lucide-react';
import { authService, AuthAccount, deviceService, DeviceEvent, DeviceRecord } from '../services/api';

type DeviceType = DeviceRecord['type'];
type DeviceStatus = DeviceRecord['status'];
type DeviceForm = Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>;
type SortKey = keyof Pick<DeviceRecord, 'type' | 'assetTag' | 'makeModel' | 'assignedTo' | 'status' | 'location' | 'maintenanceDueDate' | 'replacementDueDate' | 'updatedAt'>;

const deviceTypes: DeviceType[] = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio', 'Cradlepoint'];
const deviceStatuses: DeviceStatus[] = ['Available', 'Assigned', 'Maintenance', 'Damaged', 'Lost', 'Retired'];
const deviceConditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];

const defaultDeviceForm: DeviceForm = {
  type: 'Cell Phone',
  assetTag: '',
  makeModel: '',
  serialNumber: '',
  assignedTo: '',
  status: 'Available',
  location: '',
  notes: '',
  phoneNumber: '',
  imei: '',
  simNumber: '',
  radioId: '',
  hostname: '',
  routerId: '',
  warrantyExpiration: '',
  replacementDueDate: '',
  maintenanceDueDate: '',
  lastServiceDate: '',
  purchaseDate: '',
  condition: 'Good',
};

const deviceIconMap = {
  'Cell Phone': Smartphone,
  'MiFi Device': Router,
  Computer: Laptop,
  Radio,
  Cradlepoint: Wifi,
};

function toDeviceForm(device: DeviceRecord): DeviceForm {
  return {
    type: device.type,
    assetTag: device.assetTag,
    makeModel: device.makeModel,
    serialNumber: device.serialNumber || '',
    assignedTo: device.assignedTo || '',
    status: device.status,
    location: device.location || '',
    notes: device.notes || '',
    phoneNumber: device.phoneNumber || '',
    imei: device.imei || '',
    simNumber: device.simNumber || '',
    radioId: device.radioId || '',
    hostname: device.hostname || '',
    routerId: device.routerId || '',
    warrantyExpiration: device.warrantyExpiration || '',
    replacementDueDate: device.replacementDueDate || '',
    maintenanceDueDate: device.maintenanceDueDate || '',
    lastServiceDate: device.lastServiceDate || '',
    purchaseDate: device.purchaseDate || '',
    condition: device.condition || 'Good',
  };
}

function escapeCsv(value: string | number | undefined | null): string {
  const text = String(value ?? '');
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function formatDate(value: string): string {
  return value ? new Date(value).toLocaleDateString() : 'N/A';
}

function isDueSoon(value: string): boolean {
  if (!value) return false;
  const target = new Date(value).getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return target <= Date.now() + thirtyDays;
}

function DeviceManagementPage({ currentUser }: { currentUser: AuthAccount | null }) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<AuthAccount[]>([]);
  const [form, setForm] = useState<DeviceForm>(defaultDeviceForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeviceType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'All'>('All');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [detailDevice, setDetailDevice] = useState<DeviceRecord | null>(null);
  const [deviceHistory, setDeviceHistory] = useState<DeviceEvent[]>([]);
  const [eventNotes, setEventNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canManageDevices = currentUser?.role === 'administrator';
  const actor = { actorId: currentUser?.id, actorName: currentUser?.displayName || currentUser?.email };

  useEffect(() => {
    loadDevices();
    loadRegisteredUsers();
  }, []);

  const loadRegisteredUsers = async () => {
    if (!currentUser) {
      setRegisteredUsers([]);
      return;
    }

    try {
      const response = await authService.getAccounts(currentUser.id);
      setRegisteredUsers(response.data);
    } catch (err) {
      console.error('Failed to load registered users:', err);
      setRegisteredUsers([]);
    }
  };

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await deviceService.getAll();
      setDevices(response.data);
    } catch (err) {
      console.error('Failed to load device inventory:', err);
      setError('Failed to load device inventory. Check that the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceHistory = async (device: DeviceRecord) => {
    setDetailDevice(device);
    setEventNotes('');
    try {
      const response = await deviceService.getHistory(device.id);
      setDeviceHistory(response.data);
    } catch (err) {
      console.error('Failed to load device history:', err);
      setDeviceHistory([]);
    }
  };

  const filteredDevices = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    return devices
      .filter((device) => {
        const matchesType = filter === 'All' || device.type === filter;
        const matchesStatus = statusFilter === 'All' || device.status === statusFilter;
        const searchableText = [
          device.assetTag,
          device.makeModel,
          device.serialNumber,
          device.assignedTo,
          device.status,
          device.location,
          device.phoneNumber,
          device.imei,
          device.simNumber,
          device.radioId,
          device.hostname,
          device.routerId,
        ]
          .join(' ')
          .toLowerCase();

        return matchesType && matchesStatus && (!searchTerm || searchableText.includes(searchTerm));
      })
      .sort((a, b) => String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')));
  }, [devices, filter, query, sortKey, statusFilter]);

  const statusCounts = useMemo(
    () =>
      deviceStatuses.map((status) => ({
        status,
        count: devices.filter((device) => device.status === status).length,
      })),
    [devices],
  );

  const saveDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageDevices) {
      setError('You do not have permission to manage devices.');
      return;
    }

    if (!form.assetTag.trim() || !form.makeModel.trim()) {
      setError('Enter an asset tag and make/model before saving.');
      return;
    }

    setError(null);

    try {
      if (editingId) {
        const response = await deviceService.update(editingId, {
          ...form,
          ...actor,
          eventAction: 'Updated',
          eventNotes: eventNotes || 'Device details updated.',
        });
        setDevices((currentDevices) =>
          currentDevices.map((device) => (device.id === editingId ? response.data : device)),
        );
        setEditingId(null);
      } else {
        const response = await deviceService.create({
          ...form,
          ...actor,
          eventNotes: eventNotes || 'Device added to inventory.',
        });
        setDevices((currentDevices) => [response.data, ...currentDevices]);
      }

      setForm(defaultDeviceForm);
      setEventNotes('');
    } catch (err) {
      console.error('Failed to save device:', err);
      setError('Failed to save device. Check for duplicate asset tags and try again.');
    }
  };

  const editDevice = (device: DeviceRecord) => {
    setEditingId(device.id);
    setForm(toDeviceForm(device));
    setEventNotes('');
  };

  const updateDeviceStatus = async (device: DeviceRecord, status: DeviceStatus, action: string) => {
    if (!canManageDevices) return;

    try {
      const response = await deviceService.update(device.id, {
        ...toDeviceForm(device),
        status,
        assignedTo: status === 'Available' ? '' : device.assignedTo,
        lastServiceDate: action === 'Maintenance' ? new Date().toISOString().slice(0, 10) : device.lastServiceDate || '',
        ...actor,
        eventAction: action,
        eventNotes: eventNotes || action,
      });
      setDevices((currentDevices) => currentDevices.map((item) => (item.id === device.id ? response.data : item)));
      setDetailDevice(response.data);
      await loadDeviceHistory(response.data);
    } catch (err) {
      console.error('Failed to update device status:', err);
      setError('Failed to update device status.');
    }
  };

  const addHistoryNote = async () => {
    if (!detailDevice || !eventNotes.trim()) return;

    try {
      const response = await deviceService.addHistory(detailDevice.id, {
        action: 'Note',
        assignedTo: detailDevice.assignedTo,
        status: detailDevice.status,
        notes: eventNotes,
        ...actor,
      });
      setDeviceHistory((history) => [response.data, ...history]);
      setEventNotes('');
    } catch (err) {
      console.error('Failed to add device note:', err);
      setError('Failed to add device note.');
    }
  };

  const deleteDevice = async (deviceId: string) => {
    if (!canManageDevices) return;

    const device = devices.find((item) => item.id === deviceId);
    const label = device?.assetTag || 'this device';

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    try {
      await deviceService.delete(deviceId, { ...actor, eventNotes: `Deleted ${label}.` });
      setDevices((currentDevices) => currentDevices.filter((device) => device.id !== deviceId));
      setSelectedDevices((ids) => ids.filter((id) => id !== deviceId));

      if (editingId === deviceId) {
        setEditingId(null);
        setForm(defaultDeviceForm);
      }
    } catch (err) {
      console.error('Failed to delete device:', err);
      setError('Failed to delete device.');
    }
  };

  const exportCsv = () => {
    const headers = [
      'type',
      'assetTag',
      'makeModel',
      'serialNumber',
      'assignedTo',
      'status',
      'location',
      'phoneNumber',
      'imei',
      'simNumber',
      'radioId',
      'hostname',
      'routerId',
      'warrantyExpiration',
      'replacementDueDate',
      'maintenanceDueDate',
      'lastServiceDate',
      'purchaseDate',
      'condition',
      'notes',
    ];
    const rows = filteredDevices.map((device) => headers.map((header) => escapeCsv(device[header as keyof DeviceRecord])).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shield-device-inventory.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canManageDevices) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const [headerLine, ...lines] = text.split(/\r?\n/u).filter(Boolean);
    const headers = parseCsvLine(headerLine);

    try {
      const importedDevices = await Promise.all(
        lines.map((line) => {
          const values = parseCsvLine(line);
          const nextForm = { ...defaultDeviceForm };
          headers.forEach((header, index) => {
            if (header in nextForm) {
              (nextForm as Record<string, string>)[header] = values[index] || '';
            }
          });
          return deviceService.create({ ...nextForm, ...actor, eventNotes: 'Imported from CSV.' });
        }),
      );
      setDevices((currentDevices) => [...importedDevices.map((response) => response.data), ...currentDevices]);
    } catch (err) {
      console.error('Failed to import devices:', err);
      setError('Failed to import CSV. Check required fields and duplicate asset tags.');
    } finally {
      event.target.value = '';
    }
  };

  const bulkStatusUpdate = async (status: DeviceStatus) => {
    if (!canManageDevices || selectedDevices.length === 0) return;

    const selected = devices.filter((device) => selectedDevices.includes(device.id));
    const responses = await Promise.all(
      selected.map((device) =>
        deviceService.update(device.id, {
          ...toDeviceForm(device),
          status,
          ...actor,
          eventAction: `Bulk ${status}`,
          eventNotes: `Bulk updated to ${status}.`,
        }),
      ),
    );

    setDevices((currentDevices) =>
      currentDevices.map((device) => responses.find((response) => response.data.id === device.id)?.data || device),
    );
    setSelectedDevices([]);
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Device Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track assigned equipment, maintenance, inventory status, and ownership history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded bg-accent/10 px-4 py-2 text-sm font-bold text-accent">
            {devices.length} total devices
          </div>
          <button type="button" onClick={loadDevices} className="btn-secondary" title="Refresh devices">
            <RefreshCw size={16} /> Refresh
          </button>
          <button type="button" onClick={exportCsv} className="btn-secondary">
            <Download size={16} /> Export CSV
          </button>
          {canManageDevices && (
            <label className="btn-secondary cursor-pointer">
              <Upload size={16} /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
            </label>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading device inventory...</div>}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {statusCounts.map((item) => (
          <button
            key={item.status}
            type="button"
            onClick={() => setStatusFilter(item.status)}
            className={`rounded-lg bg-white p-4 text-left shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 ${statusFilter === item.status ? 'ring-2 ring-accent' : ''}`}
          >
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{item.status}</p>
            <p className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">{item.count}</p>
          </button>
        ))}
      </div>

      {canManageDevices && (
        <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <h2 className="mb-5">{editingId ? 'Edit Device' : 'Add Device'}</h2>
          <form onSubmit={saveDevice} className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <Field label="Device Type">
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as DeviceType }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                {deviceTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <TextField label="Asset Tag" value={form.assetTag} required onChange={(value) => setForm((current) => ({ ...current, assetTag: value }))} />
            <TextField label="Make / Model" value={form.makeModel} required onChange={(value) => setForm((current) => ({ ...current, makeModel: value }))} />
            <TextField label="Serial Number" value={form.serialNumber} onChange={(value) => setForm((current) => ({ ...current, serialNumber: value }))} />
            <Field label="Assigned To">
              <select value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value, status: event.target.value ? 'Assigned' : 'Available' }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                <option value="">Unassigned</option>
                {registeredUsers.map((user) => <option key={user.id} value={user.email}>{user.displayName} ({user.email})</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DeviceStatus }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                {deviceStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                {deviceConditions.map((condition) => <option key={condition}>{condition}</option>)}
              </select>
            </Field>
            <TextField label="Location" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
            <TextField label="Phone Number" value={form.phoneNumber} onChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))} />
            <TextField label="IMEI" value={form.imei} onChange={(value) => setForm((current) => ({ ...current, imei: value }))} />
            <TextField label="SIM Number" value={form.simNumber} onChange={(value) => setForm((current) => ({ ...current, simNumber: value }))} />
            <TextField label="Radio ID" value={form.radioId} onChange={(value) => setForm((current) => ({ ...current, radioId: value }))} />
            <TextField label="Hostname" value={form.hostname} onChange={(value) => setForm((current) => ({ ...current, hostname: value }))} />
            <TextField label="Router ID" value={form.routerId} onChange={(value) => setForm((current) => ({ ...current, routerId: value }))} />
            <DateField label="Purchase Date" value={form.purchaseDate} onChange={(value) => setForm((current) => ({ ...current, purchaseDate: value }))} />
            <DateField label="Warranty Expiration" value={form.warrantyExpiration} onChange={(value) => setForm((current) => ({ ...current, warrantyExpiration: value }))} />
            <DateField label="Replacement Due" value={form.replacementDueDate} onChange={(value) => setForm((current) => ({ ...current, replacementDueDate: value }))} />
            <DateField label="Maintenance Due" value={form.maintenanceDueDate} onChange={(value) => setForm((current) => ({ ...current, maintenanceDueDate: value }))} />
            <DateField label="Last Service" value={form.lastServiceDate} onChange={(value) => setForm((current) => ({ ...current, lastServiceDate: value }))} />
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Event Note</span>
              <input value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <label className="block lg:col-span-4">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Device Notes</span>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-20 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <div className="flex flex-wrap gap-3 lg:col-span-4">
              <button type="submit" className="btn-primary">{editingId ? <Pencil size={16} /> : <Plus size={16} />}{editingId ? 'Save Device' : 'Add Device'}</button>
              {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(defaultDeviceForm); }} className="btn-secondary"><X size={16} /> Cancel</button>}
            </div>
          </form>
        </section>
      )}

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2>Inventory</h2>
          <div className="flex flex-wrap gap-3">
            <select value={filter} onChange={(event) => setFilter(event.target.value as DeviceType | 'All')} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              {deviceTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DeviceStatus | 'All')} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              {deviceStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option value="assetTag">Asset Tag</option>
              <option value="type">Type</option>
              <option value="status">Status</option>
              <option value="assignedTo">Assigned To</option>
              <option value="maintenanceDueDate">Maintenance Due</option>
              <option value="replacementDueDate">Replacement Due</option>
            </select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
          </div>
        </div>

        {selectedDevices.length > 0 && canManageDevices && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-gray-50 p-3 dark:bg-gray-950">
            <span className="text-sm font-bold">{selectedDevices.length} selected</span>
            <button type="button" onClick={() => bulkStatusUpdate('Maintenance')} className="btn-secondary"><Wrench size={16} /> Maintenance</button>
            <button type="button" onClick={() => bulkStatusUpdate('Retired')} className="btn-secondary"><Ban size={16} /> Retire</button>
            <button type="button" onClick={() => setSelectedDevices([])} className="btn-secondary"><X size={16} /> Clear</button>
          </div>
        )}

        {filteredDevices.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No devices match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3"><input type="checkbox" checked={selectedDevices.length === filteredDevices.length} onChange={(event) => setSelectedDevices(event.target.checked ? filteredDevices.map((device) => device.id) : [])} /></th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Asset Tag</th>
                  <th className="px-3 py-3">Make / Model</th>
                  <th className="px-3 py-3">Assigned To</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Condition</th>
                  <th className="px-3 py-3">Maintenance</th>
                  <th className="px-3 py-3">Replacement</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const DeviceIcon = deviceIconMap[device.type];
                  return (
                    <tr key={device.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-4"><input type="checkbox" checked={selectedDevices.includes(device.id)} onChange={(event) => setSelectedDevices((ids) => event.target.checked ? [...ids, device.id] : ids.filter((id) => id !== device.id))} /></td>
                      <td className="px-3 py-4"><div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100"><DeviceIcon size={18} className="text-accent" />{device.type}</div></td>
                      <td className="px-3 py-4 font-semibold">{device.assetTag}</td>
                      <td className="px-3 py-4">{device.makeModel}</td>
                      <td className="px-3 py-4">{device.assignedTo || 'Unassigned'}</td>
                      <td className="px-3 py-4"><StatusBadge status={device.status} /></td>
                      <td className="px-3 py-4">{device.condition || 'Good'}</td>
                      <td className={`px-3 py-4 ${isDueSoon(device.maintenanceDueDate) ? 'font-bold text-danger' : ''}`}>{formatDate(device.maintenanceDueDate)}</td>
                      <td className={`px-3 py-4 ${isDueSoon(device.replacementDueDate) ? 'font-bold text-danger' : ''}`}>{formatDate(device.replacementDueDate)}</td>
                      <td className="px-3 py-4">{device.location || 'N/A'}</td>
                      <td className="px-3 py-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => loadDeviceHistory(device)} className="btn-secondary" aria-label="View device" title="View"><Eye size={15} /></button>
                          {canManageDevices && <button type="button" onClick={() => editDevice(device)} className="btn-secondary" aria-label="Edit device" title="Edit"><Pencil size={15} /></button>}
                          {canManageDevices && <button type="button" onClick={() => deleteDevice(device.id)} className="btn-danger" aria-label="Delete device" title="Delete"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div>
                <h2>{detailDevice.assetTag}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detailDevice.type} - {detailDevice.makeModel}</p>
              </div>
              <button type="button" onClick={() => setDetailDevice(null)} className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800" aria-label="Close device details"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Detail label="Assigned To" value={detailDevice.assignedTo || 'Unassigned'} />
                  <Detail label="Status" value={detailDevice.status} />
                  <Detail label="Condition" value={detailDevice.condition || 'Good'} />
                  <Detail label="Location" value={detailDevice.location || 'N/A'} />
                  <Detail label="Serial" value={detailDevice.serialNumber || 'N/A'} />
                  <Detail label="Phone" value={detailDevice.phoneNumber || 'N/A'} />
                  <Detail label="IMEI" value={detailDevice.imei || 'N/A'} />
                  <Detail label="SIM" value={detailDevice.simNumber || 'N/A'} />
                  <Detail label="Radio ID" value={detailDevice.radioId || 'N/A'} />
                  <Detail label="Hostname" value={detailDevice.hostname || 'N/A'} />
                  <Detail label="Router ID" value={detailDevice.routerId || 'N/A'} />
                  <Detail label="Warranty" value={formatDate(detailDevice.warrantyExpiration)} />
                  <Detail label="Maintenance Due" value={formatDate(detailDevice.maintenanceDueDate)} />
                  <Detail label="Replacement Due" value={formatDate(detailDevice.replacementDueDate)} />
                </div>
                <div className="mt-4 rounded border border-gray-200 p-4 dark:border-gray-800">
                  <p className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Barcode / QR Label</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-gray-300 text-primary-500 dark:border-gray-700"><QrCode size={52} /></div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <p className="font-bold text-gray-800 dark:text-gray-100">{detailDevice.assetTag}</p>
                      <p>Use this asset tag for printable labels or scanner lookup.</p>
                      <button type="button" onClick={() => window.print()} className="btn-secondary mt-3"><Printer size={16} /> Print Label</button>
                    </div>
                  </div>
                </div>
                {canManageDevices && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Available', 'Checked In')} className="btn-secondary"><CheckCircle2 size={16} /> Check In</button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Maintenance', 'Maintenance')} className="btn-secondary"><Wrench size={16} /> Maintenance</button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Damaged', 'Marked Damaged')} className="btn-secondary"><AlertTriangle size={16} /> Damaged</button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Lost', 'Marked Lost')} className="btn-danger"><Ban size={16} /> Lost</button>
                  </div>
                )}
              </div>

              <aside>
                <h3 className="mb-3 text-lg font-bold">History</h3>
                {canManageDevices && (
                  <div className="mb-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <textarea value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} placeholder="Add a note or reason" className="mb-2 min-h-20 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                    <button type="button" onClick={addHistoryNote} className="btn-primary"><FileText size={16} /> Add Note</button>
                  </div>
                )}
                <div className="space-y-3">
                  {deviceHistory.length === 0 ? (
                    <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No history yet.</div>
                  ) : (
                    deviceHistory.map((event) => (
                      <div key={event.id} className="rounded border border-gray-200 p-3 text-sm dark:border-gray-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-gray-800 dark:text-gray-100">{event.action}</p>
                          <p className="text-xs text-gray-400">{new Date(event.createdAt).toLocaleString()}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{event.actorName || 'System'} - {event.status || detailDevice.status}</p>
                        {event.notes && <p className="mt-2 text-gray-600 dark:text-gray-300">{event.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Field label={label}>
      <input value={value} required={required} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
    </Field>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
    </Field>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-bold uppercase text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: DeviceStatus }) {
  const tone = status === 'Lost' || status === 'Damaged' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-accent/10 text-accent';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

export default DeviceManagementPage;
