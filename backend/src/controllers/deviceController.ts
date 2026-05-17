import { Request, Response } from 'express';
import { DeviceModel } from '../models/Device';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';

function isDuplicateAssetTagError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
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
      const {
        type,
        assetTag,
        makeModel,
        serialNumber,
        assignedTo,
        status,
        location,
        notes,
        phoneNumber,
        imei,
        simNumber,
        radioId,
        hostname,
        routerId,
        warrantyExpiration,
        replacementDueDate,
        maintenanceDueDate,
        lastServiceDate,
        purchaseDate,
        condition,
        actorId,
        actorName,
        eventNotes,
      } = req.body;

      if (!type || !assetTag || !makeModel) {
        return res.status(400).json({ error: 'Device type, asset tag, and make/model are required' });
      }

      const device = await DeviceModel.createDevice({
        type,
        assetTag,
        makeModel,
        serialNumber: serialNumber || '',
        assignedTo: assignedTo || '',
        status: status || 'Available',
        location: location || '',
        notes: notes || '',
        phoneNumber: phoneNumber || '',
        imei: imei || '',
        simNumber: simNumber || '',
        radioId: radioId || '',
        hostname: hostname || '',
        routerId: routerId || '',
        warrantyExpiration: warrantyExpiration || '',
        replacementDueDate: replacementDueDate || '',
        maintenanceDueDate: maintenanceDueDate || '',
        lastServiceDate: lastServiceDate || '',
        purchaseDate: purchaseDate || '',
        condition: condition || 'Good',
      }, {
        actorId,
        actorName,
        notes: eventNotes,
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
      const {
        type,
        assetTag,
        makeModel,
        serialNumber,
        assignedTo,
        status,
        location,
        notes,
        phoneNumber,
        imei,
        simNumber,
        radioId,
        hostname,
        routerId,
        warrantyExpiration,
        replacementDueDate,
        maintenanceDueDate,
        lastServiceDate,
        purchaseDate,
        condition,
        actorId,
        actorName,
        eventAction,
        eventNotes,
      } = req.body;

      if (!type || !assetTag || !makeModel) {
        return res.status(400).json({ error: 'Device type, asset tag, and make/model are required' });
      }

      const device = await DeviceModel.updateDevice(req.params.id, {
        type,
        assetTag,
        makeModel,
        serialNumber: serialNumber || '',
        assignedTo: assignedTo || '',
        status: status || 'Available',
        location: location || '',
        notes: notes || '',
        phoneNumber: phoneNumber || '',
        imei: imei || '',
        simNumber: simNumber || '',
        radioId: radioId || '',
        hostname: hostname || '',
        routerId: routerId || '',
        warrantyExpiration: warrantyExpiration || '',
        replacementDueDate: replacementDueDate || '',
        maintenanceDueDate: maintenanceDueDate || '',
        lastServiceDate: lastServiceDate || '',
        purchaseDate: purchaseDate || '',
        condition: condition || 'Good',
      }, {
        action: eventAction || 'Updated',
        actorId,
        actorName,
        assignedTo,
        status,
        notes: eventNotes,
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
        actorId: req.body?.actorId,
        actorName: req.body?.actorName,
        notes: req.body?.eventNotes,
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

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const event = await DeviceModel.createEvent(req.params.id, {
        action,
        actorId,
        actorName,
        assignedTo,
        status,
        notes,
      });

      broadcastAppEvent({ type: 'device-updated', entityId: req.params.id });
      res.status(201).json(event);
    } catch (error) {
      console.error('Device event create error:', error);
      res.status(500).json({ error: 'Failed to add device history event' });
    }
  }
}
