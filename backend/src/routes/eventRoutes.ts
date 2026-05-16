import { Router } from 'express';
import { EventController } from '../controllers/eventController';

const router = Router();

router.get('/', EventController.stream);

export default router;
