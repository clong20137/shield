import { Router } from 'express';
import { DeviceController } from '../controllers/deviceController';

const router = Router();

router.get('/', DeviceController.listDevices);
router.post('/', DeviceController.createDevice);
router.get('/:id/history', DeviceController.listDeviceEvents);
router.post('/:id/history', DeviceController.addDeviceEvent);
router.put('/:id', DeviceController.updateDevice);
router.delete('/:id', DeviceController.deleteDevice);

export default router;
