import { Router } from 'express';
import multer from 'multer';
import { FleetVehicleController } from '../controllers/fleetVehicleController';
import { requirePermission } from '../middleware/permissions';

const router = Router();

const vehiclePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only PDF uploads are allowed'));
  },
});

router.get('/vehicles', requirePermission('fleet:vehicles:manage'), FleetVehicleController.list);
router.post('/vehicles/import', requirePermission('fleet:vehicles:manage'), vehiclePdfUpload.single('file'), FleetVehicleController.importPdf);

export default router;
