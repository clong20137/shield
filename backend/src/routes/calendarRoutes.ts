import { Router } from 'express';
import { CalendarController } from '../controllers/calendarController';
import { requirePermission } from '../middleware/permissions';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requirePermission('calendar:manage'), CalendarController.listEntries);
router.get('/profile/:accountId', requireAuthenticated(), CalendarController.listProfileEntries);
router.get('/shortcuts', requirePermission('calendar:manage'), CalendarController.listShortcuts);
router.post('/shortcuts', requirePermission('calendar:manage'), CalendarController.createShortcut);
router.put('/shortcuts/:id', requirePermission('calendar:manage'), CalendarController.updateShortcut);
router.delete('/shortcuts/:id', requirePermission('calendar:manage'), CalendarController.deleteShortcut);
router.post('/', requirePermission('calendar:manage'), CalendarController.createEntry);
router.put('/:id', requirePermission('calendar:manage'), CalendarController.updateEntry);
router.delete('/:id', requirePermission('calendar:manage'), CalendarController.deleteEntry);

export default router;
