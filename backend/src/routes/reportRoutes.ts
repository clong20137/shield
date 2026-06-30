import { Router } from 'express';
import { ReportController } from '../controllers/reportController';
import { requirePermission } from '../middleware/permissions';
import { requireAuthenticated } from '../middleware/authSession';

const router = Router();

router.get('/trooper-dailies', requireAuthenticated(), ReportController.getTrooperDailies);
router.get('/trooper-dailies/analytics', requireAuthenticated(), ReportController.getTrooperDailyAnalytics);
router.put('/trooper-dailies/:id/review', requireAuthenticated(), ReportController.reviewTrooperDaily);
router.get('/access-review', requirePermission('audit:view'), ReportController.getAccessReview);
router.get('/by-rank', requirePermission('users:view'), ReportController.getUsersByRank);
router.get('/by-district', requirePermission('users:view'), ReportController.getUsersByDistrict);
router.get('/by-employment-type', requirePermission('users:view'), ReportController.getUsersByEmploymentType);
router.get('/statistics', requirePermission('users:view'), ReportController.getSystemStatistics);
router.get('/detailed', requirePermission('users:view'), ReportController.getDetailedReport);

export default router;
