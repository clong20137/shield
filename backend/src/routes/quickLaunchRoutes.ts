import { Router } from 'express';
import { QuickLaunchController } from '../controllers/quickLaunchController';

const router = Router();

router.get('/', QuickLaunchController.getSlots);
router.put('/', QuickLaunchController.saveSlots);

export default router;
