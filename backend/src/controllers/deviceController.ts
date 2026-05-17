import { Request, Response } from 'express';
import { DeviceModel } from '../models/Device';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { cleanMultiline, cleanString, isOneOf, isValidIsoDate, isValidPhone, normalizePhone } from '../utils/validation';

function isDuplicateAssetTagError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

const deviceTypes = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio', 'Cradlepoint'] as const;
const deviceStatuses = ['Available', 'Assigned', 'Maintenance', 'Retired', 'Damaged', 'Lost'] as const;
const deviceConditions = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const;

function validateDevicePayload(body: Record<string, unknown>) {
  const type = cleanString(body.type, 50);
  const assetTag = cleanString(body.assetTag, 100);
  const makeModel = cleanString(body.makeModel, 150);
  const status = cleanString(body.status, 50) || 'Available';
  const condition = cleanString(body.condition, 50) || 'Good';
  const phoneNumber = normalizePhone(body.phoneNumber);
  const dateFields = ['warrantyExpiration', 'replacementDueDate', 'maintenanceDueDate', 'lastServiceDate', 'purchaseDate'] as const;
  const dates = Object.fromEntries(dateFields.map((field) => [field, cleanString(body[field], 20)])) as Record<typeof dateFields[number], string>;

  if (!type || !assetTag || !makeModel) {
    return { error: 'Device type, asset tag, and make/model are required' };
  }

  if (!isOneOf(type, deviceTypes)) {
    return { error: 'Choose a valid device type' };
  }

  if (!isOneOf(status, deviceStatuses)) {
    return { error: 'Choose a valid device status' };
  }

  if (!isOneOf(condition, deviceConditions)) {
    return { error: 'Choose a valid device condition' };
  }

  if (!isValidPhone(phoneNumber)) {
    return { error: 'Device phone number must be a valid 10-digit phone number' };
  }

  for (const field of dateFields) {
    if (dates[field] && !isValidIsoDate(dates[field])) {
      return { error: `${field} must use YYYY-MM-DD format` };
    }
  }

  return {
    value: {
      type,
      assetTag,
      makeModel,
      serialNumber: cleanString(body.serialNumber, 150),
      assignedTo: cleanString(body.assignedTo, 150),
      status,
      location: cleanString(body.location, 150),
      notes: cleanMultiline(body.notes, 5000),
      phoneNumber,
      imei: cleanString(body.imei, 100),
      simNumber: cleanString(body.simNumber, 100),
      radioId: cleanString(body.radioId, 100),
      hostname: cleanString(body.hostname, 150),
      routerId: cleanString(body.routerId, 150),
      warrantyExpiration: dates.warrantyExpiration,
      replacementDueDate: dates.replacementDueDate,
      maintenanceDueDate: dates.maintenanceDueDate,
      lastServiceDate: dates.lastServiceDate,
      purchaseDate: dates.purchaseDate,
      condition,
    },
  };
}

export class DeviceController {
  static async listAssignedDevices(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const devices = await DeviceModel.listAssignedDevices(account);
      res.json(devices);
    } catch (error) {
      console.error('Assigned device list error:', error);
      res.status(500).json({ error: 'Failed to load assigned devices' });
    }
  }

  static async listDevices(req: Request, res: Response) {
    try {
      const devices = await DeviceModel.listDevices();
      res.json(devices);
    } catch (error) {
      console.error('Device list error:', error);
      res.status(500).json({ error: 'Failed to load devices' });
    }
  }

  static async createDevice(req: Request, res: Response) {
    try {
      const { actorId, actorName, eventNotes } = req.body;
      const validation = validateDevicePayload(req.body);

      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid device data' });
      }

      const device = await DeviceModel.createDevice(validation.value, {
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        notes: cleanMultiline(eventNotes, 2000),
      });

      broadcastAppEvent({ type: 'device-updated', entityId: device.id });
      res.status(201).json(device);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A device with that asset tag already exists' });
      }

      console.error('Device create error:', error);
      res.status(500).json({ error: 'Failed to create device' });
    }
  }

  static async updateDevice(req: Request, res: Response) {
    try {
      const { actorId, actorName, eventAction, eventNotes } = req.body;
      const validation = validateDevicePayload(req.body);

      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid device data' });
      }

      const device = await DeviceModel.updateDevice(req.params.id, validation.value, {
        action: cleanString(eventAction, 100) || 'Updated',
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        assignedTo: validation.value.assignedTo,
        status: validation.value.status,
        notes: cleanMultiline(eventNotes, 2000),
      });

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      broadcastAppEvent({ type: 'device-updated', entityId: device.id });
      res.json(device);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A device with that asset tag already exists' });
      }

      console.error('Device update error:', error);
      res.status(500).json({ error: 'Failed to update device' });
    }
  }

  static async deleteDevice(req: Request, res: Response) {
    try {
      const deleted = await DeviceModel.deleteDevice(req.params.id, {
        actorId: cleanString(req.body?.actorId, 36),
        actorName: cleanString(req.body?.actorName, 150),
        notes: cleanMultiline(req.body?.eventNotes, 2000),
      });

      if (!deleted) {
        return res.status(404).json({ error: 'Device not found' });
      }

      broadcastAppEvent({ type: 'device-updated', entityId: req.params.id });
      res.json({ message: 'Device deleted successfully' });
    } catch (error) {
      console.error('Device delete error:', error);
      res.status(500).json({ error: 'Failed to delete device' });
    }
  }

  static async listDeviceEvents(req: Request, res: Response) {
    try {
      const events = await DeviceModel.listEvents(req.params.id);
      res.json(events);
    } catch (error) {
      console.error('Device events error:', error);
      res.status(500).json({ error: 'Failed to load device history' });
    }
  }

  static async addDeviceEvent(req: Request, res: Response) {
    try {
      const { action, actorId, actorName, assignedTo, status, notes } = req.body;
      const cleanAction = cleanString(action, 100);
      const cleanStatus = cleanString(status, 50);

      if (!cleanAction) {
        return res.status(400).json({ error: 'Action is required' });
      }

      if (cleanStatus && !isOneOf(cleanStatus, deviceStatuses)) {
        return res.status(400).json({ error: 'Choose a valid device status' });
      }

      const event = await DeviceModel.createEvent(req.params.id, {
        action: cleanAction,
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        assignedTo: cleanString(assignedTo, 150),
        status: cleanStatus,
        notes: cleanMultiline(notes, 2000),
      });

      broadcastAppEvent({ type: 'device-updated', entityId: req.params.id });
      res.status(201).json(event);
    } catch (error) {
      console.error('Device event create error:', error);
      res.status(500).json({ error: 'Failed to add device history event' });
    }
  }
}
