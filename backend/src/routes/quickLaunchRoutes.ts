import { Router } from 'express';
import { QuickLaunchController } from '../controllers/quickLaunchController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), QuickLaunchController.getSlots);
router.put('/', requireAuthenticated(), QuickLaunchController.saveSlots);

export default router;
