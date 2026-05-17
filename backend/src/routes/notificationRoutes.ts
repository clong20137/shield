import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), NotificationController.list);
router.put('/:id/read', requireAuthenticated(), NotificationController.markRead);

export default router;
