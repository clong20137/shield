import { Router } from 'express';
import { MileageController } from '../controllers/mileageController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/summary', requireAuthenticated(), MileageController.getSummary);
router.get('/summary/:accountId', requireAuthenticated(), MileageController.getSummaryForAccount);
router.get('/achievements', requireAuthenticated(), MileageController.listAchievements);
router.post('/achievements', requirePermission('roles:manage'), MileageController.createAchievement);
router.put('/achievements/:id', requirePermission('roles:manage'), MileageController.updateAchievement);
router.delete('/achievements/:id', requirePermission('roles:manage'), MileageController.deleteAchievement);
router.put('/milestone', requirePermission('roles:manage'), MileageController.updateMilestone);

export default router;
