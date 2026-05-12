import { Router } from 'express';
import { ReportController } from '../controllers/reportController';

const router = Router();

router.get('/by-rank', ReportController.getUsersByRank);
router.get('/by-district', ReportController.getUsersByDistrict);
router.get('/by-employment-type', ReportController.getUsersByEmploymentType);
router.get('/statistics', ReportController.getSystemStatistics);
router.get('/detailed', ReportController.getDetailedReport);

export default router;
