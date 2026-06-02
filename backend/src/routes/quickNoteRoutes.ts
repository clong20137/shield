import { Router } from 'express';
import { QuickNoteController } from '../controllers/quickNoteController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), QuickNoteController.get);
router.put('/', requireAuthenticated(), QuickNoteController.save);

export default router;
