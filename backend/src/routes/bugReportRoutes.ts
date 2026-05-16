import { Router } from 'express';
import { BugReportController } from '../controllers/bugReportController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.post('/', BugReportController.create);
router.get('/', requirePermission('bugs:manage'), BugReportController.list);
router.put('/:id/status', requirePermission('bugs:manage'), BugReportController.updateStatus);

export default router;
