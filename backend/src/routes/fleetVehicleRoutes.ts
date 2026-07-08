import { Router } from 'express';
import { FleetVehicleController } from '../controllers/fleetVehicleController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.post('/operators/lookup', requirePermission('fleet:vehicles:manage'), FleetVehicleController.lookupOperatorsByPe);

export default router;
