import { Router } from 'express';
import { CalendarController } from '../controllers/calendarController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requirePermission('calendar:manage'), CalendarController.listEntries);
router.post('/', requirePermission('calendar:manage'), CalendarController.createEntry);
router.put('/:id', requirePermission('calendar:manage'), CalendarController.updateEntry);
router.delete('/:id', requirePermission('calendar:manage'), CalendarController.deleteEntry);

export default router;
