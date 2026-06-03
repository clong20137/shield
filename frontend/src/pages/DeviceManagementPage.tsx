import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Download, Eye, FileText, Laptop, Pencil, Plus, Printer, QrCode, Radio, Router, Save, Smartphone, Trash2, Upload, Wifi, Wrench, X } from 'lucide-react';
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

function cleanDeviceFormForType(form: DeviceForm): DeviceForm {
  if (form.type !== 'Cell Phone') {
    return form;
  }

  return {
    ...form,
    radioId: '',
    hostname: '',
    routerId: '',
  };
}

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

function isMobileViewport() {
  return window.innerWidth < 768;
}

function getInitialDeviceModalPosition() {
  const width = Math.min(window.innerWidth - 16, 1152);
  return {
    x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(8, Math.round(window.innerHeight * 0.04)),
  };
}

function DeviceManagementPage({ currentUser }: { currentUser: AuthAccount | null }) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<AuthAccount[]>([]);
  const [form, setForm] = useState<DeviceForm>(defaultDeviceForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeviceFormOpen, setIsDeviceFormOpen] = useState(false);
  const [filter, setFilter] = useState<DeviceType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'All'>('All');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [detailDevice, setDetailDevice] = useState<DeviceRecord | null>(null);
  const [devicePendingDelete, setDevicePendingDelete] = useState<DeviceRecord | null>(null);
  const [deviceHistory, setDeviceHistory] = useState<DeviceEvent[]>([]);
  const [eventNotes, setEventNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceModalPosition, setDeviceModalPosition] = useState(getInitialDeviceModalPosition);
  const [isDeviceModalDragging, setIsDeviceModalDragging] = useState(false);
  const [isMobileDeviceModal, setIsMobileDeviceModal] = useState(() => isMobileViewport());
  const deviceModalRef = useRef<HTMLDivElement | null>(null);
  const deviceModalDragOffsetRef = useRef({ x: 0, y: 0 });

  const canManageDevices = currentUser?.role === 'administrator';
  const actor = { actorId: currentUser?.id, actorName: currentUser?.displayName || currentUser?.email };

  useEffect(() => {
    loadDevices(true);
    loadRegisteredUsers();
    const handleDeviceUpdate = () => {
      loadDevices(false);
    };

    window.addEventListener('shield:device-updated', handleDeviceUpdate);
    return () => window.removeEventListener('shield:device-updated', handleDeviceUpdate);
  }, []);

  useEffect(() => {
    const handleUserUpdate = () => {
      void loadRegisteredUsers();
    };

    window.addEventListener('shield:user-updated', handleUserUpdate);
    window.addEventListener('shield:permission-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleUserUpdate);
      window.removeEventListener('shield:permission-updated', handleUserUpdate);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!detailDevice) {
      return;
    }

    const handleDeviceDetailUpdate = () => {
      void loadDeviceHistory(detailDevice);
    };

    window.addEventListener('shield:device-updated', handleDeviceDetailUpdate);
    return () => window.removeEventListener('shield:device-updated', handleDeviceDetailUpdate);
  }, [detailDevice?.id]);

  useEffect(() => {
    const syncDeviceModalLayout = () => {
      const nextIsMobile = isMobileViewport();
      setIsMobileDeviceModal(nextIsMobile);
      if (nextIsMobile) {
        setIsDeviceModalDragging(false);
      }
    };

    syncDeviceModalLayout();
    window.addEventListener('resize', syncDeviceModalLayout);
    return () => window.removeEventListener('resize', syncDeviceModalLayout);
  }, []);

  useEffect(() => {
    if (!isDeviceModalDragging || isMobileDeviceModal) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = deviceModalRef.current?.offsetWidth || Math.min(window.innerWidth - 16, 1152);
      const height = deviceModalRef.current?.offsetHeight || Math.min(window.innerHeight - 16, 760);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);

      setDeviceModalPosition({
        x: Math.min(Math.max(8, event.clientX - deviceModalDragOffsetRef.current.x), maxX),
        y: Math.min(Math.max(8, event.clientY - deviceModalDragOffsetRef.current.y), maxY),
      });
    };

    const stopDragging = () => setIsDeviceModalDragging(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isDeviceModalDragging, isMobileDeviceModal]);

  useEffect(() => {
    const keepDeviceModalInView = () => {
      if (isMobileViewport()) {
        return;
      }

      const width = deviceModalRef.current?.offsetWidth || Math.min(window.innerWidth - 16, 1152);
      const height = deviceModalRef.current?.offsetHeight || Math.min(window.innerHeight - 16, 760);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      setDeviceModalPosition((current) => ({
        x: Math.min(Math.max(8, current.x), maxX),
        y: Math.min(Math.max(8, current.y), maxY),
      }));
    };

    window.addEventListener('resize', keepDeviceModalInView);
    return () => window.removeEventListener('resize', keepDeviceModalInView);
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

  const loadDevices = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
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
          ...cleanDeviceFormForType(form),
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
          ...cleanDeviceFormForType(form),
          ...actor,
          eventNotes: eventNotes || 'Device added to inventory.',
        });
        setDevices((currentDevices) => [response.data, ...currentDevices]);
      }

      setForm(defaultDeviceForm);
      setEventNotes('');
      setIsDeviceFormOpen(false);
    } catch (err) {
      console.error('Failed to save device:', err);
      setError('Failed to save device. Check for duplicate asset tags and try again.');
    }
  };

  const editDevice = (device: DeviceRecord) => {
    setEditingId(device.id);
    setForm(toDeviceForm(device));
    setEventNotes('');
    setDeviceModalPosition(getInitialDeviceModalPosition());
    setIsDeviceFormOpen(true);
  };

  const openAddDeviceModal = () => {
    setEditingId(null);
    setForm(defaultDeviceForm);
    setEventNotes('');
    setDeviceModalPosition(getInitialDeviceModalPosition());
    setIsDeviceFormOpen(true);
  };

  const closeDeviceFormModal = () => {
    setIsDeviceFormOpen(false);
    setEditingId(null);
    setForm(defaultDeviceForm);
    setEventNotes('');
    setIsDeviceModalDragging(false);
  };

  const startDraggingDeviceModal = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isMobileDeviceModal) {
      return;
    }

    if ((event.target as HTMLElement).closest('button,a,input,select,textarea,label')) {
      return;
    }

    const rect = deviceModalRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    deviceModalDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDeviceModalDragging(true);
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

  const deleteDevice = async (device: DeviceRecord) => {
    if (!canManageDevices) return;

    const label = device.assetTag || 'this device';

    try {
      await deviceService.delete(device.id, { ...actor, eventNotes: `Deleted ${label}.` });
      setDevices((currentDevices) => currentDevices.filter((currentDevice) => currentDevice.id !== device.id));
      setSelectedDevices((ids) => ids.filter((id) => id !== device.id));
      setDevicePendingDelete(null);

      if (editingId === device.id) {
        setEditingId(null);
        setIsDeviceFormOpen(false);
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
      'iccid',
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
    const rows = filteredDevices.map((device) =>
      headers.map((header) => escapeCsv(header === 'iccid' ? device.simNumber : device[header as keyof DeviceRecord])).join(','),
    );
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
            const normalizedHeader = header === 'iccid' ? 'simNumber' : header;
            if (normalizedHeader in nextForm) {
              (nextForm as Record<string, string>)[normalizedHeader] = values[index] || '';
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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 lg:pr-56">
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
          {canManageDevices && (
            <button type="button" onClick={openAddDeviceModal} className="btn-primary" title="Add Device" aria-label="Add Device">
              <Plus size={16} />
            </button>
          )}
          <button type="button" onClick={exportCsv} className="btn-secondary" title="Export CSV" aria-label="Export CSV">
            <Download size={16} />
          </button>
          {canManageDevices && (
            <label className="btn-secondary cursor-pointer" title="Import CSV" aria-label="Import CSV">
              <Upload size={16} />
              <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
            </label>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading device inventory...</div>}

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
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

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2>Inventory</h2>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-4">
            <select value={filter} onChange={(event) => setFilter(event.target.value as DeviceType | 'All')} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              {deviceTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DeviceStatus | 'All')} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              {deviceStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option value="assetTag">Asset Tag</option>
              <option value="type">Type</option>
              <option value="status">Status</option>
              <option value="assignedTo">Assigned To</option>
              <option value="maintenanceDueDate">Maintenance Due</option>
              <option value="replacementDueDate">Replacement Due</option>
            </select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory" className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
          </div>
        </div>

        {selectedDevices.length > 0 && canManageDevices && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-gray-50 p-3 dark:bg-gray-950">
            <span className="text-sm font-bold">{selectedDevices.length} selected</span>
            <button type="button" onClick={() => bulkStatusUpdate('Maintenance')} className="btn-secondary" aria-label="Move selected to maintenance" title="Maintenance"><Wrench size={16} /></button>
            <button type="button" onClick={() => bulkStatusUpdate('Retired')} className="btn-secondary" aria-label="Retire selected devices" title="Retire"><Ban size={16} /></button>
            <button type="button" onClick={() => setSelectedDevices([])} className="btn-secondary" aria-label="Clear selected devices" title="Clear"><X size={16} /></button>
          </div>
        )}

        {filteredDevices.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No devices match this view.</div>
        ) : (
          <>
          <div className="space-y-3 lg:hidden">
            {filteredDevices.map((device) => {
              const DeviceIcon = deviceIconMap[device.type];
              return (
                <article key={device.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                        <DeviceIcon size={18} className="shrink-0 text-accent" />
                        <span className="truncate">{device.assetTag}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{device.type} - {device.makeModel}</p>
                    </div>
                    <StatusBadge status={device.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Detail label="Assigned" value={device.assignedTo || 'Unassigned'} />
                    <Detail label="Condition" value={device.condition || 'Good'} />
                    <Detail label="Maintenance" value={formatDate(device.maintenanceDueDate)} />
                    <Detail label="Replacement" value={formatDate(device.replacementDueDate)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => loadDeviceHistory(device)} className="btn-secondary" aria-label="View device" title="View"><Eye size={15} /></button>
                    {canManageDevices && <button type="button" onClick={() => editDevice(device)} className="btn-secondary" aria-label="Edit device" title="Edit"><Pencil size={15} /></button>}
                    {canManageDevices && <button type="button" onClick={() => setDevicePendingDelete(device)} className="btn-danger" aria-label="Delete device" title="Delete"><Trash2 size={15} /></button>}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto lg:block">
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
                          {canManageDevices && <button type="button" onClick={() => setDevicePendingDelete(device)} className="btn-danger" aria-label="Delete device" title="Delete"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {canManageDevices && isDeviceFormOpen && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            ref={deviceModalRef}
            className={`pointer-events-auto modal-window fixed inset-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white p-4 shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[82dvh] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(520px,calc(100dvh-1rem))] md:w-[min(1152px,calc(100vw-1rem))] md:min-w-[min(520px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg sm:p-6 ${isDeviceModalDragging ? 'md:cursor-grabbing' : ''}`}
            style={isMobileDeviceModal ? undefined : { left: deviceModalPosition.x, top: deviceModalPosition.y }}
          >
            <div
              onPointerDown={startDraggingDeviceModal}
              className={`mb-5 flex select-none items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800 md:touch-none md:cursor-grab ${isDeviceModalDragging ? 'md:cursor-grabbing' : ''}`}
            >
              <div>
                <h2>{editingId ? 'Edit Device' : 'Add Device'}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Track assignment, identifiers, lifecycle dates, and device condition.
                  <span className="hidden md:inline"> Drag to move. Resize from the corner.</span>
                </p>
              </div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={closeDeviceFormModal}
                className="icon-close-button"
                aria-label="Close device form"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveDevice} className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Device Type">
                  <select
                    value={form.type}
                    onChange={(event) => {
                      const nextType = event.target.value as DeviceType;
                      setForm((current) => cleanDeviceFormForType({ ...current, type: nextType }));
                    }}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  >
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
                <TextField label="ICCID" value={form.simNumber} onChange={(value) => setForm((current) => ({ ...current, simNumber: value }))} />
                {form.type !== 'Cell Phone' && (
                  <>
                    <TextField label="Radio ID" value={form.radioId} onChange={(value) => setForm((current) => ({ ...current, radioId: value }))} />
                    <TextField label="Hostname" value={form.hostname} onChange={(value) => setForm((current) => ({ ...current, hostname: value }))} />
                    <TextField label="Router ID" value={form.routerId} onChange={(value) => setForm((current) => ({ ...current, routerId: value }))} />
                  </>
                )}
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
                  <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
                <button type="button" onClick={closeDeviceFormModal} className="btn-secondary" aria-label="Cancel device form" title="Cancel">
                  <X size={16} />
                </button>
                <button type="submit" className="btn-primary" aria-label={editingId ? 'Save device' : 'Add device'} title={editingId ? 'Save Device' : 'Add Device'}>
                  {editingId ? <Save size={16} /> : <Plus size={16} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailDevice && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="modal-window max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div>
                <h2>{detailDevice.assetTag}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detailDevice.type} - {detailDevice.makeModel}</p>
              </div>
              <button type="button" onClick={() => setDetailDevice(null)} className="icon-close-button" aria-label="Close device details" title="Close"><X size={20} /></button>
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
                  <Detail label="ICCID" value={detailDevice.simNumber || 'N/A'} />
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
                      <button type="button" onClick={() => window.print()} className="btn-secondary mt-3" aria-label="Print label" title="Print Label"><Printer size={16} /></button>
                    </div>
                  </div>
                </div>
                {canManageDevices && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Available', 'Checked In')} className="btn-secondary" aria-label="Check in device" title="Check In"><CheckCircle2 size={16} /></button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Maintenance', 'Maintenance')} className="btn-secondary" aria-label="Move device to maintenance" title="Maintenance"><Wrench size={16} /></button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Damaged', 'Marked Damaged')} className="btn-secondary" aria-label="Mark device damaged" title="Damaged"><AlertTriangle size={16} /></button>
                    <button type="button" onClick={() => updateDeviceStatus(detailDevice, 'Lost', 'Marked Lost')} className="btn-danger" aria-label="Mark device lost" title="Lost"><Ban size={16} /></button>
                  </div>
                )}
              </div>

              <aside>
                <h3 className="mb-3 text-lg font-bold">History</h3>
                {canManageDevices && (
                  <div className="mb-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <textarea value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} placeholder="Add a note or reason" className="mb-2 min-h-20 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                    <button type="button" onClick={addHistoryNote} className="btn-primary" aria-label="Add history note" title="Add Note"><FileText size={16} /></button>
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

      {devicePendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/45">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Device</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete {devicePendingDelete.assetTag || 'this device'}? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDevicePendingDelete(null)} className="btn-secondary" aria-label="Cancel device deletion" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" onClick={() => deleteDevice(devicePendingDelete)} className="btn-danger" aria-label="Delete device" title="Delete">
                <Trash2 size={16} />
              </button>
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
