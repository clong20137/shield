import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/userController';
import { profilePictureUpload } from '../middleware/profileUpload';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';

const router = Router();
const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const fileName = file.originalname.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only Excel spreadsheets are allowed'));
  },
});

router.get('/search', requirePermission('users:view'), UserController.searchUsers);
router.get('/all', requirePermission('users:view'), UserController.getAllUsers);
router.get('/address-suggestions', requirePermission('users:view'), UserController.suggestAddresses);
router.post('/', requirePermission('users:create'), UserController.createUser);
router.post('/import', requirePermission('users:create'), spreadsheetUpload.single('spreadsheet'), UserController.importUsers);
router.post('/:id/profile-picture', requireSelfOrPermission((req) => req.params.id, 'users:profile-picture'), profilePictureUpload.single('profilePicture'), UserController.uploadProfilePicture);
router.delete('/:id/profile-picture', requireSelfOrPermission((req) => req.params.id, 'users:profile-picture'), UserController.removeProfilePicture);
router.get('/:id', requirePermission('users:view'), UserController.getUserById);
router.put('/:id', requireSelfOrPermission((req) => req.params.id, 'users:edit'), UserController.updateUser);
router.delete('/:id', requirePermission('users:edit'), UserController.deleteUser);

export default router;
