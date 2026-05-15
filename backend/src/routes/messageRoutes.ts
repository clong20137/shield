import { Router } from 'express';
import { MessageController } from '../controllers/messageController';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';

const router = Router();

router.post('/', requirePermission('messages:send'), requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.createMessage);
router.get('/inbox/:accountId', requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listInbox);
router.get('/sent/:accountId', requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listSent);
router.get('/user/:userId', requireSelfOrPermission((req) => req.params.userId, 'roles:manage'), MessageController.listMessagesForUser);
router.put('/:id/read', requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.markRead);
router.put('/:id/archive', requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.archiveMessage);
router.delete('/:id', requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.deleteMessage);

export default router;
