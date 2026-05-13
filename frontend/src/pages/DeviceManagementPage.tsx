import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Laptop, Radio, Router, Smartphone } from 'lucide-react';

type DeviceType = 'Cell Phone' | 'MiFi Device' | 'Computer' | 'Radio';
type DeviceStatus = 'Available' | 'Assigned' | 'Maintenance' | 'Retired';

type DeviceRecord = {
  id: string;
  type: DeviceType;
  assetTag: string;
  makeModel: string;
  serialNumber: string;
  assignedTo: string;
  status: DeviceStatus;
  location: string;
  notes: string;
  updatedAt: string;
};

type DeviceForm = Omit<DeviceRecord, 'id' | 'updatedAt'>;

const deviceStorageKey = 'shield_device_inventory';

const deviceTypes: DeviceType[] = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio'];
const deviceStatuses: DeviceStatus[] = ['Available', 'Assigned', 'Maintenance', 'Retired'];

const defaultDeviceForm: DeviceForm = {
  type: 'Cell Phone',
  assetTag: '',
  makeModel: '',
  serialNumber: '',
  assignedTo: '',
  status: 'Available',
  location: '',
  notes: '',
};

const deviceIconMap = {
  'Cell Phone': Smartphone,
  'MiFi Device': Router,
  Computer: Laptop,
  Radio,
};

function DeviceManagementPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [form, setForm] = useState<DeviceForm>(defaultDeviceForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeviceType | 'All'>('All');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedDevices = window.localStorage.getItem(deviceStorageKey);

    if (!savedDevices) {
      setDevicesLoaded(true);
      return;
    }

    try {
      const parsedDevices = JSON.parse(savedDevices) as DeviceRecord[];
      setDevices(Array.isArray(parsedDevices) ? parsedDevices : []);
    } catch (err) {
      console.error('Failed to load device inventory:', err);
    } finally {
      setDevicesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!devicesLoaded) {
      return;
    }

    window.localStorage.setItem(deviceStorageKey, JSON.stringify(devices));
  }, [devices, devicesLoaded]);

  const filteredDevices = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    return devices.filter((device) => {
      const matchesType = filter === 'All' || device.type === filter;
      const searchableText = [
        device.assetTag,
        device.makeModel,
        device.serialNumber,
        device.assignedTo,
        device.status,
        device.location,
      ]
        .join(' ')
        .toLowerCase();

      return matchesType && (!searchTerm || searchableText.includes(searchTerm));
    });
  }, [devices, filter, query]);

  const statusCounts = useMemo(
    () =>
      deviceStatuses.map((status) => ({
        status,
        count: devices.filter((device) => device.status === status).length,
      })),
    [devices],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.assetTag.trim() || !form.makeModel.trim()) {
      setError('Enter an asset tag and make/model before saving.');
      return;
    }

    setError(null);

    if (editingId) {
      setDevices((currentDevices) =>
        currentDevices.map((device) =>
          device.id === editingId
            ? { ...device, ...form, updatedAt: new Date().toISOString() }
            : device,
        ),
      );
      setEditingId(null);
    } else {
      setDevices((currentDevices) => [
        {
          ...form,
          id: `${form.type}-${Date.now()}`,
          updatedAt: new Date().toISOString(),
        },
        ...currentDevices,
      ]);
    }

    setForm(defaultDeviceForm);
  };

  const editDevice = (device: DeviceRecord) => {
    setEditingId(device.id);
    setForm({
      type: device.type,
      assetTag: device.assetTag,
      makeModel: device.makeModel,
      serialNumber: device.serialNumber,
      assignedTo: device.assignedTo,
      status: device.status,
      location: device.location,
      notes: device.notes,
    });
  };

  const deleteDevice = (deviceId: string) => {
    setDevices((currentDevices) => currentDevices.filter((device) => device.id !== deviceId));

    if (editingId === deviceId) {
      setEditingId(null);
      setForm(defaultDeviceForm);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Device Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track cell phones, MiFi devices, computers, and radios in one inventory.
          </p>
        </div>
        <div className="rounded bg-accent/10 px-4 py-2 text-sm font-bold text-accent">
          {devices.length} total devices
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        {statusCounts.map((item) => (
          <div key={item.status} className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{item.status}</p>
            <p className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">{item.count}</p>
          </div>
        ))}
      </div>

      <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h2 className="mb-5">{editingId ? 'Edit Device' : 'Add Device'}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Device Type</span>
            <select
              value={form.type}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, type: event.target.value as DeviceType }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            >
              {deviceTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Asset Tag</span>
            <input
              value={form.assetTag}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, assetTag: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Make / Model</span>
            <input
              value={form.makeModel}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, makeModel: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Serial Number</span>
            <input
              value={form.serialNumber}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, serialNumber: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Assigned To</span>
            <input
              value={form.assignedTo}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, assignedTo: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, status: event.target.value as DeviceStatus }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            >
              {deviceStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Location</span>
            <input
              value={form.location}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, location: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="block lg:col-span-4">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, notes: event.target.value }))}
              className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <div className="flex flex-wrap gap-3 lg:col-span-4">
            <button type="submit" className="btn-primary">
              {editingId ? 'Save Device' : 'Add Device'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(defaultDeviceForm);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2>Inventory</h2>
          <div className="flex flex-wrap gap-3">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as DeviceType | 'All')}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option>All</option>
              {deviceTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory"
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
        </div>

        {filteredDevices.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">
            No devices match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Asset Tag</th>
                  <th className="px-3 py-3">Make / Model</th>
                  <th className="px-3 py-3">Serial</th>
                  <th className="px-3 py-3">Assigned To</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const DeviceIcon = deviceIconMap[device.type];

                  return (
                    <tr key={device.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
                          <DeviceIcon size={18} className="text-accent" />
                          {device.type}
                        </div>
                      </td>
                      <td className="px-3 py-4 font-semibold">{device.assetTag}</td>
                      <td className="px-3 py-4">{device.makeModel}</td>
                      <td className="px-3 py-4">{device.serialNumber || 'N/A'}</td>
                      <td className="px-3 py-4">{device.assignedTo || 'Unassigned'}</td>
                      <td className="px-3 py-4">
                        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                          {device.status}
                        </span>
                      </td>
                      <td className="px-3 py-4">{device.location || 'N/A'}</td>
                      <td className="px-3 py-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => editDevice(device)} className="btn-secondary">
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteDevice(device.id)} className="btn-danger">
                            Delete
                          </button>
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
    </div>
  );
}

export default DeviceManagementPage;
