import { Router } from 'express';
import { DashboardPostController } from '../controllers/dashboardPostController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requireAuthenticated(), DashboardPostController.listPosts);
router.post('/', requirePermission('dashboard:manage'), DashboardPostController.createPost);
router.delete('/:id', requirePermission('dashboard:manage'), DashboardPostController.deletePost);

export default router;
