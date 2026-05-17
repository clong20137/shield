import { Router } from 'express';
import { PerformanceEvaluationController } from '../controllers/performanceEvaluationController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/', requireAuthenticated(), PerformanceEvaluationController.list);
router.post('/', requireAuthenticated(), PerformanceEvaluationController.create);
router.post('/:id/sign', requireAuthenticated(), PerformanceEvaluationController.sign);

export default router;
