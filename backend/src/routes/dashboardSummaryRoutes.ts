import { Router } from 'express';
import { DashboardSummaryController } from '../controllers/dashboardSummaryController';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/summary', requireAuthenticated(), DashboardSummaryController.getSummary);

export default router;
