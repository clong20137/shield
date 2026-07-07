import { ChangeEvent, FormEvent, MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArchiveX, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Laptop, MapPinOff, PackageCheck, Pencil, Plus, Radio, RefreshCw, Router, Save, Smartphone, Tablet, Trash2, Upload, UserCheck, Wifi, Wrench, X } from 'lucide-react';
import { authService, AuthAccount, DeviceReportMonthlySnapshot, deviceService, DeviceRecord, PhoneImportType, reportService } from '../services/api';
import { FloatingWindow } from '../components/FloatingWindow';
import { AppContextMenu, AppContextMenuPosition, shouldUseNativeContextMenu } from '../components/AppContextMenu';

type DeviceType = DeviceRecord['type'];
type DeviceStatus = DeviceRecord['status'];
type DeviceCarrier = DeviceRecord['carrier'];
type DeviceExportScope = DeviceCarrier | 'All';
type DeviceStatusFilter = DeviceStatus | 'All' | 'Unassigned';
type DeviceForm = Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>;
type DeviceConditionalField = 'phoneNumber' | 'imei' | 'simNumber' | 'radioId' | 'hostname' | 'routerId';
type SortKey = keyof Pick<DeviceRecord, 'type' | 'assetTag' | 'makeModel' | 'assignedTo' | 'status' | 'carrier' | 'location' | 'maintenanceDueDate' | 'replacementDueDate' | 'updatedAt'>;
type PhoneImportSummary = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  skippedCount: number;
};
type PhoneImportProgress = {
  processedRows: number;
  totalRows: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
};

const deviceTypes: DeviceType[] = ['Cell Phone', 'MiFi Device', 'Tablet', 'Computer', 'Radio', 'Cradlepoint'];
const deviceStatuses: DeviceStatus[] = ['Available', 'Assigned', 'Maintenance', 'Damaged', 'Lost', 'Retired'];
const deviceCarriers: DeviceCarrier[] = ['Verizon', 'AT&T'];
const deviceConditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const DEVICE_TABLE_ROW_HEIGHT = 64;
const DEVICE_TABLE_OVERSCAN = 8;
const DEVICE_TABLE_MAX_HEIGHT = 620;
const PHONE_IMPORT_POLL_MS = 900;
const INVENTORY_TREE_COLLAPSE_KEY = 'shield_device_inventory_tree_collapsed';
const phoneImportOptions: Array<{ value: PhoneImportType; label: string; accept: string }> = [
  { value: 'verizon-phone', label: 'Verizon', accept: '.csv' },
  { value: 'att-firstnet', label: 'AT&T', accept: '.xlsx,.xls,.csv' },
];

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
  activationDate: '',
  contractEndDate: '',
  eligibilityDate: '',
  monthlyCharge: 0,
  dataUsageGb: 0,
  mobileMinutes: 0,
  possibleInactive: false,
  condition: 'Good',
};

const deviceIconMap = {
  'Cell Phone': Smartphone,
  'MiFi Device': Router,
  Tablet,
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

  if (form.type === 'Cell Phone' || form.type === 'Tablet') {
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
    Tablet: ['radioId', 'hostname', 'routerId'],
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
    activationDate: device.activationDate || '',
    contractEndDate: device.contractEndDate || '',
    eligibilityDate: device.eligibilityDate || '',
    monthlyCharge: Number(device.monthlyCharge) || 0,
    dataUsageGb: Number(device.dataUsageGb) || 0,
    mobileMinutes: Number(device.mobileMinutes) || 0,
    possibleInactive: Boolean(device.possibleInactive),
    condition: device.condition || 'Good',
  };
}

function escapeCsv(value: string | number | boolean | undefined | null): string {
  const text = String(value ?? '');
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function hasCsvDataRows(text: string): boolean {
  let lineStart = 0;
  let rowIndex = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index !== text.length && text[index] !== '\n') {
      continue;
    }

    const line = text.slice(lineStart, index).replace(/\r$/u, '');
    if (rowIndex > 0 && line.trim().length > 0) {
      return true;
    }
    rowIndex += 1;
    lineStart = index + 1;
  }

  return false;
}

