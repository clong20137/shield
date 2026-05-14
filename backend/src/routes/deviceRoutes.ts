import { Router } from 'express';
import { DeviceController } from '../controllers/deviceController';

const router = Router();

router.get('/', DeviceController.listDevices);
router.post('/', DeviceController.createDevice);
router.put('/:id', DeviceController.updateDevice);
router.delete('/:id', DeviceController.deleteDevice);

export default router;
