import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Laptop, Radio, Router, Smartphone, Wifi } from 'lucide-react';
import { authService, AuthAccount, deviceService, DeviceRecord } from '../services/api';

type DeviceType = 'Cell Phone' | 'MiFi Device' | 'Computer' | 'Radio' | 'Cradlepoint';
type DeviceStatus = 'Available' | 'Assigned' | 'Maintenance' | 'Retired';

type DeviceForm = Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>;

const deviceTypes: DeviceType[] = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio', 'Cradlepoint'];
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
  Cradlepoint: Wifi,
};

function DeviceManagementPage({ currentUser }: { currentUser: AuthAccount | null }) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<AuthAccount[]>([]);
  const [form, setForm] = useState<DeviceForm>(defaultDeviceForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeviceType | 'All'>('All');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.assetTag.trim() || !form.makeModel.trim()) {
      setError('Enter an asset tag and make/model before saving.');
      return;
    }

    setError(null);

    try {
      if (editingId) {
        const response = await deviceService.update(editingId, form);
        setDevices((currentDevices) =>
          currentDevices.map((device) => (device.id === editingId ? response.data : device)),
        );
        setEditingId(null);
      } else {
        const response = await deviceService.create(form);
        setDevices((currentDevices) => [response.data, ...currentDevices]);
      }

      setForm(defaultDeviceForm);
    } catch (err) {
      console.error('Failed to save device:', err);
      setError('Failed to save device. Check for duplicate asset tags and try again.');
    }
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

  const deleteDevice = async (deviceId: string) => {
    const device = devices.find((item) => item.id === deviceId);
    const label = device?.assetTag || 'this device';

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    try {
      await deviceService.delete(deviceId);
      setDevices((currentDevices) => currentDevices.filter((device) => device.id !== deviceId));

      if (editingId === deviceId) {
        setEditingId(null);
        setForm(defaultDeviceForm);
      }
    } catch (err) {
      console.error('Failed to delete device:', err);
      setError('Failed to delete device.');
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Device Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track cell phones, MiFi devices, computers, and radios in the shared database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded bg-accent/10 px-4 py-2 text-sm font-bold text-accent">
            {devices.length} total devices
          </div>
          <button type="button" onClick={loadDevices} className="btn-secondary">
            Refresh Devices
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading device inventory...</div>}

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
            <select
              value={form.assignedTo}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, assignedTo: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">Unassigned</option>
              {registeredUsers.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.displayName} ({user.email})
                </option>
              ))}
            </select>
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
