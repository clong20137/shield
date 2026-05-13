import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/change-password', AuthController.changePassword);
router.post('/2fa/setup', AuthController.setupTwoFactor);
router.post('/2fa/enable', AuthController.enableTwoFactor);
router.post('/2fa/disable', AuthController.disableTwoFactor);

export default router;
