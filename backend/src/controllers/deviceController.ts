import { Request, Response } from 'express';
import { DeviceModel } from '../models/Device';

function isDuplicateAssetTagError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

export class DeviceController {
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
      const { type, assetTag, makeModel, serialNumber, assignedTo, status, location, notes } = req.body;

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
      });

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
      const { type, assetTag, makeModel, serialNumber, assignedTo, status, location, notes } = req.body;

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
      });

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

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
      const deleted = await DeviceModel.deleteDevice(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: 'Device not found' });
      }

      res.json({ message: 'Device deleted successfully' });
    } catch (error) {
      console.error('Device delete error:', error);
      res.status(500).json({ error: 'Failed to delete device' });
    }
  }
}
