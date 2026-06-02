import { Router } from 'express';
import { PinnedProfileController } from '../controllers/pinnedProfileController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), PinnedProfileController.list);
router.post('/:userId', requireAuthenticated(), PinnedProfileController.pin);
router.delete('/:userId', requireAuthenticated(), PinnedProfileController.unpin);

export default router;
