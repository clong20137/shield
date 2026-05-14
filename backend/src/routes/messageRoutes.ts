import { Router } from 'express';
import { MessageController } from '../controllers/messageController';

const router = Router();

router.post('/', MessageController.createMessage);
router.get('/inbox/:accountId', MessageController.listInbox);
router.get('/sent/:accountId', MessageController.listSent);
router.get('/user/:userId', MessageController.listMessagesForUser);
router.put('/:id/read', MessageController.markRead);
router.put('/:id/archive', MessageController.archiveMessage);
router.delete('/:id', MessageController.deleteMessage);

export default router;
