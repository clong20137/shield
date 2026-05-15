import { Router } from 'express';
import { DashboardPostController } from '../controllers/dashboardPostController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', DashboardPostController.listPosts);
router.post('/', requirePermission('dashboard:manage'), DashboardPostController.createPost);
router.delete('/:id', requirePermission('dashboard:manage'), DashboardPostController.deletePost);

export default router;
