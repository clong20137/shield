import { Router } from 'express';
import multer from 'multer';
import { NotificationSoundController } from '../controllers/notificationSoundController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();
const soundUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

router.get('/', requireAuthenticated(), NotificationSoundController.list);
router.post('/', requirePermission('admin:general'), soundUpload.single('sound'), NotificationSoundController.upload);
router.delete('/:id', requirePermission('admin:general'), NotificationSoundController.remove);

export default router;
