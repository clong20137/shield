import { Router } from 'express';
import multer from 'multer';
import { MediaController } from '../controllers/mediaController';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';

const router = Router();
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 300,
  },
});

router.get('/', requireAnyPermission(['media:view', 'media:upload', 'media:edit', 'media:delete', 'users:profile-picture', 'account:profile-picture', 'dashboard:create', 'dashboard:edit', 'dashboard:manage']), MediaController.list);
router.post('/folders', requirePermission('media:edit'), MediaController.createFolder);
router.put('/folders', requirePermission('media:edit'), MediaController.renameFolder);
router.delete('/folders', requirePermission('media:delete'), MediaController.deleteFolder);
router.put('/folders/:folder', requirePermission('media:edit'), MediaController.renameFolder);
router.delete('/folders/:folder', requirePermission('media:delete'), MediaController.deleteFolder);
router.post('/images', requireAnyPermission(['media:upload', 'dashboard:create', 'dashboard:edit', 'dashboard:manage']), mediaUpload.array('images', 300), MediaController.uploadImages);
router.put('/images/rename', requirePermission('media:edit'), MediaController.renameImage);
router.post('/images/move', requirePermission('media:edit'), MediaController.moveImages);
router.post('/images/delete', requirePermission('media:delete'), MediaController.deleteImages);
router.delete('/profile-pictures', requirePermission('media:delete'), MediaController.deleteAllProfilePictures);
router.put('/images/:folder/:fileName', requirePermission('media:edit'), MediaController.renameImage);
router.delete('/images/:folder/:fileName', requirePermission('media:delete'), MediaController.deleteImage);

export default router;
