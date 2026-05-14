import { Router } from 'express';
import { CalendarController } from '../controllers/calendarController';

const router = Router();

router.get('/', CalendarController.listEntries);
router.post('/', CalendarController.createEntry);
router.delete('/:id', CalendarController.deleteEntry);

export default router;
