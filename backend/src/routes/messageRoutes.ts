import { Router } from 'express';
import { MessageController } from '../controllers/messageController';

const router = Router();

router.post('/', MessageController.createMessage);
router.get('/user/:userId', MessageController.listMessagesForUser);

export default router;
