import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { profilePictureUpload } from '../middleware/profileUpload';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';

const router = Router();

router.get('/search', requirePermission('users:view'), UserController.searchUsers);
router.get('/all', requirePermission('users:view'), UserController.getAllUsers);
router.post('/', requirePermission('users:create'), UserController.createUser);
router.post('/:id/profile-picture', requireSelfOrPermission((req) => req.params.id, 'users:edit'), profilePictureUpload.single('profilePicture'), UserController.uploadProfilePicture);
router.delete('/:id/profile-picture', requireSelfOrPermission((req) => req.params.id, 'users:edit'), UserController.removeProfilePicture);
router.get('/:id', requirePermission('users:view'), UserController.getUserById);
router.put('/:id', requireSelfOrPermission((req) => req.params.id, 'users:edit'), UserController.updateUser);
router.delete('/:id', requirePermission('users:edit'), UserController.deleteUser);

export default router;
