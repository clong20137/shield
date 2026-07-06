import { ChangeEvent, FormEvent, MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IScannerControls } from '@zxing/browser';
import { AlertTriangle, ArchiveX, Camera, CheckCircle2, ChevronDown, ChevronRight, Download, Laptop, MapPinOff, PackageCheck, Pencil, Plus, QrCode, Radio, RefreshCw, Router, Save, Smartphone, Trash2, Upload, UserCheck, Wifi, Wrench, X } from 'lucide-react';
import { authService, AuthAccount, deviceService, DeviceRecord } from '../services/api';
import { FloatingWindow } from '../components/FloatingWindow';
import { AppContextMenu, AppContextMenuPosition, shouldUseNativeContextMenu } from '../components/AppContextMenu';

type DeviceType = DeviceRecord['type'];
type DeviceStatus = DeviceRecord['status'];
type DeviceCarrier = DeviceRecord['carrier'];
type DeviceStatusFilter = DeviceStatus | 'All' | 'Unassigned';
type DeviceForm = Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>;
type DeviceConditionalField = 'phoneNumber' | 'imei' | 'simNumber' | 'radioId' | 'hostname' | 'routerId';
type SortKey = keyof Pick<DeviceRecord, 'type' | 'assetTag' | 'makeModel' | 'assignedTo' | 'status' | 'carrier' | 'location' | 'maintenanceDueDate' | 'replacementDueDate' | 'updatedAt'>;
type ScanMode = 'lookup' | 'check-in' | 'check-out';
type PhoneImportSummary = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  skippedCount: number;
};
type PhoneImportProgress = {
  processedRows: number;
  totalRows: number;
  currentBatch: number;
  totalBatches: number;
};

const deviceTypes: DeviceType[] = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio', 'Cradlepoint'];
const deviceStatuses: DeviceStatus[] = ['Available', 'Assigned', 'Maintenance', 'Damaged', 'Lost', 'Retired'];
const deviceCarriers: DeviceCarrier[] = ['Verizon', 'AT&T'];
const deviceConditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const DEVICE_TABLE_ROW_HEIGHT = 64;
const DEVICE_TABLE_OVERSCAN = 8;
const DEVICE_TABLE_MAX_HEIGHT = 620;
const PHONE_IMPORT_BATCH_SIZE = 100;

