import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';

const router = Router();

router.get('/', NotificationController.list);
router.put('/:id/read', NotificationController.markRead);

export default router;
