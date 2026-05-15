import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAnyPermission, requirePermission, requireSelfOrPermission } from '../middleware/permissions';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/session', AuthController.getSession);
router.post('/logout', AuthController.logout);
router.post('/change-password', requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), AuthController.changePassword);
router.post('/2fa/setup', requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), AuthController.setupTwoFactor);
router.post('/2fa/enable', requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), AuthController.enableTwoFactor);
router.post('/2fa/disable', requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), AuthController.disableTwoFactor);
router.get('/accounts', requireAnyPermission(['roles:manage', 'devices:manage']), AuthController.listAccounts);
router.put('/accounts/:accountId/role', requirePermission('roles:manage'), AuthController.updateRole);
router.put('/accounts/:accountId/message-preferences', requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), AuthController.updateMessagePreferences);
router.get('/roles', requirePermission('roles:manage'), AuthController.listRoles);
router.post('/roles', requirePermission('roles:manage'), AuthController.createRole);

export default router;