const defaultDeviceForm: DeviceForm = {
  type: 'Cell Phone',
  assetTag: '',
  makeModel: '',
  serialNumber: '',
  assignedTo: '',
  status: 'Available',
  carrier: 'Verizon',
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

const deviceStatusMeta: Record<DeviceStatus, { icon: typeof CheckCircle2; tone: string; cardTone: string }> = {
  Available: {
    icon: PackageCheck,
    tone: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200',
    cardTone: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-200',
  },
  Assigned: {
    icon: UserCheck,
    tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    cardTone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
  },
  Maintenance: {
    icon: Wrench,
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200',
    cardTone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  },
  Damaged: {
    icon: AlertTriangle,
    tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
    cardTone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200',
  },
  Lost: {
    icon: MapPinOff,
    tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
    cardTone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200',
  },
  Retired: {
    icon: ArchiveX,
    tone: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    cardTone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  },
};

function cleanDeviceFormForType(form: DeviceForm): DeviceForm {
  const cleanedForm = { ...form };

  if (form.type === 'Computer') {
    cleanedForm.phoneNumber = '';
    cleanedForm.imei = '';
    cleanedForm.simNumber = '';
    cleanedForm.radioId = '';
  }

  if (form.type === 'Radio') {
    cleanedForm.phoneNumber = '';
    cleanedForm.imei = '';
    cleanedForm.hostname = '';
    cleanedForm.routerId = '';
  }

  if (form.type === 'Cell Phone') {
    cleanedForm.radioId = '';
    cleanedForm.hostname = '';
    cleanedForm.routerId = '';
  }

  return cleanedForm;
}

function shouldShowDeviceField(type: DeviceType, field: DeviceConditionalField): boolean {
  const hiddenFieldsByType: Record<DeviceType, DeviceConditionalField[]> = {
    'Cell Phone': ['radioId', 'hostname', 'routerId'],
    'MiFi Device': ['radioId'],
    Computer: ['phoneNumber', 'imei', 'simNumber', 'radioId'],
    Radio: ['phoneNumber', 'imei', 'hostname', 'routerId'],
    Cradlepoint: ['phoneNumber', 'imei', 'simNumber', 'radioId'],
  };

  return !hiddenFieldsByType[type].includes(field);
}

function toDeviceForm(device: DeviceRecord): DeviceForm {
  return {
    type: device.type,
    assetTag: device.assetTag,
    makeModel: device.makeModel,
    serialNumber: device.serialNumber || '',
    assignedTo: device.assignedTo || '',
    status: device.status,
    carrier: device.carrier || 'Verizon',
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

function parseCsvRows(text: string): Record<string, string>[] {
  const [headerLine, ...lines] = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (!headerLine) {
    return [];
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
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

function isPastDue(value: string): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function getDeviceHealthChips(device: DeviceRecord): Array<{ label: string; tone: string }> {
  const chips: Array<{ label: string; tone: string }> = [];

  if (!device.assignedTo && device.status === 'Assigned') {
    chips.push({ label: 'Missing assignee', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' });
  }

  if (isPastDue(device.maintenanceDueDate)) {
    chips.push({ label: 'Maintenance overdue', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' });
  } else if (isDueSoon(device.maintenanceDueDate)) {
    chips.push({ label: 'Maintenance soon', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' });
  }

  if (isPastDue(device.warrantyExpiration)) {
    chips.push({ label: 'Warranty expired', tone: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200' });
  } else if (isDueSoon(device.warrantyExpiration)) {
    chips.push({ label: 'Warranty soon', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' });
  }

  if (isPastDue(device.replacementDueDate)) {
    chips.push({ label: 'Replace overdue', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' });
  }

  if (chips.length === 0) {
    chips.push({ label: 'Healthy', tone: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200' });
  }

  return chips;
}

function getDeviceDisplayName(device: DeviceRecord): string {
  if (device.type === 'Cell Phone' || device.type === 'Cradlepoint') {
    return device.makeModel || device.type;
  }

  return device.assetTag || device.makeModel || device.type;
}

function getDeviceDisplayMeta(device: DeviceRecord): string {
  const details: string[] = [device.type];

  if ((device.type === 'Cell Phone' || device.type === 'Cradlepoint') && device.phoneNumber) {
    details.push(device.phoneNumber);
  } else if (device.makeModel && device.makeModel !== getDeviceDisplayName(device)) {
    details.push(device.makeModel);
  }

  return details.join(' - ');
}

function normalizeScanValue(value: string): string {
  return value
    .trim()
    .replace(/^shield-device:/iu, '')
    .replace(/^asset:/iu, '')
    .toLowerCase();
}

function deviceMatchesScan(device: DeviceRecord, scanValue: string): boolean {
  const normalizedScan = normalizeScanValue(scanValue);
  if (!normalizedScan) return false;

  return [
    device.assetTag,
    device.serialNumber,
    device.imei,
    device.simNumber,
    device.radioId,
    device.hostname,
    device.routerId,
    device.phoneNumber,
  ].some((value) => normalizeScanValue(value || '') === normalizedScan);
}

function getInitialDeviceModalPosition() {
  const width = Math.min(window.innerWidth - 16, 1152);
  return {
    x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(8, Math.round(window.innerHeight * 0.04)),
  };
}

function normalizeDeviceListResponse(
  responseData: DeviceRecord[] | { data?: DeviceRecord[]; total?: number; totalPages?: number; page?: number },
  fallbackPage: number,
) {
  if (Array.isArray(responseData)) {
    return {
      data: responseData,
      page: fallbackPage,
      total: responseData.length,
      totalPages: Math.max(1, Math.ceil(responseData.length / Math.max(1, responseData.length))),
    };
  }

  const data = Array.isArray(responseData.data) ? responseData.data : [];
  return {
    data,
    page: typeof responseData.page === 'number' ? responseData.page : fallbackPage,
    total: typeof responseData.total === 'number' ? responseData.total : data.length,
    totalPages: typeof responseData.totalPages === 'number' ? responseData.totalPages : 1,
  };
}

function DeviceManagementPage({ currentUser }: { currentUser: AuthAccount | null }) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<AuthAccount[]>([]);
  const [form, setForm] = useState<DeviceForm>(defaultDeviceForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeviceFormOpen, setIsDeviceFormOpen] = useState(false);
  const [filter, setFilter] = useState<DeviceType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>('All');
  const [modelFilter, setModelFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalDevices, setTotalDevices] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deviceTypeStatusCounts, setDeviceTypeStatusCounts] = useState<Record<string, Record<string, number>>>({});
  const [deviceModelCounts, setDeviceModelCounts] = useState<Record<string, number>>({});
  const [collapsedInventoryTypes, setCollapsedInventoryTypes] = useState<Record<string, boolean>>({});
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [pageContextMenu, setPageContextMenu] = useState<AppContextMenuPosition | null>(null);
  const [devicePendingDelete, setDevicePendingDelete] = useState<DeviceRecord | null>(null);
  const [isDeletePhonesConfirmOpen, setIsDeletePhonesConfirmOpen] = useState(false);
  const [eventNotes, setEventNotes] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [scanValue, setScanValue] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('lookup');
  const [scanAssignee, setScanAssignee] = useState('');
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isCameraScanActive, setIsCameraScanActive] = useState(false);
  const [cameraScanStatus, setCameraScanStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [phoneImportSummary, setPhoneImportSummary] = useState<PhoneImportSummary | null>(null);
  const [phoneImportProgress, setPhoneImportProgress] = useState<PhoneImportProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [deviceTableScrollTop, setDeviceTableScrollTop] = useState(0);
  const deviceLoadSequenceRef = useRef(0);
  const isUserLoadInFlightRef = useRef(false);
  const hasLoadedRegisteredUsersRef = useRef(false);
  const deviceRefreshTimerRef = useRef<number | null>(null);
  const userRefreshTimerRef = useRef<number | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const canManageDevices = currentUser?.role === 'administrator';
  const actor = { actorId: currentUser?.id, actorName: currentUser?.displayName || currentUser?.email };

  const loadRegisteredUsers = useCallback(async () => {
    if (!currentUser || !canManageDevices || isUserLoadInFlightRef.current) {
      if (!currentUser || !canManageDevices) {
        setRegisteredUsers([]);
        hasLoadedRegisteredUsersRef.current = false;
      }
      return;
    }

    isUserLoadInFlightRef.current = true;
    try {
      const response = await authService.getAccounts(currentUser.id);
      setRegisteredUsers(response.data);
      hasLoadedRegisteredUsersRef.current = true;
    } catch (err) {
      console.error('Failed to load registered users:', err);
      setRegisteredUsers([]);
    } finally {
      isUserLoadInFlightRef.current = false;
    }
  }, [canManageDevices, currentUser?.id]);

  const loadDevices = useCallback(async (showLoading = true) => {
    if (!currentUser) {
      setDevices([]);
      setTotalDevices(0);
      setTotalPages(1);
      setDeviceTypeStatusCounts({});
      setDeviceModelCounts({});
      setLoading(false);
      return;
    }

    if (!canManageDevices) {
      setDevices([]);
      setTotalDevices(0);
      setTotalPages(1);
      setDeviceTypeStatusCounts({});
      setDeviceModelCounts({});
      setLoading(false);
      setError('You do not have permission to manage devices.');
      return;
    }

    const loadSequence = deviceLoadSequenceRef.current + 1;
    deviceLoadSequenceRef.current = loadSequence;
    if (showLoading) {
      setLoading(true);
    } else {
      setIsFiltering(true);
    }
    setError(null);
    try {
      const response = await deviceService.getAll({
        q: query.trim() || undefined,
        type: filter === 'All' ? undefined : filter,
        model: modelFilter === 'All' ? undefined : modelFilter,
        status: statusFilter === 'All' ? undefined : statusFilter,
        sortKey,
        page,
        pageSize,
      });
      const normalizedResponse = normalizeDeviceListResponse(response.data, page);
      if (loadSequence !== deviceLoadSequenceRef.current) {
        return;
      }
      setDevices(normalizedResponse.data);
      setTotalDevices(normalizedResponse.total);
      setTotalPages(normalizedResponse.totalPages);
      setDeviceTypeStatusCounts(response.data.typeStatusCounts || {});
      setDeviceModelCounts(response.data.modelCounts || {});
      if (normalizedResponse.page !== page) {
        setPage(normalizedResponse.page);
      }
    } catch (err) {
      if (loadSequence !== deviceLoadSequenceRef.current) {
        return;
      }
      console.error('Failed to load device inventory:', err);
      setError('Failed to load device inventory. Check that the backend is running.');
    } finally {
      if (loadSequence === deviceLoadSequenceRef.current) {
        setLoading(false);
        setIsFiltering(false);
      }
    }
  }, [canManageDevices, currentUser?.id, filter, modelFilter, page, pageSize, query, sortKey, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDevices(devices.length === 0);
    }, query.trim() ? 220 : 0);

    const handleDeviceUpdate = () => {
      if (deviceRefreshTimerRef.current) {
        window.clearTimeout(deviceRefreshTimerRef.current);
      }

      deviceRefreshTimerRef.current = window.setTimeout(() => {
        void loadDevices(false);
      }, 350);
    };

    window.addEventListener('shield:device-updated', handleDeviceUpdate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('shield:device-updated', handleDeviceUpdate);
      if (deviceRefreshTimerRef.current) {
        window.clearTimeout(deviceRefreshTimerRef.current);
      }
    };
  }, [loadDevices]);

  useEffect(() => {
    const handleUserUpdate = () => {
      if (!hasLoadedRegisteredUsersRef.current) {
        return;
      }

      if (userRefreshTimerRef.current) {
        window.clearTimeout(userRefreshTimerRef.current);
      }

      userRefreshTimerRef.current = window.setTimeout(() => {
        userRefreshTimerRef.current = null;
        void loadRegisteredUsers();
      }, 350);
    };

    window.addEventListener('shield:user-updated', handleUserUpdate);
    window.addEventListener('shield:permission-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleUserUpdate);
      window.removeEventListener('shield:permission-updated', handleUserUpdate);
      if (userRefreshTimerRef.current) {
        window.clearTimeout(userRefreshTimerRef.current);
      }
    };
  }, [loadRegisteredUsers]);

  const stopCameraScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
    setIsCameraScanActive(false);
  }, []);

  useEffect(() => stopCameraScanner, [stopCameraScanner]);

  const closeCameraScanner = () => {
    stopCameraScanner();
    setIsCameraScannerOpen(false);
  };

  const startCameraScanner = async () => {
    setIsCameraScannerOpen(true);
    setCameraScanStatus('Starting camera...');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraScanStatus('Camera scanning needs HTTPS and browser camera permission. Open the secure app URL, then try again.');
      return;
    }

    try {
      stopCameraScanner();
      const video = scannerVideoRef.current;
      if (!video) {
        setCameraScanStatus('Camera preview is not ready yet.');
        return;
      }

      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      setIsCameraScanActive(true);
      setCameraScanStatus('Point the camera at a QR code or barcode.');
      scannerControlsRef.current = await reader.decodeFromConstraints({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      }, video, (result, error, controls) => {
        if (error && !result) {
          return;
        }

        const value = result?.getText().trim();
        if (value) {
          controls.stop();
          scannerControlsRef.current = null;
          setIsCameraScanActive(false);
          setScanValue(value);
          setScanFeedback(`Scanned ${value}. Tap Apply to continue.`);
          setCameraScanStatus('Scan captured.');
          setIsCameraScannerOpen(false);
        }
      });
    } catch (err) {
      console.error('Failed to start device scanner:', err);
      setCameraScanStatus('Unable to start the camera. Use HTTPS, allow camera access, and try again.');
      stopCameraScanner();
    }
  };

  const safePage = Math.min(page, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const paginatedDevices = devices;
  const shouldVirtualizeDeviceTable = paginatedDevices.length > 80;
  const deviceTableViewportHeight = shouldVirtualizeDeviceTable
    ? Math.min(DEVICE_TABLE_MAX_HEIGHT, paginatedDevices.length * DEVICE_TABLE_ROW_HEIGHT)
    : undefined;
  const deviceTableStartIndex = shouldVirtualizeDeviceTable
    ? Math.max(0, Math.floor(deviceTableScrollTop / DEVICE_TABLE_ROW_HEIGHT) - DEVICE_TABLE_OVERSCAN)
    : 0;
  const deviceTableVisibleCount = shouldVirtualizeDeviceTable && deviceTableViewportHeight
    ? Math.ceil(deviceTableViewportHeight / DEVICE_TABLE_ROW_HEIGHT) + DEVICE_TABLE_OVERSCAN * 2
    : paginatedDevices.length;
  const visibleTableDevices = shouldVirtualizeDeviceTable
    ? paginatedDevices.slice(deviceTableStartIndex, deviceTableStartIndex + deviceTableVisibleCount)
    : paginatedDevices;
  const deviceTableTopSpacerHeight = shouldVirtualizeDeviceTable ? deviceTableStartIndex * DEVICE_TABLE_ROW_HEIGHT : 0;
  const deviceTableBottomSpacerHeight = shouldVirtualizeDeviceTable
    ? Math.max(0, (paginatedDevices.length - deviceTableStartIndex - visibleTableDevices.length) * DEVICE_TABLE_ROW_HEIGHT)
    : 0;
  const pageStart = totalDevices === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = Math.min(totalDevices, pageStartIndex + devices.length);

  useEffect(() => {
    setDeviceTableScrollTop(0);
  }, [page, pageSize, filter, modelFilter, query, sortKey, statusFilter]);

  const modelOptions = useMemo(
    () => Object.entries(deviceModelCounts).sort(([first], [second]) => first.localeCompare(second)),
    [deviceModelCounts],
  );

  const filteredRegisteredUsers = useMemo(() => {
    const search = assigneeSearch.trim().toLowerCase();
    if (!search) {
      return registeredUsers;
    }

    return registeredUsers.filter((user) =>
      [user.displayName, user.email, user.role, user.district]
        .some((value) => String(value || '').toLowerCase().includes(search)),
    );
  }, [assigneeSearch, registeredUsers]);

  const saveDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageDevices) {
      setError('You do not have permission to manage devices.');
      return;
    }

    if ((form.type !== 'Cell Phone' && !form.assetTag.trim()) || !form.makeModel.trim()) {
      setError(form.type === 'Cell Phone' ? 'Enter a make/model before saving.' : 'Enter an asset tag and make/model before saving.');
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
      setAssigneeSearch('');
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
    setAssigneeSearch('');
    setIsDeviceFormOpen(true);
    if (!hasLoadedRegisteredUsersRef.current) {
      void loadRegisteredUsers();
    }
  };

  const openAddDeviceModal = () => {
    setEditingId(null);
    setForm(defaultDeviceForm);
    setEventNotes('');
    setAssigneeSearch('');
    setIsDeviceFormOpen(true);
    if (!hasLoadedRegisteredUsersRef.current) {
      void loadRegisteredUsers();
    }
  };

  const closeDeviceFormModal = () => {
    setIsDeviceFormOpen(false);
    setEditingId(null);
    setForm(defaultDeviceForm);
    setEventNotes('');
    setAssigneeSearch('');
  };

  useEffect(() => {
    if (scanMode === 'check-out' && !hasLoadedRegisteredUsersRef.current) {
      void loadRegisteredUsers();
    }
  }, [loadRegisteredUsers, scanMode]);

  const updateDeviceStatus = async (
    device: DeviceRecord,
    status: DeviceStatus,
    action: string,
    options: { assignedTo?: string; notes?: string } = {},
  ) => {
    if (!canManageDevices) return;

    try {
      const response = await deviceService.update(device.id, {
        ...toDeviceForm(device),
        status,
        assignedTo: status === 'Available' ? '' : options.assignedTo ?? device.assignedTo,
        lastServiceDate: action === 'Maintenance' ? new Date().toISOString().slice(0, 10) : device.lastServiceDate || '',
        ...actor,
        eventAction: action,
        eventNotes: options.notes || eventNotes || action,
      });
      setDevices((currentDevices) => currentDevices.map((item) => (item.id === device.id ? response.data : item)));
    } catch (err) {
      console.error('Failed to update device status:', err);
      setError('Failed to update device status.');
    }
  };

  const findScannedDevice = async (value: string) => {
    const localMatch = devices.find((device) => deviceMatchesScan(device, value));
    if (localMatch) {
      return localMatch;
    }

    const response = await deviceService.getAll({ q: value, page: 1, pageSize: 5 });
    const normalizedResponse = normalizeDeviceListResponse(response.data, 1);
    return normalizedResponse.data.find((device) => deviceMatchesScan(device, value)) || null;
  };

  const handleScannerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const scannedDevice = await findScannedDevice(scanValue);
    if (!scannedDevice) {
      setScanFeedback('No device matched that scan. Try asset tag, serial, IMEI, ICCID, radio ID, hostname, router ID, or phone number.');
      return;
    }

    setScanFeedback(null);

    if (scanMode === 'lookup') {
      setScanFeedback(`Found ${getDeviceDisplayName(scannedDevice)}: ${getDeviceDisplayMeta(scannedDevice)}.`);
      setScanValue('');
      return;
    }

    if (!canManageDevices) {
      setScanFeedback('You do not have permission to check devices in or out.');
      return;
    }

    if (scanMode === 'check-out' && !scanAssignee.trim()) {
      setScanFeedback('Choose who the device is being checked out to.');
      return;
    }

    const nextStatus = scanMode === 'check-in' ? 'Available' : 'Assigned';
    const action = scanMode === 'check-in' ? 'Scanned In' : 'Scanned Out';
    const assignee = scanMode === 'check-in' ? '' : scanAssignee;

    await updateDeviceStatus(scannedDevice, nextStatus, action, {
      assignedTo: assignee,
      notes: scanMode === 'check-in' ? `Scanned in from ${scanValue}.` : `Scanned out to ${assignee}.`,
    });
    setScanFeedback(`${getDeviceDisplayName(scannedDevice)} ${scanMode === 'check-in' ? 'checked in' : `checked out to ${assignee}`}.`);
    setScanValue('');
  };

  const deleteDevice = async (device: DeviceRecord) => {
    if (!canManageDevices) return;

    const label = getDeviceDisplayName(device) || 'this device';

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

  const deleteAllPhones = async () => {
    if (!canManageDevices) return;

    try {
      setError(null);
      setDeviceNotice(null);
      const response = await deviceService.deletePhones();
      setPhoneImportSummary(null);
      setIsDeletePhonesConfirmOpen(false);
      await loadDevices(false);
      setDeviceNotice(`Deleted ${response.data.deletedCount} phone and Cradlepoint records.`);
    } catch (err) {
      console.error('Failed to delete phone inventory:', err);
      setError('Failed to delete phone inventory.');
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
      'carrier',
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
    const rows = devices.map((device) =>
      headers.map((header) => escapeCsv(header === 'iccid' ? device.simNumber : device[header as keyof DeviceRecord])).join(','),
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shield-device-inventory-page-${safePage}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPhoneInventory = async () => {
    if (!canManageDevices) return;

    try {
      setError(null);
      const response = await deviceService.exportPhones();
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shield-phone-inventory.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export phones:', err);
      setError('Failed to export phone inventory.');
    }
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
          return deviceService.create({ ...cleanDeviceFormForType(nextForm), ...actor, eventNotes: 'Imported from CSV.' });
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

  const importPhoneCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canManageDevices) return;

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      setDeviceNotice(null);
      setPhoneImportSummary(null);
      const rows = parseCsvRows(await file.text());
      if (rows.length === 0) {
        setError('Phone import CSV is empty.');
        return;
      }

      const totalBatches = Math.ceil(rows.length / PHONE_IMPORT_BATCH_SIZE);
      const summary = {
        totalRows: rows.length,
        createdCount: 0,
        updatedCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        skippedCount: 0,
      };
      setPhoneImportProgress({ processedRows: 0, totalRows: rows.length, currentBatch: 0, totalBatches });

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const batchStart = batchIndex * PHONE_IMPORT_BATCH_SIZE;
        const batchRows = rows.slice(batchStart, batchStart + PHONE_IMPORT_BATCH_SIZE);
        setPhoneImportProgress({
          processedRows: batchStart,
          totalRows: rows.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
        const response = await deviceService.importPhones({ rows: batchRows, ...actor });
        summary.createdCount += response.data.createdCount;
        summary.updatedCount += response.data.updatedCount;
        summary.matchedCount += response.data.matchedCount;
        summary.unmatchedCount += response.data.unmatchedRows.length;
        summary.skippedCount += response.data.skippedRows.length;
        setPhoneImportProgress({
          processedRows: Math.min(batchStart + batchRows.length, rows.length),
          totalRows: rows.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      }

      setPhoneImportSummary({
        totalRows: summary.totalRows,
        createdCount: summary.createdCount,
        updatedCount: summary.updatedCount,
        matchedCount: summary.matchedCount,
        unmatchedCount: summary.unmatchedCount,
        skippedCount: summary.skippedCount,
      });
      await loadDevices(false);
    } catch (err) {
      console.error('Failed to import phones:', err);
      setError('Failed to import phone CSV. Check columns, phone numbers, and duplicate asset tags.');
    } finally {
      setPhoneImportProgress(null);
      event.target.value = '';
    }
  };

  const bulkStatusUpdate = async (status: DeviceStatus) => {
    if (!canManageDevices || selectedDevices.length === 0) return;

    const selected = devices.filter((device) => selectedDevices.includes(device.id));
    const responses = await Promise.all(
      selected.map((device) =>
        deviceService.update(device.id, {
          ...cleanDeviceFormForType(toDeviceForm(device)),
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

  const clearDeviceView = () => {
    setFilter('All');
    setStatusFilter('All');
    setModelFilter('All');
    setQuery('');
    setSelectedDevices([]);
    setPage(1);
  };

  const applyInventoryTreeFilter = (nextType: DeviceType | 'All', nextStatus: DeviceStatusFilter = 'All') => {
    setFilter(nextType);
    setStatusFilter(nextStatus);
    setSelectedDevices([]);
    setPage(1);
  };

  const openPageContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || shouldUseNativeContextMenu(event.target)) {
      return;
    }

    event.preventDefault();
    setPageContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <div onContextMenu={openPageContextMenu}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 lg:pr-56">
        <div>
          <h1>Device Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track assigned equipment, maintenance, inventory status, and ownership history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded bg-accent/10 px-4 py-2 text-sm font-bold text-accent">
            {totalDevices} total devices
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {deviceNotice && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          {deviceNotice}
        </div>
      )}
      {phoneImportSummary && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100">
          Phone import complete: {phoneImportSummary.createdCount} created, {phoneImportSummary.updatedCount} updated, {phoneImportSummary.matchedCount} matched, {phoneImportSummary.unmatchedCount} unmatched, {phoneImportSummary.skippedCount} skipped from {phoneImportSummary.totalRows} rows.
        </div>
      )}
      {loading && <div className="loading">Loading device inventory...</div>}
      {phoneImportProgress && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-100">
                <Upload size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Importing Phones</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Batch {phoneImportProgress.currentBatch} of {phoneImportProgress.totalBatches}
                </p>
              </div>
            </div>
            <div className="mb-2 flex justify-between text-sm font-semibold text-gray-700 dark:text-gray-300">
              <span>{phoneImportProgress.processedRows} of {phoneImportProgress.totalRows} rows</span>
              <span>{Math.round((phoneImportProgress.processedRows / Math.max(phoneImportProgress.totalRows, 1)) * 100)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
              <div
                className="h-full rounded bg-primary-600 transition-all duration-300 dark:bg-primary-400"
                style={{ width: `${Math.round((phoneImportProgress.processedRows / Math.max(phoneImportProgress.totalRows, 1)) * 100)}%` }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <DeviceInventoryTree
        typeStatusCounts={deviceTypeStatusCounts}
        activeType={filter}
        activeStatus={statusFilter}
        onSelect={applyInventoryTreeFilter}
        collapsedTypes={collapsedInventoryTypes}
        onToggleType={(type) => setCollapsedInventoryTypes((current) => ({ ...current, [type]: !current[type] }))}
      />
      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2>Inventory</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Search inventory, filter lifecycle status, or scan a device identifier.
              </p>
            </div>
          </div>

          <form onSubmit={handleScannerSubmit} className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_160px_minmax(0,1fr)_auto_auto]">
            <input
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              placeholder="Scan or enter asset tag, serial, IMEI, ICCID, radio ID, hostname, router ID, or phone"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              autoComplete="off"
            />
            <select
              value={scanMode}
              onChange={(event) => setScanMode(event.target.value as ScanMode)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="lookup">Lookup</option>
              <option value="check-in">Check In</option>
              <option value="check-out">Check Out</option>
            </select>
            <select
              value={scanAssignee}
              onChange={(event) => setScanAssignee(event.target.value)}
              disabled={scanMode !== 'check-out'}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
              aria-label="Check out assignee"
            >
              <option value="">Select assignee</option>
              {registeredUsers.map((user) => (
                <option key={user.id} value={user.email}>{user.displayName || user.email}</option>
              ))}
            </select>
            <button type="button" onClick={() => void startCameraScanner()} className="btn-secondary justify-center md:hidden" aria-label="Scan with camera" title="Scan with Camera">
              <Camera size={16} />
              <span>Camera</span>
            </button>
            <button type="submit" className="btn-primary justify-center" aria-label="Apply scan" title="Apply Scan">
              <QrCode size={16} />
              <span>Apply</span>
            </button>
          </form>

          {isCameraScannerOpen && (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 text-white shadow-lg dark:border-gray-800">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-black">Camera Scan</p>
                  <p className="truncate text-xs font-semibold text-white/65">{cameraScanStatus || 'Point the camera at a device label.'}</p>
                </div>
                <button type="button" onClick={closeCameraScanner} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close camera scanner" title="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="relative aspect-[4/3] bg-black">
                <video ref={scannerVideoRef} className="h-full w-full object-cover" playsInline muted />
                {isCameraScanActive && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-36 w-64 max-w-[78vw] rounded-2xl border-2 border-accent shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
                  </div>
                )}
              </div>
            </div>
          )}

          {scanFeedback && (
            <div className="rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
              {scanFeedback}
            </div>
          )}

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <select value={filter} onChange={(event) => { setPage(1); setFilter(event.target.value as DeviceType | 'All'); }} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              {deviceTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={modelFilter} onChange={(event) => { setPage(1); setModelFilter(event.target.value); }} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option value="All">All Models</option>
              {modelOptions.map(([model, count]) => <option key={model} value={model}>{model} ({count})</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value as DeviceStatusFilter); }} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option>All</option>
              <option>Unassigned</option>
              {deviceStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={sortKey} onChange={(event) => { setPage(1); setSortKey(event.target.value as SortKey); }} className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option value="assetTag">Asset Tag</option>
              <option value="type">Type</option>
              <option value="status">Status</option>
              <option value="assignedTo">Assigned To</option>
              <option value="carrier">Carrier</option>
              <option value="replacementDueDate">Replacement Due</option>
            </select>
            <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search inventory" className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
          </div>
        </div>

        {selectedDevices.length > 0 && canManageDevices && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-gray-50 p-3 dark:bg-gray-950">
            <span className="text-sm font-bold">{selectedDevices.length} selected</span>
            <button type="button" onClick={() => bulkStatusUpdate('Maintenance')} className="btn-secondary" aria-label="Move selected to maintenance" title="Maintenance"><Wrench size={16} /></button>
            <button type="button" onClick={() => bulkStatusUpdate('Retired')} className="btn-secondary" aria-label="Retire selected devices" title="Retire"><ArchiveX size={16} /></button>
            <button type="button" onClick={() => setSelectedDevices([])} className="btn-secondary" aria-label="Clear selected devices" title="Clear"><X size={16} /></button>
          </div>
        )}

        {devices.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No devices match this view.</div>
        ) : (
          <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
            <span className="text-gray-500 dark:text-gray-400">
              Showing {pageStart}-{pageEnd} of {totalDevices}{isFiltering ? ' - Updating...' : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pageSize}
                onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}
                className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                aria-label="Devices per page"
              >
                {[25, 50, 100, 250].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="btn-secondary px-2 py-1 text-xs" aria-label="Previous device page" title="Previous">
                Previous
              </button>
              <span className="font-semibold text-gray-700 dark:text-gray-200">Page {safePage} of {totalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="btn-secondary px-2 py-1 text-xs" aria-label="Next device page" title="Next">
                Next
              </button>
            </div>
          </div>
          <div className="space-y-3 lg:hidden">
            {paginatedDevices.map((device) => {
              const DeviceIcon = deviceIconMap[device.type];
              return (
                <article
                  key={device.id}
                  onClick={() => {
                    if (canManageDevices) {
                      editDevice(device);
                    }
                  }}
                  className={`rounded-lg border border-gray-200 p-3 transition-colors hover:border-accent/40 hover:bg-accent/10 dark:hover:bg-gray-800/70 ${canManageDevices ? 'cursor-pointer' : ''}`}
                  role={canManageDevices ? 'button' : undefined}
                  tabIndex={canManageDevices ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (canManageDevices && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      editDevice(device);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                        <DeviceIcon size={18} className="shrink-0 text-accent" />
                        <span className="truncate">{getDeviceDisplayName(device)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{getDeviceDisplayMeta(device)}</p>
                    </div>
                    <DeviceStatusCluster device={device} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Detail label="Assigned" value={device.assignedTo || 'Unassigned'} />
                    <Detail label="Condition" value={device.condition || 'Good'} />
                    <Detail label="Carrier" value={device.carrier || 'Verizon'} />
                    <Detail label="Replacement" value={formatDate(device.replacementDueDate)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canManageDevices && <button type="button" onClick={(event) => { event.stopPropagation(); editDevice(device); }} className="btn-secondary" aria-label="Edit device" title="Edit"><Pencil size={15} /><span>Edit</span></button>}
                    {canManageDevices && <button type="button" onClick={(event) => { event.stopPropagation(); setDevicePendingDelete(device); }} className="btn-danger" aria-label="Delete device" title="Delete"><Trash2 size={15} /><span>Remove</span></button>}
                  </div>
                </article>
              );
            })}
          </div>
          <div
            className="hidden overflow-auto lg:block"
            style={deviceTableViewportHeight ? { maxHeight: deviceTableViewportHeight } : undefined}
            onScroll={(event) => {
              if (shouldVirtualizeDeviceTable) {
                setDeviceTableScrollTop(event.currentTarget.scrollTop);
              }
            }}
          >
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="w-10 px-2 py-2"><input type="checkbox" checked={paginatedDevices.length > 0 && paginatedDevices.every((device) => selectedDevices.includes(device.id))} onChange={(event) => setSelectedDevices(event.target.checked ? Array.from(new Set([...selectedDevices, ...paginatedDevices.map((device) => device.id)])) : selectedDevices.filter((id) => !paginatedDevices.some((device) => device.id === id)))} /></th>
                  <th className="px-2 py-2">Device</th>
                  <th className="px-2 py-2">Assigned</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Carrier</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deviceTableTopSpacerHeight > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={6} style={{ height: deviceTableTopSpacerHeight, padding: 0, border: 0 }} />
                  </tr>
                )}
                {visibleTableDevices.map((device) => {
                  const DeviceIcon = deviceIconMap[device.type];
                  return (
                    <tr
                      key={device.id}
                      onClick={() => {
                        if (canManageDevices) {
                          editDevice(device);
                        }
                      }}
                      className={`border-b border-gray-100 text-sm transition-colors hover:bg-accent/10 dark:border-gray-800 dark:hover:bg-gray-800/70 ${canManageDevices ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-2 py-2"><input type="checkbox" checked={selectedDevices.includes(device.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedDevices((ids) => event.target.checked ? [...ids, device.id] : ids.filter((id) => id !== device.id))} /></td>
                      <td className="px-2 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-left">
                          <DeviceIcon size={17} className="shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-gray-900 dark:text-gray-100">{getDeviceDisplayName(device)}</span>
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{getDeviceDisplayMeta(device)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-2">{device.assignedTo || 'Unassigned'}</td>
                      <td className="px-2 py-2"><DeviceStatusCluster device={device} /></td>
                      <td className="px-2 py-2 font-semibold">{device.carrier || 'Verizon'}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-1.5">
                          {canManageDevices && <button type="button" onClick={(event) => { event.stopPropagation(); editDevice(device); }} className="btn-secondary h-8 w-8 p-0" aria-label="Edit device" title="Edit"><Pencil size={14} /></button>}
                          {canManageDevices && <button type="button" onClick={(event) => { event.stopPropagation(); setDevicePendingDelete(device); }} className="btn-danger h-8 w-8 p-0" aria-label="Delete device" title="Delete"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {deviceTableBottomSpacerHeight > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={6} style={{ height: deviceTableBottomSpacerHeight, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          {canManageDevices && (
            <button type="button" onClick={openAddDeviceModal} className="btn-primary" title="Add Device" aria-label="Add Device">
              <Plus size={16} />
              <span>Add Device</span>
            </button>
          )}
          <button type="button" onClick={exportCsv} className="btn-secondary" title="Export current page" aria-label="Export current page">
            <Download size={16} />
            <span>Export Page</span>
          </button>
          {canManageDevices && (
            <button type="button" onClick={() => void exportPhoneInventory()} className="btn-secondary" title="Export all phones" aria-label="Export all phones">
              <Smartphone size={16} />
              <span>Export Phones</span>
            </button>
          )}
          {canManageDevices && (
            <button type="button" onClick={() => setIsDeletePhonesConfirmOpen(true)} className="btn-danger" title="Delete all phones" aria-label="Delete all phones">
              <Trash2 size={16} />
              <span>Delete Phones</span>
            </button>
          )}
          {canManageDevices && (
            <label className="btn-secondary cursor-pointer" title="Import CSV" aria-label="Import CSV">
              <Upload size={16} />
              <span>Import</span>
              <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
            </label>
          )}
          {canManageDevices && (
            <label className="btn-secondary cursor-pointer" title="Import phone CSV" aria-label="Import phone CSV">
              <Upload size={16} />
              <span>Import Phones</span>
              <input type="file" accept=".csv" className="hidden" onChange={importPhoneCsv} />
            </label>
          )}
        </div>
      </section>
      </div>

      {canManageDevices && isDeviceFormOpen && (
        <FloatingWindow
          className="pointer-events-auto modal-window fixed inset-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white p-4 shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[82dvh] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(520px,calc(100dvh-1rem))] md:w-[min(1152px,calc(100vw-1rem))] md:min-w-[min(520px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg sm:p-6"
          fallbackSize={{ width: Math.min(window.innerWidth - 16, 1152), height: Math.min(window.innerHeight - 16, 760) }}
          initialPosition={getInitialDeviceModalPosition}
          zIndex={50}
        >
          {({ dragHandleProps, isDragging }) => (
          <>
            <div
              {...dragHandleProps}
              className={`mb-5 flex select-none items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800 md:touch-none md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
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
                    className={getDeviceInputClass()}
                  >
                    {deviceTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </Field>
                {form.type !== 'Cell Phone' && <TextField label="Asset Tag" value={form.assetTag} required onChange={(value) => setForm((current) => ({ ...current, assetTag: value }))} />}
                <TextField label="Make / Model" value={form.makeModel} required onChange={(value) => setForm((current) => ({ ...current, makeModel: value }))} />
                <TextField label="Serial Number" value={form.serialNumber} onChange={(value) => setForm((current) => ({ ...current, serialNumber: value }))} />
                <Field label="Assigned To">
                  <div className="space-y-2">
                    <input
                      value={assigneeSearch}
                      onChange={(event) => setAssigneeSearch(event.target.value)}
                      placeholder="Search users"
                      className={getDeviceInputClass()}
                    />
                    <select value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value, status: event.target.value ? 'Assigned' : 'Available' }))} className={getDeviceInputClass()}>
                      <option value="">Unassigned</option>
                      {filteredRegisteredUsers.map((user) => <option key={user.id} value={user.email}>{user.displayName} ({user.email})</option>)}
                    </select>
                  </div>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DeviceStatus }))} className={getDeviceInputClass()}>
                    {deviceStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </Field>
                <Field label="Carrier">
                  <select value={form.carrier || 'Verizon'} onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value as DeviceCarrier }))} className={getDeviceInputClass()}>
                    {deviceCarriers.map((carrier) => <option key={carrier}>{carrier}</option>)}
                  </select>
                </Field>
                <Field label="Condition">
                  <select value={form.condition} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} className={getDeviceInputClass()}>
                    {deviceConditions.map((condition) => <option key={condition}>{condition}</option>)}
                  </select>
                </Field>
                <TextField label="Location" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
                {shouldShowDeviceField(form.type, 'phoneNumber') && <TextField label="Phone Number" value={form.phoneNumber} onChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))} />}
                {shouldShowDeviceField(form.type, 'imei') && <TextField label="IMEI" value={form.imei} onChange={(value) => setForm((current) => ({ ...current, imei: value }))} />}
                {shouldShowDeviceField(form.type, 'simNumber') && <TextField label="ICCID" value={form.simNumber} onChange={(value) => setForm((current) => ({ ...current, simNumber: value }))} />}
                {shouldShowDeviceField(form.type, 'radioId') && <TextField label="Radio ID" value={form.radioId} onChange={(value) => setForm((current) => ({ ...current, radioId: value }))} />}
                {shouldShowDeviceField(form.type, 'hostname') && <TextField label="Hostname" value={form.hostname} onChange={(value) => setForm((current) => ({ ...current, hostname: value }))} />}
                {shouldShowDeviceField(form.type, 'routerId') && <TextField label="Router ID" value={form.routerId} onChange={(value) => setForm((current) => ({ ...current, routerId: value }))} />}
                <DateField label="Purchase Date" value={form.purchaseDate} onChange={(value) => setForm((current) => ({ ...current, purchaseDate: value }))} />
                <DateField label="Warranty Expiration" value={form.warrantyExpiration} onChange={(value) => setForm((current) => ({ ...current, warrantyExpiration: value }))} />
                <DateField label="Replacement Due" value={form.replacementDueDate} onChange={(value) => setForm((current) => ({ ...current, replacementDueDate: value }))} />
                <DateField label="Maintenance Due" value={form.maintenanceDueDate} onChange={(value) => setForm((current) => ({ ...current, maintenanceDueDate: value }))} />
                <DateField label="Last Service" value={form.lastServiceDate} onChange={(value) => setForm((current) => ({ ...current, lastServiceDate: value }))} />
                <label className="block lg:col-span-2">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Event Note</span>
                  <input value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} className={getDeviceInputClass()} />
                </label>
                <label className="block lg:col-span-4">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Device Notes</span>
                  <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={`${getDeviceInputClass()} min-h-24 resize-y py-2`} />
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
          </>
          )}
        </FloatingWindow>
      )}

      {devicePendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/45">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Device</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete {getDeviceDisplayName(devicePendingDelete) || 'this device'}? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDevicePendingDelete(null)} className="btn-secondary" aria-label="Cancel device deletion" title="Cancel">
                <span>Cancel</span>
              </button>
              <button type="button" onClick={() => deleteDevice(devicePendingDelete)} className="btn-danger" aria-label="Delete device" title="Delete">
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {isDeletePhonesConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Phones</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete every Cell Phone and Cradlepoint device record? Radios, computers, and MiFis will stay untouched.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDeletePhonesConfirmOpen(false)} className="btn-secondary" aria-label="Cancel phone deletion" title="Cancel">
                <span>Cancel</span>
              </button>
              <button type="button" onClick={() => void deleteAllPhones()} className="btn-danger" aria-label="Delete phones" title="Delete Phones">
                <Trash2 size={16} />
                <span>Delete All</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {pageContextMenu && (
        <AppContextMenu
          position={pageContextMenu}
          onClose={() => setPageContextMenu(null)}
          actions={[
            { label: 'Refresh Inventory', icon: RefreshCw, onSelect: () => void loadDevices(false), disabled: !canManageDevices },
            { label: 'Add Device', icon: Plus, onSelect: openAddDeviceModal, disabled: !canManageDevices },
            { label: 'Export Page', icon: Download, onSelect: exportCsv, disabled: devices.length === 0 },
            { label: 'Export Phones', icon: Smartphone, onSelect: () => void exportPhoneInventory(), disabled: !canManageDevices },
            { label: 'Delete Phones', icon: Trash2, onSelect: () => setIsDeletePhonesConfirmOpen(true), disabled: !canManageDevices },
            { label: 'Clear Filters', icon: X, onSelect: clearDeviceView },
          ]}
        />
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

function DeviceInventoryTree({
  typeStatusCounts,
  activeType,
  activeStatus,
  onSelect,
  collapsedTypes,
  onToggleType,
}: {
  typeStatusCounts: Record<string, Record<string, number>>;
  activeType: DeviceType | 'All';
  activeStatus: DeviceStatusFilter;
  onSelect: (type: DeviceType | 'All', status?: DeviceStatusFilter) => void;
  collapsedTypes: Record<string, boolean>;
  onToggleType: (type: DeviceType) => void;
}) {
  const getRailIcon = (status: DeviceStatusFilter) => {
    if (status === 'All') return Laptop;
    if (status === 'Unassigned') return PackageCheck;
    return deviceStatusMeta[status].icon;
  };

  const getRailTone = (status: DeviceStatusFilter) => {
    if (status === 'All') return 'bg-primary-50 text-primary-500 dark:bg-blue-950/40 dark:text-blue-100';
    if (status === 'Unassigned') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
    return deviceStatusMeta[status].cardTone;
  };

  const typeEntries = deviceTypes.map((type) => {
    const counts = typeStatusCounts[type] || {};
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { type, counts, total };
  });
  const allTotal = typeEntries.reduce((sum, item) => sum + item.total, 0);

  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
      <div className="border-b border-gray-200 px-1 pb-3 dark:border-gray-800">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Device Views</p>
        <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">Inventory</h2>
      </div>

      <div className="mt-3 space-y-1">
        <button
          type="button"
          onClick={() => onSelect('All', 'All')}
          className={`flex w-full items-center gap-3 rounded border px-3 py-2.5 text-left transition hover:border-accent hover:bg-accent/10 ${
            activeType === 'All' && activeStatus === 'All'
              ? 'border-accent bg-accent/10 text-accent shadow-sm'
              : 'border-transparent text-gray-600 dark:text-gray-300'
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary-50 text-primary-500 dark:bg-blue-950/40 dark:text-blue-100">
            <Laptop size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">All Devices</span>
            <span className="block text-xs font-semibold text-gray-400 dark:text-gray-500">{allTotal} devices</span>
          </span>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-black text-gray-600 dark:bg-gray-800 dark:text-gray-200">{allTotal}</span>
        </button>

        {typeEntries.map(({ type, counts, total }) => {
          const TypeIcon = deviceIconMap[type];
          const isTypeActive = activeType === type && activeStatus === 'All';
          const statuses = (['Assigned', 'Unassigned', 'Available', 'Maintenance', 'Damaged', 'Lost', 'Retired'] as DeviceStatusFilter[])
            .filter((status) => (counts[status] || 0) > 0);
          const isSubtreeCollapsed = Boolean(collapsedTypes[type]);

          return (
            <div key={type} className="rounded border border-transparent">
              <div className={`flex items-center rounded border transition hover:border-accent hover:bg-accent/10 ${
                isTypeActive
                  ? 'border-accent bg-accent/10 text-accent shadow-sm'
                  : 'border-transparent text-gray-600 dark:text-gray-300'
              }`}>
                <button
                  type="button"
                  onClick={() => onSelect(type, 'All')}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <TypeIcon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{type}</span>
                    <span className="block text-xs font-semibold text-gray-400 dark:text-gray-500">
                      {total} device{total === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-black text-gray-600 dark:bg-gray-800 dark:text-gray-200">
                    {total}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleType(type)}
                  className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-accent dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label={isSubtreeCollapsed ? `Expand ${type} statuses` : `Collapse ${type} statuses`}
                  title={isSubtreeCollapsed ? 'Expand Statuses' : 'Collapse Statuses'}
                >
                  {isSubtreeCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              {!isSubtreeCollapsed && statuses.length > 0 && (
                <div className="ml-5 mt-1 space-y-1 border-l border-gray-200 pl-3 dark:border-gray-800">
                  {statuses.map((status) => {
                    const StatusIcon = getRailIcon(status);
                    const isActive = activeType === type && activeStatus === status;
                    const count = counts[status] || 0;

                    return (
                      <button
                        key={`${type}-${status}`}
                        type="button"
                        onClick={() => onSelect(type, status)}
                        className={`flex w-full items-center gap-2 rounded border px-2.5 py-2 text-left text-sm transition hover:border-accent hover:bg-accent/10 ${
                          isActive
                            ? 'border-accent bg-accent/10 text-accent shadow-sm'
                            : 'border-transparent text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${getRailTone(status)}`}>
                          <StatusIcon size={15} />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{status}</span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-black text-gray-600 dark:bg-gray-800 dark:text-gray-200">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </aside>
  );
}

function getDeviceInputClass(): string {
  return 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm transition dark:border-gray-700 dark:bg-gray-950';
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Field label={label}>
      <input value={value} required={required} onChange={(event) => onChange(event.target.value)} className={getDeviceInputClass()} />
    </Field>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)} className={getDeviceInputClass()} />
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
  const StatusIcon = deviceStatusMeta[status].icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${deviceStatusMeta[status].tone}`}>
      <StatusIcon size={13} />
      {status}
    </span>
  );
}

function DeviceStatusCluster({ device }: { device: DeviceRecord }) {
  const chips = getDeviceHealthChips(device);
  const attentionChips = chips.filter((chip) => chip.label !== 'Healthy').slice(0, 2);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={device.status} />
      {attentionChips.map((chip) => (
        <span key={chip.label} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${chip.tone}`}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export default DeviceManagementPage;
