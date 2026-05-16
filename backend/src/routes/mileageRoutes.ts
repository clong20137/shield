import { Router } from 'express';
import { MileageController } from '../controllers/mileageController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/summary', MileageController.getSummary);
router.put('/milestone', requirePermission('roles:manage'), MileageController.updateMilestone);

export default router;
