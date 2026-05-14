import { Router } from 'express';
import { DashboardPostController } from '../controllers/dashboardPostController';

const router = Router();

router.get('/', DashboardPostController.listPosts);
router.post('/', DashboardPostController.createPost);
router.delete('/:id', DashboardPostController.deletePost);

export default router;
