import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { profilePictureUpload } from '../middleware/profileUpload';

const router = Router();

router.get('/search', UserController.searchUsers);
router.get('/all', UserController.getAllUsers);
router.post('/', UserController.createUser);
router.post('/:id/profile-picture', profilePictureUpload.single('profilePicture'), UserController.uploadProfilePicture);
router.get('/:id', UserController.getUserById);
router.put('/:id', UserController.updateUser);
router.delete('/:id', UserController.deleteUser);

export default router;
