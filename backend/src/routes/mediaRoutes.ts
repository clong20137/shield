import { Router } from 'express';
import { MediaController } from '../controllers/mediaController';
import { requireAnyPermission } from '../middleware/permissions';

const router = Router();

router.get('/', requireAnyPermission(['users:profile-picture', 'dashboard:manage']), MediaController.list);

export default router;
