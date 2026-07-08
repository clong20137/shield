import { Router } from 'express';
import multer from 'multer';
import { FleetVehicleController } from '../controllers/fleetVehicleController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

const vehicleSpreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const fileName = file.originalname.toLowerCase();
    const isSpreadsheet = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    if (isSpreadsheet) {
      callback(null, true);
      return;
    }

    callback(new Error('Only XLSX or XLS uploads are allowed'));
  },
});

router.get('/vehicles', requirePermission('fleet:vehicles:manage'), FleetVehicleController.list);
router.post(
  '/vehicles/import',
  requirePermission('fleet:vehicles:manage'),
  vehicleSpreadsheetUpload.single('file'),
  FleetVehicleController.importSpreadsheet,
);

export default router;
