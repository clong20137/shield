import { Router } from 'express';
import { AuditController } from '../controllers/auditController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requirePermission('audit:view'), AuditController.listLogs);

export default router;
