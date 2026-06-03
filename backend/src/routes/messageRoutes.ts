import { Router } from 'express';
import { MessageController } from '../controllers/messageController';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const messageSendLimiter = rateLimit({ keyPrefix: 'messages-send', windowMs: 60 * 1000, max: 60, message: 'Too many messages sent. Try again shortly.' });
const messageReadLimiter = rateLimit({ keyPrefix: 'messages-read', windowMs: 60 * 1000, max: 180, message: 'Too many message requests. Try again shortly.' });
const messageTypingLimiter = rateLimit({ keyPrefix: 'messages-typing', windowMs: 60 * 1000, max: 180, message: 'Too many typing updates. Try again shortly.' });
const messageMutationLimiter = rateLimit({ keyPrefix: 'messages-mutate', windowMs: 60 * 1000, max: 120, message: 'Too many message updates. Try again shortly.' });

router.get('/events', MessageController.streamEvents);
router.post('/', messageSendLimiter, requirePermission('messages:send'), requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.createMessage);
router.get('/inbox/:accountId', messageReadLimiter, requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listInbox);
router.get('/sent/:accountId', messageReadLimiter, requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listSent);
router.get('/user/:userId', messageReadLimiter, requireSelfOrPermission((req) => req.params.userId, 'roles:manage'), MessageController.listMessagesForUser);
router.post('/typing', messageTypingLimiter, requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.typing);
router.put('/:id/read', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.markRead);
router.put('/:id/reaction', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.setReaction);
router.put('/:id/archive', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.archiveMessage);
router.delete('/:id', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.deleteMessage);

export default router;
