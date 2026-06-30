import { Router } from 'express';
import { MemorialProfileController } from '../controllers/memorialProfileController';
import { memorialPhotoUpload } from '../middleware/memorialUpload';
import { requirePermission } from '../middleware/permissions';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const memorialMutationLimiter = rateLimit({ keyPrefix: 'memorial-mutate', windowMs: 15 * 60 * 1000, max: 120, message: 'Too many memorial updates. Try again later.' });
const memorialUploadLimiter = rateLimit({ keyPrefix: 'memorial-photo', windowMs: 15 * 60 * 1000, max: 40, message: 'Too many memorial photo uploads. Try again later.' });

router.get('/', requirePermission('users:view'), MemorialProfileController.list);
router.post('/', memorialMutationLimiter, requirePermission('users:edit'), MemorialProfileController.create);
router.put('/:id', memorialMutationLimiter, requirePermission('users:edit'), MemorialProfileController.update);
router.delete('/:id', memorialMutationLimiter, requirePermission('users:edit'), MemorialProfileController.delete);
router.post('/photo', memorialUploadLimiter, requirePermission('users:edit'), memorialPhotoUpload.single('photo'), MemorialProfileController.uploadPhoto);

export default router;
