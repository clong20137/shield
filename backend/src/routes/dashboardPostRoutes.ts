import { Router } from 'express';
import { DashboardPostController } from '../controllers/dashboardPostController';
import { requireAuthenticated } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requireAuthenticated(), DashboardPostController.listPosts);
router.post('/', requirePermission('dashboard:manage'), DashboardPostController.createPost);
router.get('/:id', requireAuthenticated(), DashboardPostController.getPost);
router.get('/:id/comments', requireAuthenticated(), DashboardPostController.listComments);
router.post('/:id/comments', requireAuthenticated(), DashboardPostController.createComment);
router.post('/:id/comments/:commentId/flag', requireAuthenticated(), DashboardPostController.flagComment);
router.delete('/:id/comments/:commentId/flag', requirePermission('dashboard:manage'), DashboardPostController.unflagComment);
router.put('/:id/comments/:commentId/pin', requirePermission('dashboard:manage'), DashboardPostController.setCommentPinned);
router.delete('/:id/comments/:commentId', requirePermission('dashboard:manage'), DashboardPostController.deleteComment);
router.put('/:id', requirePermission('dashboard:manage'), DashboardPostController.updatePost);
router.put('/:id/reaction', requireAuthenticated(), DashboardPostController.setReaction);
router.delete('/:id', requirePermission('dashboard:manage'), DashboardPostController.deletePost);

export default router;
