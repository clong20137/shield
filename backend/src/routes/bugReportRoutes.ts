import { Router } from 'express';
import { BugReportController } from '../controllers/bugReportController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.post('/', requireAuthenticated(), BugReportController.create);
router.get('/', requirePermission('bugs:manage'), BugReportController.list);
router.put('/:id/status', requirePermission('bugs:manage'), BugReportController.updateStatus);

export default router;
