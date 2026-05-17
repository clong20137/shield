import { Router } from 'express';
import { MileageController } from '../controllers/mileageController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/summary', requireAuthenticated(), MileageController.getSummary);
router.put('/milestone', requirePermission('roles:manage'), MileageController.updateMilestone);

export default router;