async function readPhoneImportFileAsCsv(file: File): Promise<string> {
  if (/\.xlsx?$/iu.test(file.name)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

    if (!worksheet) {
      return '';
    }

    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd',
    });

    return rows
      .map((row) => row.map((value) => escapeCsv(value === null ? '' : String(value))).join(','))
      .join('\n');
  }

  return file.text();
}

function formatDate(value: string): string {
  return value ? new Date(value).toLocaleDateString() : 'N/A';
}

function formatCurrency(value: number | string | undefined | null): string {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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

  if (device.possibleInactive) {
    chips.push({ label: 'Possible inactive', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200' });
  }

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
  if (device.type === 'Cell Phone' || device.type === 'Tablet' || device.type === 'Cradlepoint') {
    return device.makeModel || device.type;
  }

  return device.assetTag || device.makeModel || device.type;
}

function getDeviceDisplayMeta(device: DeviceRecord): string {
  const details: string[] = [device.type];

  if ((device.type === 'Cell Phone' || device.type === 'Tablet' || device.type === 'Cradlepoint') && device.phoneNumber) {
    details.push(device.phoneNumber);
  } else if (device.makeModel && device.makeModel !== getDeviceDisplayName(device)) {
    details.push(device.makeModel);
  }

  return details.join(' - ');
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

function loadCollapsedInventoryTypes(): Record<string, boolean> {
  try {
    const storedValue = window.localStorage.getItem(INVENTORY_TREE_COLLAPSE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue as Record<string, boolean>
      : {};
  } catch {
    return {};
  }
}

function getCurrentReportMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getReportMonthYear(reportMonth: string): number {
  const parsedYear = Number(reportMonth.slice(0, 4));
  return Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : new Date().getFullYear();
}

function getReportMonthRailOptions(reportMonth: string) {
  const year = getReportMonthYear(reportMonth);
  return Array.from({ length: 12 }, (_, index) => {
    const value = `${year}-${String(index + 1).padStart(2, '0')}`;
    const label = new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
    return { value, label };
  });
}

function shiftReportMonthYear(reportMonth: string, offset: number): string {
  const year = getReportMonthYear(reportMonth) + offset;
  const month = reportMonth.slice(5, 7) || '01';
  return `${year}-${month}`;
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
  const [collapsedInventoryTypes, setCollapsedInventoryTypes] = useState<Record<string, boolean>>(() => loadCollapsedInventoryTypes());
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [pageContextMenu, setPageContextMenu] = useState<AppContextMenuPosition | null>(null);
  const [devicePendingDelete, setDevicePendingDelete] = useState<DeviceRecord | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isDeleteAllRecordsConfirmOpen, setIsDeleteAllRecordsConfirmOpen] = useState(false);
  const [eventNotes, setEventNotes] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [phoneImportSummary, setPhoneImportSummary] = useState<PhoneImportSummary | null>(null);
  const [phoneImportProgress, setPhoneImportProgress] = useState<PhoneImportProgress | null>(null);
  const [phoneImportType, setPhoneImportType] = useState<PhoneImportType>('verizon-phone');
  const [phoneImportReportMonth, setPhoneImportReportMonth] = useState(getCurrentReportMonth);
  const [forcePhoneImportInventorySync, setForcePhoneImportInventorySync] = useState(false);
  const [isPhoneImportSetupOpen, setIsPhoneImportSetupOpen] = useState(false);
  const [deviceReportSnapshots, setDeviceReportSnapshots] = useState<DeviceReportMonthlySnapshot[]>([]);
  const [deviceReportSnapshotsLoading, setDeviceReportSnapshotsLoading] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [deviceTableScrollTop, setDeviceTableScrollTop] = useState(0);
  const deviceLoadSequenceRef = useRef(0);
  const isUserLoadInFlightRef = useRef(false);
  const hasLoadedRegisteredUsersRef = useRef(false);
  const deviceRefreshTimerRef = useRef<number | null>(null);
  const userRefreshTimerRef = useRef<number | null>(null);
  const phoneImportInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPhoneImportTypeRef = useRef<PhoneImportType>('verizon-phone');

  const canManageDevices = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('devices:manage'));
  const canDeleteAllDevices = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('devices:delete-all'));
  const actor = { actorId: currentUser?.id, actorName: currentUser?.displayName || currentUser?.email };

  const loadDeviceReportSnapshots = useCallback(async () => {
    if (!canManageDevices) {
      setDeviceReportSnapshots([]);
      return;
    }

    setDeviceReportSnapshotsLoading(true);
    try {
      const response = await reportService.getDeviceManagementReports();
      setDeviceReportSnapshots(response.data.monthlySnapshots || []);
    } catch (err) {
      console.error('Failed to load device report snapshots:', err);
      setDeviceReportSnapshots([]);
    } finally {
      setDeviceReportSnapshotsLoading(false);
    }
  }, [canManageDevices]);

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

  const deleteSelectedDevices = async () => {
    if (!canManageDevices || selectedDevices.length === 0) return;

    const selectedIds = Array.from(new Set(selectedDevices));
    const selected = devices.filter((device) => selectedIds.includes(device.id));

    try {
      setError(null);
      await Promise.all(selectedIds.map((id) => {
        const device = selected.find((item) => item.id === id);
        const label = device ? getDeviceDisplayName(device) : 'selected device';
        return deviceService.delete(id, { ...actor, eventNotes: `Deleted ${label} from bulk selection.` });
      }));
      setDevices((currentDevices) => currentDevices.filter((device) => !selectedIds.includes(device.id)));
      setSelectedDevices([]);
      setIsBulkDeleteConfirmOpen(false);
      setDeviceNotice(`Deleted ${selectedIds.length} selected device${selectedIds.length === 1 ? '' : 's'}.`);
      await loadDevices(false);
    } catch (err) {
      console.error('Failed to delete selected devices:', err);
      setError('Failed to delete selected devices.');
    }
  };

  const deleteAllDeviceRecords = async () => {
    if (!canDeleteAllDevices) return;

    try {
      setError(null);
      const response = await deviceService.deletePhones();
      setSelectedDevices([]);
      setIsDeleteAllRecordsConfirmOpen(false);
      setDeviceNotice(`Deleted ${response.data.deletedCount} device record${response.data.deletedCount === 1 ? '' : 's'}.`);
      await loadDevices(false);
    } catch (err) {
      console.error('Failed to delete all device records:', err);
      setError('Failed to delete all device records.');
    }
  };

  const exportCsv = (scope: DeviceExportScope = 'All') => {
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
      'activationDate',
      'contractEndDate',
      'eligibilityDate',
      'monthlyCharge',
      'dataUsageGb',
      'mobileMinutes',
      'possibleInactive',
      'condition',
      'notes',
    ];
    const exportDevices = scope === 'All' ? devices : devices.filter((device) => device.carrier === scope);
    const rows = exportDevices.map((device) =>
      headers.map((header) => escapeCsv(header === 'iccid' ? device.simNumber : device[header as keyof DeviceRecord])).join(','),
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const scopeLabel = scope === 'All' ? 'all' : scope.toLowerCase().replace(/[^a-z0-9]+/gu, '-');
    link.href = url;
    link.download = `shield-device-inventory-${scopeLabel}-page-${safePage}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const importPhoneReport = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canManageDevices) return;

    const file = event.target.files?.[0];
    if (!file) return;
    const activeImportType = pendingPhoneImportTypeRef.current || phoneImportType;
    const selectedImport = phoneImportOptions.find((option) => option.value === activeImportType) || phoneImportOptions[0];

    try {
      setError(null);
      setDeviceNotice(null);
      setPhoneImportSummary(null);
      const csvText = await readPhoneImportFileAsCsv(file);
      if (!hasCsvDataRows(csvText)) {
        setError(`${selectedImport.label} import file is empty.`);
        return;
      }

      const response = await deviceService.startPhoneImportJob(csvText, actor, activeImportType, phoneImportReportMonth, forcePhoneImportInventorySync);
      let importJob = response.data;
      setPhoneImportProgress({
        processedRows: importJob.processedRows,
        totalRows: importJob.totalRows,
        status: importJob.status,
      });

      while (importJob.status === 'queued' || importJob.status === 'processing') {
        await new Promise((resolve) => {
          window.setTimeout(resolve, PHONE_IMPORT_POLL_MS);
        });
        importJob = (await deviceService.getPhoneImportJob(importJob.id)).data;
        setPhoneImportProgress({
          processedRows: importJob.processedRows,
          totalRows: importJob.totalRows,
          status: importJob.status,
        });
      }

      if (importJob.status === 'failed') {
        setError(importJob.error || `Failed to import ${selectedImport.label}.`);
        return;
      }

      setPhoneImportSummary({
        totalRows: importJob.summary.totalRows,
        createdCount: importJob.summary.createdCount,
        updatedCount: importJob.summary.updatedCount,
        deletedCount: importJob.summary.deletedCount || 0,
        matchedCount: importJob.summary.matchedCount,
        unmatchedCount: importJob.summary.unmatchedRows.length,
        skippedCount: importJob.summary.skippedRows.length,
      });
      await loadDevices(false);
      await loadDeviceReportSnapshots();
    } catch (err) {
      console.error('Failed to import phones:', err);
      setError(`Failed to import ${selectedImport.label}. Check columns, phone numbers, and duplicate asset tags.`);
    } finally {
      setPhoneImportProgress(null);
      event.target.value = '';
    }
  };

  const beginPhoneImport = () => {
    pendingPhoneImportTypeRef.current = phoneImportType;
    setIsPhoneImportSetupOpen(false);
    window.setTimeout(() => phoneImportInputRef.current?.click(), 0);
  };

  const openPhoneImportSetup = () => {
    setForcePhoneImportInventorySync(false);
    setIsPhoneImportSetupOpen(true);
    setIsExportMenuOpen(false);
    void loadDeviceReportSnapshots();
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

  const toggleInventoryType = useCallback((type: DeviceType) => {
    setCollapsedInventoryTypes((current) => {
      const next = { ...current, [type]: !current[type] };

      try {
        window.localStorage.setItem(INVENTORY_TREE_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // Local storage can fail in locked-down browser contexts.
      }

      return next;
    });
  }, []);

  const openPageContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || shouldUseNativeContextMenu(event.target)) {
      return;
    }

    event.preventDefault();
    setPageContextMenu({ x: event.clientX, y: event.clientY });
  };
  const selectedPhoneImportOption = phoneImportOptions.find((option) => option.value === phoneImportType) || phoneImportOptions[0];
  const reportMonthRailOptions = useMemo(() => getReportMonthRailOptions(phoneImportReportMonth), [phoneImportReportMonth]);
  const reportMonthYear = getReportMonthYear(phoneImportReportMonth);
  const existingReportMonthKeys = useMemo(
    () => new Set(deviceReportSnapshots.map((snapshot) => `${snapshot.carrier}|${snapshot.reportMonth}`)),
    [deviceReportSnapshots],
  );
  const selectedExistingReportSnapshot = deviceReportSnapshots.find(
    (snapshot) => snapshot.carrier === selectedPhoneImportOption.label && snapshot.reportMonth === phoneImportReportMonth,
  );
  const exportOptions: Array<{ value: DeviceExportScope; label: string; count: number }> = [
    { value: 'All', label: 'All', count: devices.length },
    { value: 'Verizon', label: 'Verizon', count: devices.filter((device) => device.carrier === 'Verizon').length },
    { value: 'AT&T', label: 'AT&T', count: devices.filter((device) => device.carrier === 'AT&T').length },
  ];

  return (
    <div onContextMenu={openPageContextMenu}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 lg:pr-56">
        <div>
          <h1>Device Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track assigned equipment, maintenance, inventory status, and ownership history.
          </p>
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
          {selectedPhoneImportOption.label} import complete: {phoneImportSummary.createdCount} created, {phoneImportSummary.updatedCount} updated, {phoneImportSummary.deletedCount} removed, {phoneImportSummary.matchedCount} matched, {phoneImportSummary.unmatchedCount} unmatched, {phoneImportSummary.skippedCount} skipped from {phoneImportSummary.totalRows} rows.
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
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Importing {selectedPhoneImportOption.label}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {phoneImportProgress.status === 'queued' ? 'Queued for processing' : 'Processing on the server'}
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
        onToggleType={toggleInventoryType}
      />
      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2>Inventory</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Search inventory, filter lifecycle status, and manage device imports.
              </p>
            </div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              {canManageDevices && (
                <button type="button" onClick={openAddDeviceModal} className="btn-primary h-10 w-10 justify-center p-0" title="Add Device" aria-label="Add Device">
                  <Plus size={16} />
                </button>
              )}
              {canDeleteAllDevices && (
                <button
                  type="button"
                  onClick={() => setIsDeleteAllRecordsConfirmOpen(true)}
                  className="btn-danger h-10 w-10 justify-center p-0"
                  title="Delete all device records"
                  aria-label="Delete all device records"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsExportMenuOpen((open) => !open);
                    setIsPhoneImportSetupOpen(false);
                  }}
                  className="btn-secondary h-10 gap-1 px-3"
                  title="Export current page"
                  aria-label="Export current page"
                  aria-haspopup="menu"
                  aria-expanded={isExportMenuOpen}
                  disabled={devices.length === 0}
                >
                  <Download size={16} />
                  <ChevronDown size={14} className={`transition ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isExportMenuOpen && (
                  <div className="absolute right-0 top-12 z-40 min-w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-950" role="menu">
                    {exportOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => exportCsv(option.value)}
                        disabled={option.count === 0}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-900"
                        role="menuitem"
                      >
                        <span>{option.label}</span>
                        <span className="text-xs text-gray-400">{option.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {canManageDevices && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={openPhoneImportSetup}
                    className="btn-secondary h-10 w-10 justify-center p-0"
                    aria-label="Import device report"
                    title="Import device report"
                  >
                    <Upload size={16} />
                  </button>
                  <input
                    ref={phoneImportInputRef}
                    type="file"
                    accept={selectedPhoneImportOption.accept}
                    className="hidden"
                    onChange={importPhoneReport}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr_1.6fr] dark:border-gray-800 dark:bg-gray-950">
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
            <button type="button" onClick={() => setIsBulkDeleteConfirmOpen(true)} className="btn-danger" aria-label="Delete selected devices" title="Delete Selected"><Trash2 size={16} /><span>Delete</span></button>
            <button type="button" onClick={() => bulkStatusUpdate('Maintenance')} className="btn-secondary" aria-label="Move selected to maintenance" title="Maintenance"><Wrench size={16} /></button>
            <button type="button" onClick={() => bulkStatusUpdate('Retired')} className="btn-secondary" aria-label="Retire selected devices" title="Retire"><ArchiveX size={16} /></button>
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
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-gray-700 dark:text-gray-200">Page {safePage} of {totalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="btn-secondary px-2 py-1 text-xs" aria-label="Next device page" title="Next">
                <ChevronRight size={16} />
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
                    {canManageDevices && <Detail label="Monthly" value={formatCurrency(device.monthlyCharge)} />}
                    {canManageDevices && <Detail label="Usage" value={`${Number(device.dataUsageGb) || 0} GB / ${Number(device.mobileMinutes) || 0} min`} />}
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
                {form.type !== 'Cell Phone' && <DateField label="Warranty Expiration" value={form.warrantyExpiration} onChange={(value) => setForm((current) => ({ ...current, warrantyExpiration: value }))} />}
                {form.type !== 'Cell Phone' && <DateField label="Replacement Due" value={form.replacementDueDate} onChange={(value) => setForm((current) => ({ ...current, replacementDueDate: value }))} />}
                {form.type !== 'Cell Phone' && <DateField label="Maintenance Due" value={form.maintenanceDueDate} onChange={(value) => setForm((current) => ({ ...current, maintenanceDueDate: value }))} />}
                {form.type !== 'Cell Phone' && <DateField label="Last Service" value={form.lastServiceDate} onChange={(value) => setForm((current) => ({ ...current, lastServiceDate: value }))} />}
                {canManageDevices && <DateField label="Activation Date" value={form.activationDate} onChange={(value) => setForm((current) => ({ ...current, activationDate: value }))} />}
                {canManageDevices && <DateField label="Contract End Date" value={form.contractEndDate} onChange={(value) => setForm((current) => ({ ...current, contractEndDate: value }))} />}
                {canManageDevices && <DateField label="Eligibility Date" value={form.eligibilityDate} onChange={(value) => setForm((current) => ({ ...current, eligibilityDate: value }))} />}
                {canManageDevices && <MoneyField label="Monthly Charge" value={form.monthlyCharge} onChange={(value) => setForm((current) => ({ ...current, monthlyCharge: value }))} />}
                {canManageDevices && <NumberField label="Data Usage (GB)" value={form.dataUsageGb} step="0.001" onChange={(value) => setForm((current) => ({ ...current, dataUsageGb: value }))} />}
                {canManageDevices && <NumberField label="Calling Minutes" value={form.mobileMinutes} step="1" onChange={(value) => setForm((current) => ({ ...current, mobileMinutes: value }))} />}
                {canManageDevices && (
                  <label className="flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-semibold dark:border-gray-700">
                    <input type="checkbox" checked={form.possibleInactive} onChange={(event) => setForm((current) => ({ ...current, possibleInactive: event.target.checked }))} />
                    Possible inactive
                  </label>
                )}
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

      {devicePendingDelete && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
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
        </div>,
        document.body,
      )}
      {isBulkDeleteConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Selected Devices</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete {selectedDevices.length} selected device{selectedDevices.length === 1 ? '' : 's'}? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsBulkDeleteConfirmOpen(false)} className="btn-secondary" aria-label="Cancel selected device deletion" title="Cancel">
                <span>Cancel</span>
              </button>
              <button type="button" onClick={() => void deleteSelectedDevices()} className="btn-danger" aria-label="Delete selected devices" title="Delete Selected">
                <Trash2 size={16} />
                <span>Delete All</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {canManageDevices && isPhoneImportSetupOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
          <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Import Device Report</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose the carrier and the month this report represents.</p>
              </div>
              <button type="button" onClick={() => setIsPhoneImportSetupOpen(false)} className="btn-secondary h-9 w-9 justify-center p-0" aria-label="Close import setup" title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <Field label="Carrier">
                <select
                  value={phoneImportType}
                  onChange={(event) => setPhoneImportType(event.target.value as PhoneImportType)}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {phoneImportOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Report Month">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPhoneImportReportMonth((current) => shiftReportMonthYear(current, -1))}
                      className="btn-secondary h-8 w-8 justify-center p-0"
                      aria-label="Previous report year"
                      title="Previous Year"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-black text-gray-800 dark:text-gray-100">{reportMonthYear}</span>
                    <button
                      type="button"
                      onClick={() => setPhoneImportReportMonth((current) => shiftReportMonthYear(current, 1))}
                      className="btn-secondary h-8 w-8 justify-center p-0"
                      aria-label="Next report year"
                      title="Next Year"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {deviceReportSnapshotsLoading && (
                    <p className="mb-2 rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-100">Checking existing reports...</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                    {reportMonthRailOptions.map((month) => {
                      const alreadyHasReport = existingReportMonthKeys.has(`${selectedPhoneImportOption.label}|${month.value}`);
                      return (
                        <button
                          key={month.value}
                          type="button"
                          onClick={() => setPhoneImportReportMonth(month.value)}
                          className={`rounded px-2 py-2 text-xs font-black uppercase transition ${
                            phoneImportReportMonth === month.value
                              ? 'bg-primary-500 text-white shadow-sm'
                              : alreadyHasReport
                                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900'
                                : 'bg-white text-gray-600 hover:bg-primary-50 hover:text-primary-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                          }`}
                          aria-pressed={phoneImportReportMonth === month.value}
                          title={alreadyHasReport ? `${selectedPhoneImportOption.label} report already exists` : undefined}
                        >
                          <span className="block">{month.label}</span>
                          {alreadyHasReport && <span className={`mt-0.5 block text-[9px] leading-none ${phoneImportReportMonth === month.value ? 'text-white/80' : 'text-amber-600 dark:text-amber-200'}`}>Saved</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Field>
              {selectedExistingReportSnapshot && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  A {selectedPhoneImportOption.label} report already exists for {new Date(`${phoneImportReportMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. Uploading a file here will overwrite that report snapshot.
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-800 dark:bg-gray-950">
                <input
                  type="checkbox"
                  checked={forcePhoneImportInventorySync}
                  onChange={(event) => setForcePhoneImportInventorySync(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="block font-black text-gray-900 dark:text-gray-100">Override into actual inventory</span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Use this report to update live devices even if a newer report already exists.</span>
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setIsPhoneImportSetupOpen(false)} className="btn-secondary" aria-label="Cancel import setup" title="Cancel">
                <span>Cancel</span>
              </button>
              <button type="button" onClick={beginPhoneImport} className="btn-primary" aria-label="Choose report file" title="Choose File">
                <Upload size={16} />
                <span>{selectedExistingReportSnapshot ? 'Overwrite Report' : 'Choose File'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {canDeleteAllDevices && isDeleteAllRecordsConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/45 px-4 pt-[12dvh]">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete All Device Records</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete all phone, MiFi, tablet, and Cradlepoint records? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDeleteAllRecordsConfirmOpen(false)} className="btn-secondary" aria-label="Cancel delete all records" title="Cancel">
                <span>Cancel</span>
              </button>
              <button type="button" onClick={() => void deleteAllDeviceRecords()} className="btn-danger" aria-label="Delete all device records" title="Delete All Records">
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

  const getCountLabel = (count: number) => `${count} device${count === 1 ? '' : 's'}`;

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

      <div className="mt-3 space-y-1.5" role="tree" aria-label="Device inventory filters">
        <button
          type="button"
          onClick={() => onSelect('All', 'All')}
          role="treeitem"
          aria-current={activeType === 'All' && activeStatus === 'All' ? 'page' : undefined}
          className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/10 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            activeType === 'All' && activeStatus === 'All'
              ? 'border-accent bg-accent/10 text-accent shadow-sm before:absolute before:bottom-1 before:left-0 before:top-1 before:w-1 before:rounded-r before:bg-accent'
              : 'border-transparent text-gray-600 dark:text-gray-300'
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary-50 text-primary-500 transition-transform duration-200 group-hover:scale-105 dark:bg-blue-950/40 dark:text-blue-100">
            <Laptop size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">All Devices</span>
            <span className="block text-xs font-semibold text-gray-400 dark:text-gray-500">{getCountLabel(allTotal)}</span>
          </span>
        </button>

        {typeEntries.map(({ type, counts, total }) => {
          const TypeIcon = deviceIconMap[type];
          const isTypeActive = activeType === type && activeStatus === 'All';
          const hasActiveChild = activeType === type && activeStatus !== 'All';
          const statuses = (['Assigned', 'Unassigned', 'Available', 'Maintenance', 'Damaged', 'Lost', 'Retired'] as DeviceStatusFilter[])
            .filter((status) => (counts[status] || 0) > 0);
          const isSubtreeCollapsed = Boolean(collapsedTypes[type]);

          return (
            <div key={type} className="rounded-lg">
              <div className={`group relative flex items-center overflow-hidden rounded-lg border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/10 hover:shadow-sm ${
                isTypeActive
                  ? 'border-accent bg-accent/10 text-accent shadow-sm before:absolute before:bottom-1 before:left-0 before:top-1 before:w-1 before:rounded-r before:bg-accent'
                  : hasActiveChild
                    ? 'border-accent/40 bg-accent/5 text-gray-700 dark:text-gray-200'
                    : 'border-transparent text-gray-600 dark:text-gray-300'
              }`}>
                <button
                  type="button"
                  onClick={() => onSelect(type, 'All')}
                  role="treeitem"
                  aria-current={isTypeActive ? 'page' : undefined}
                  aria-expanded={!isSubtreeCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-700 transition-transform duration-200 group-hover:scale-105 dark:bg-slate-800 dark:text-slate-200">
                    <TypeIcon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{type}</span>
                    <span className="block text-xs font-semibold text-gray-400 dark:text-gray-500">
                      {getCountLabel(total)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleType(type)}
                  className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-expanded={!isSubtreeCollapsed}
                  aria-label={isSubtreeCollapsed ? `Expand ${type} statuses` : `Collapse ${type} statuses`}
                  title={isSubtreeCollapsed ? 'Expand Statuses' : 'Collapse Statuses'}
                >
                  <ChevronRight className={`transition-transform duration-200 ${isSubtreeCollapsed ? '' : 'rotate-90'}`} size={16} />
                </button>
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                  isSubtreeCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  {statuses.length > 0 ? (
                    <div className="ml-5 mt-1.5 space-y-1 border-l border-gray-200 pl-3 dark:border-gray-800" role="group">
                      {statuses.map((status) => {
                        const StatusIcon = getRailIcon(status);
                        const isActive = activeType === type && activeStatus === status;
                        const count = counts[status] || 0;

                        return (
                          <button
                            key={`${type}-${status}`}
                            type="button"
                            onClick={() => onSelect(type, status)}
                            role="treeitem"
                            aria-current={isActive ? 'page' : undefined}
                            tabIndex={isSubtreeCollapsed ? -1 : 0}
                            className={`group/status relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-left text-sm transition-all duration-200 ease-out hover:translate-x-1 hover:border-accent/60 hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                              isActive
                                ? 'border-accent bg-accent/10 text-accent shadow-sm before:absolute before:bottom-1 before:left-0 before:top-1 before:w-1 before:rounded-r before:bg-accent'
                                : 'border-transparent text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-transform duration-200 group-hover/status:scale-105 ${getRailTone(status)}`}>
                              <StatusIcon size={15} />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold">{status}</span>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-black text-gray-600 dark:bg-gray-800 dark:text-gray-200">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ml-5 mt-1.5 border-l border-gray-200 pl-3 dark:border-gray-800" role="group">
                      <div className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500">
                        No counted status yet
                      </div>
                    </div>
                  )}
                </div>
              </div>
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

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={Number(value) || ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={getDeviceInputClass()}
      />
    </Field>
  );
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: string; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={Number(value) || ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={getDeviceInputClass()}
      />
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
