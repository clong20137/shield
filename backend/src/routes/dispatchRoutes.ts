import { Router } from 'express';
import { DispatchController } from '../controllers/dispatchController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/active', requireAuthenticated(), DispatchController.getActiveSummary);
router.post('/calls/:callId/assign', requireAuthenticated(), DispatchController.assignSelf);
router.put('/assignments/:assignmentId/status', requireAuthenticated(), DispatchController.updateAssignmentStatus);
router.post('/assignments/:assignmentId/location', requireAuthenticated(), DispatchController.recordLocation);

export default router;
