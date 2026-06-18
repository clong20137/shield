import { Router } from 'express';
import { DistrictFeedController } from '../controllers/districtFeedController';
import { requireAuthenticated } from '../middleware/authSession';
import { requireAnyPermission } from '../middleware/permissions';

const router = Router();

router.post('/posts', requireAuthenticated(), requireAnyPermission(['district-feed:post', 'dashboard:manage']), DistrictFeedController.createPost);
router.put('/posts/:id', requireAuthenticated(), requireAnyPermission(['district-feed:post', 'dashboard:manage']), DistrictFeedController.updatePost);
router.delete('/posts/:id', requireAuthenticated(), requireAnyPermission(['district-feed:post', 'dashboard:manage']), DistrictFeedController.deletePost);

export default router;
