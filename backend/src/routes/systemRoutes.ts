import { Router } from 'express';
import { SystemController } from '../controllers/systemController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.post('/restart-api', requirePermission('admin:general'), SystemController.restartApi);

export default router;
