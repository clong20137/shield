import { Router } from 'express';
import { CalendarController } from '../controllers/calendarController';
import { requirePermission } from '../middleware/permissions';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requirePermission('calendar:manage'), CalendarController.listEntries);
router.get('/profile/:accountId', requireAuthenticated(), CalendarController.listProfileEntries);
router.get('/t-code-options', requirePermission('calendar:manage'), CalendarController.listTCodeOptions);
router.put('/t-code-options', requirePermission('admin:general'), CalendarController.updateTCodeOptions);
router.get('/shortcuts', requirePermission('calendar:manage'), CalendarController.listShortcuts);
router.post('/shortcuts', requirePermission('calendar:manage'), CalendarController.createShortcut);
router.put('/shortcuts/:id', requirePermission('calendar:manage'), CalendarController.updateShortcut);
router.delete('/shortcuts/:id', requirePermission('calendar:manage'), CalendarController.deleteShortcut);
router.post('/autosave', requirePermission('calendar:manage'), CalendarController.autosaveDraft);
router.post('/fleet-bookings/:bookingId', requireAuthenticated(), CalendarController.syncFleetBooking);
router.put('/fleet-bookings/:bookingId', requireAuthenticated(), CalendarController.syncFleetBooking);
router.delete('/fleet-bookings/:bookingId', requireAuthenticated(), CalendarController.deleteFleetBooking);
router.post('/', requirePermission('calendar:manage'), CalendarController.createEntry);
router.put('/:id', requirePermission('calendar:manage'), CalendarController.updateEntry);
router.delete('/:id', requirePermission('calendar:manage'), CalendarController.deleteEntry);

export default router;
