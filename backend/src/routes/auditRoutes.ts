import { Router } from 'express';
import { AuditController } from '../controllers/auditController';

const router = Router();

router.get('/', AuditController.listLogs);

export default router;
