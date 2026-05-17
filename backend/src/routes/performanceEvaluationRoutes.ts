import { Router } from 'express';
import { PerformanceEvaluationController } from '../controllers/performanceEvaluationController';

const router = Router();

router.get('/', PerformanceEvaluationController.list);
router.post('/', PerformanceEvaluationController.create);
router.post('/:id/sign', PerformanceEvaluationController.sign);

export default router;
