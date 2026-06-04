import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/userController';
import { profilePictureImportUpload, profilePictureUpload } from '../middleware/profileUpload';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const userSearchLimiter = rateLimit({ keyPrefix: 'users-search', windowMs: 60 * 1000, max: 120, message: 'Too many user searches. Try again shortly.' });
const addressLookupLimiter = rateLimit({ keyPrefix: 'users-address', windowMs: 60 * 1000, max: 60, message: 'Too many address lookups. Try again shortly.' });
const userCreateLimiter = rateLimit({ keyPrefix: 'users-create', windowMs: 15 * 60 * 1000, max: 60, message: 'Too many user creation requests. Try again later.' });
const userImportLimiter = rateLimit({ keyPrefix: 'users-import', windowMs: 60 * 60 * 1000, max: 5, message: 'Too many spreadsheet imports. Try again later.' });
const profilePictureImportLimiter = rateLimit({ keyPrefix: 'users-profile-picture-import', windowMs: 60 * 60 * 1000, max: 3, message: 'Too many profile photo imports. Try again later.' });
const profilePictureLimiter = rateLimit({ keyPrefix: 'users-profile-picture', windowMs: 15 * 60 * 1000, max: 30, message: 'Too many profile picture updates. Try again later.' });
const userMutationLimiter = rateLimit({ keyPrefix: 'users-mutate', windowMs: 15 * 60 * 1000, max: 120, message: 'Too many user update requests. Try again later.' });
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

router.get('/search', userSearchLimiter, requirePermission('users:view'), UserController.searchUsers);
router.get('/all', requirePermission('users:view'), UserController.getAllUsers);
router.get('/address-suggestions', addressLookupLimiter, requirePermission('users:view'), UserController.suggestAddresses);
router.post('/', userCreateLimiter, requirePermission('users:create'), UserController.createUser);
router.post('/import', userImportLimiter, requirePermission('users:create'), spreadsheetUpload.single('spreadsheet'), UserController.importUsers);
router.post('/profile-pictures/import', profilePictureImportLimiter, requirePermission('users:profile-picture'), profilePictureImportUpload.array('photos', 3000), UserController.importProfilePictures);
router.post('/:id/profile-picture', profilePictureLimiter, requireSelfOrPermission((req) => req.params.id, 'users:profile-picture'), profilePictureUpload.single('profilePicture'), UserController.uploadProfilePicture);
router.delete('/:id/profile-picture', profilePictureLimiter, requireSelfOrPermission((req) => req.params.id, 'users:profile-picture'), UserController.removeProfilePicture);
router.get('/:id', requirePermission('users:view'), UserController.getUserById);
router.put('/:id', userMutationLimiter, requireSelfOrPermission((req) => req.params.id, 'users:edit'), UserController.updateUser);
router.delete('/:id', userMutationLimiter, requirePermission('users:edit'), UserController.deleteUser);

export default router;
