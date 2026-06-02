import { Router } from 'express';
import { ReminderController } from '../controllers/reminderController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), ReminderController.list);
router.post('/', requireAuthenticated(), ReminderController.create);
router.put('/:id', requireAuthenticated(), ReminderController.update);
router.delete('/:id', requireAuthenticated(), ReminderController.delete);

export default router;
