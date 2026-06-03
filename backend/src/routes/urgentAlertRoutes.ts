import { Router } from 'express';
import { UrgentAlertController } from '../controllers/urgentAlertController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const sendAlertLimiter = rateLimit({ keyPrefix: 'urgent-alert-send', windowMs: 15 * 60 * 1000, max: 20, message: 'Too many urgent alerts sent. Try again later.' });

router.get('/', requireAuthenticated(), UrgentAlertController.listPending);
router.get('/recent', requirePermission('alerts:send'), UrgentAlertController.listRecent);
router.post('/', sendAlertLimiter, requirePermission('alerts:send'), UrgentAlertController.create);
router.put('/:id/acknowledge', requireAuthenticated(), UrgentAlertController.acknowledge);

export default router;
