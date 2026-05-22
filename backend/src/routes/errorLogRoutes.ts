import { Router } from 'express';
import { ErrorLogController } from '../controllers/errorLogController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requirePermission('audit:view'), ErrorLogController.list);

export default router;
