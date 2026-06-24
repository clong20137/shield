import { Router } from 'express';
import { MessageController } from '../controllers/messageController';
import { requirePermission, requireSelfOrPermission } from '../middleware/permissions';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuthenticated } from '../middleware/authSession';
import { messageAttachmentUpload, messageImageUpload } from '../middleware/messageUpload';

const router = Router();
const messageSendLimiter = rateLimit({ keyPrefix: 'messages-send', windowMs: 60 * 1000, max: 60, message: 'Too many messages sent. Try again shortly.' });
const messageReadLimiter = rateLimit({ keyPrefix: 'messages-read', windowMs: 60 * 1000, max: 180, message: 'Too many message requests. Try again shortly.' });
const messageTypingLimiter = rateLimit({ keyPrefix: 'messages-typing', windowMs: 60 * 1000, max: 180, message: 'Too many typing updates. Try again shortly.' });
const messagePresenceLimiter = rateLimit({ keyPrefix: 'messages-presence', windowMs: 60 * 1000, max: 90, message: 'Too many presence updates. Try again shortly.' });
const messageMutationLimiter = rateLimit({ keyPrefix: 'messages-mutate', windowMs: 60 * 1000, max: 120, message: 'Too many message updates. Try again shortly.' });

router.get('/events', MessageController.streamEvents);
router.post('/presence', messagePresenceLimiter, requireAuthenticated(), MessageController.updatePresence);
router.post('/', messageSendLimiter, requirePermission('messages:send'), requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.createMessage);
router.post('/group', messageSendLimiter, requirePermission('messages:send'), requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.createGroupMessage);
router.post('/images', messageMutationLimiter, requirePermission('messages:send'), messageImageUpload.single('image'), MessageController.uploadImage);
router.post('/attachments', messageMutationLimiter, requirePermission('messages:send'), messageAttachmentUpload.single('attachment'), MessageController.uploadAttachment);
router.put('/thread/:threadId/title', messageMutationLimiter, requireAuthenticated(), MessageController.updateThreadTitle);
router.put('/thread/:threadId/image', messageMutationLimiter, requireAuthenticated(), messageImageUpload.single('image'), MessageController.updateThreadImage);
router.get('/unread-count/:accountId', messageReadLimiter, requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.getUnreadCount);
router.get('/inbox/:accountId', messageReadLimiter, requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listInbox);
router.get('/sent/:accountId', messageReadLimiter, requireSelfOrPermission((req) => req.params.accountId, 'roles:manage'), MessageController.listSent);
router.get('/user/:userId', messageReadLimiter, requireSelfOrPermission((req) => req.params.userId, 'roles:manage'), MessageController.listMessagesForUser);
router.post('/typing', messageTypingLimiter, requireSelfOrPermission((req) => req.body?.senderAccountId, 'roles:manage'), MessageController.typing);
router.put('/:id/read', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.markRead);
router.put('/:id/reaction', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.setReaction);
router.put('/:id/archive', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.recipientUserId, 'roles:manage'), MessageController.archiveMessage);
router.delete('/thread/:threadId', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.deleteThread);
router.delete('/:id', messageMutationLimiter, requireSelfOrPermission((req) => req.body?.accountId, 'roles:manage'), MessageController.deleteMessage);

export default router;
