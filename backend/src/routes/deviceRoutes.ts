import { Router } from 'express';
import { DeviceController } from '../controllers/deviceController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requirePermission('devices:manage'), DeviceController.listDevices);
router.post('/', requirePermission('devices:manage'), DeviceController.createDevice);
router.get('/:id/history', requirePermission('devices:manage'), DeviceController.listDeviceEvents);
router.post('/:id/history', requirePermission('devices:manage'), DeviceController.addDeviceEvent);
router.put('/:id', requirePermission('devices:manage'), DeviceController.updateDevice);
router.delete('/:id', requirePermission('devices:manage'), DeviceController.deleteDevice);

export default router;
