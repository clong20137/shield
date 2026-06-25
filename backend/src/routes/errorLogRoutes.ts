import { Router } from 'express';
import { ErrorLogController } from '../controllers/errorLogController';
import { requirePermission } from '../middleware/permissions';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.post('/client', requireAuthenticated(), ErrorLogController.createClientLog);
router.get('/', requirePermission('audit:view'), ErrorLogController.list);

export default router;
