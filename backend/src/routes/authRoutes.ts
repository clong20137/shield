import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/session', AuthController.getSession);
router.post('/logout', AuthController.logout);
router.post('/change-password', AuthController.changePassword);
router.post('/2fa/setup', AuthController.setupTwoFactor);
router.post('/2fa/enable', AuthController.enableTwoFactor);
router.post('/2fa/disable', AuthController.disableTwoFactor);
router.get('/accounts', AuthController.listAccounts);
router.put('/accounts/:accountId/role', AuthController.updateRole);
router.put('/accounts/:accountId/message-preferences', AuthController.updateMessagePreferences);
router.get('/roles', AuthController.listRoles);
router.post('/roles', AuthController.createRole);

export default router;
