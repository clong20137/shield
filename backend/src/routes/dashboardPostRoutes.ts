import { Router } from 'express';
import { DashboardPostController } from '../controllers/dashboardPostController';
import { dashboardPostImageUpload } from '../middleware/dashboardPostUpload';
import { requireAuthenticated } from '../middleware/authSession';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';

const router = Router();

router.get('/', requireAuthenticated(), DashboardPostController.listPosts);
router.post('/', requireAnyPermission(['dashboard:create', 'dashboard:manage']), DashboardPostController.createPost);
router.post('/images', requireAnyPermission(['dashboard:create', 'dashboard:edit', 'dashboard:manage']), dashboardPostImageUpload.single('image'), DashboardPostController.uploadImage);
router.get('/:id', requireAuthenticated(), DashboardPostController.getPost);
router.get('/:id/comments', requireAuthenticated(), DashboardPostController.listComments);
router.post('/:id/comments', requireAuthenticated(), DashboardPostController.createComment);
router.post('/:id/comments/:commentId/flag', requireAuthenticated(), DashboardPostController.flagComment);
router.delete('/:id/comments/:commentId/flag', requirePermission('dashboard:manage'), DashboardPostController.unflagComment);
router.put('/:id/comments/:commentId/pin', requirePermission('dashboard:manage'), DashboardPostController.setCommentPinned);
router.put('/:id/comments/:commentId/highlight', requirePermission('dashboard:manage'), DashboardPostController.setCommentAdminHighlighted);
router.put('/:id/comments/:commentId', requireAuthenticated(), DashboardPostController.updateComment);
router.delete('/:id/comments/:commentId', requireAuthenticated(), DashboardPostController.deleteComment);
router.put('/:id', requireAnyPermission(['dashboard:edit', 'dashboard:manage']), DashboardPostController.updatePost);
router.put('/:id/reaction', requireAuthenticated(), DashboardPostController.setReaction);
router.delete('/:id', requireAnyPermission(['dashboard:delete', 'dashboard:manage']), DashboardPostController.deletePost);

export default router;
