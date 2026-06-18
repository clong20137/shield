import { Router } from 'express';
import { DistrictFeedController } from '../controllers/districtFeedController';
import { requireAuthenticated } from '../middleware/authSession';
import { requireAnyPermission } from '../middleware/permissions';

const router = Router();

router.post('/posts', requireAuthenticated(), requireAnyPermission(['district-feed:post', 'dashboard:manage']), DistrictFeedController.createPost);

export default router;
