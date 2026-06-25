import { Request, Response } from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AuthAccountModel } from '../models/AuthAccount';
import { UserMessageModel } from '../models/UserMessage';
import { addMessageEventClient, broadcastMessageEvent, MessagePresenceStatus, updateMessagePresence } from '../services/messageEvents';
import { notifyMentions } from '../services/mentionService';
import { cleanMultiline, cleanString } from '../utils/validation';
import { getSessionAccount } from '../middleware/authSession';
import { parsePagination } from '../utils/pagination';
import { isSafeMessageImage } from '../middleware/messageUpload';
import { createImageThumbnails } from '../services/imageThumbnails';

const systemMessagePrefix = '::system::';

function normalizePresenceStatus(status?: MessagePresenceStatus): MessagePresenceStatus {
  return status === 'active' || status === 'away' || status === 'busy' ? status : 'active';
}

async function canViewIncognitoPresence(account: { id: string; role: string } | null): Promise<boolean> {
  if (!account) {
    return false;
  }

  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('presence:view-incognito');
}

function getSystemMessageBody(message: string): string {
  return `${systemMessagePrefix}${message}`;
}

function getMessageAttachmentUrl(filename: string): string {
  return `/uploads/messages/${filename}`;
}

export class MessageController {
  static async streamEvents(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      addMessageEventClient(account.id, res);
    } catch (error) {
      console.error('Message events error:', error);
      res.status(500).json({ error: 'Failed to start message updates' });
    }
  }

  static async updatePresence(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      const isAwayLegacy = req.body?.away === true;
      const status = normalizePresenceStatus(
        (req.body?.status as MessagePresenceStatus | undefined) || (isAwayLegacy ? 'away' : undefined)
      );
      await updateMessagePresence(account.id, status);
      res.json({ ok: true, status });
    } catch (error) {
      console.error('Message presence update error:', error);
      res.status(500).json({ error: 'Failed to update presence' });
    }
  }

  static async resolveRecipient(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.accountId, 36);

      if (!accountId) {
        return res.status(400).json({ error: 'Recipient is required' });
      }

      const account = await AuthAccountModel.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: 'This user does not have an app login and cannot receive messages.' });
      }

      if (!account.isActive) {
        return res.status(403).json({ error: 'This user account is inactive and cannot receive messages.' });
      }

      if (!account.receivesMessages) {
        return res.status(403).json({ error: `${account.displayName || account.email} is not receiving messages.` });
      }

      res.json({ account });
    } catch (error) {
      console.error('Resolve message recipient error:', error);
      res.status(500).json({ error: 'Failed to validate message recipient' });
    }
  }

  static async createMessage(req: Request, res: Response) {
    try {
      const senderAccountId = cleanString(req.body?.senderAccountId, 36);
      const recipientUserId = cleanString(req.body?.recipientUserId, 36);
      const subject = cleanString(req.body?.subject, 180) || 'Message';
      const body = cleanMultiline(req.body?.body, 5000);

      if (!senderAccountId) {
        return res.status(400).json({ error: 'Sender is required' });
      }

      if (!recipientUserId) {
        return res.status(400).json({ error: 'Recipient is required' });
      }

      if (!body) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const recipient = await AuthAccountModel.getAccountById(recipientUserId);
      if (!recipient) {
        return res.status(404).json({ error: 'Recipient is not registered for messaging' });
      }

      if (!recipient.receivesMessages) {
        return res.status(403).json({ error: `${recipient.displayName} is not receiving messages` });
      }

      const message = await UserMessageModel.createMessage({
        senderAccountId,
        recipientUserId,
        subject,
        body,
      });

      const enrichedMessage = await UserMessageModel.getById(message.id);
      await notifyMentions(body, {
        actorId: senderAccountId,
        actorName: enrichedMessage?.senderName || 'A user',
        entityType: 'user_message',
        entityId: message.id,
        title: 'You were mentioned in a message',
        message: `${enrichedMessage?.senderName || 'A user'} mentioned you in Messages.`,
      });
      broadcastMessageEvent([senderAccountId, recipientUserId], {
        type: 'message-created',
        message: enrichedMessage || message,
        actorAccountId: senderAccountId,
      });

      res.status(201).json(enrichedMessage || message);
    } catch (error) {
      console.error('Create message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  static async createGroupMessage(req: Request, res: Response) {
    try {
      const senderAccountId = cleanString(req.body?.senderAccountId, 36);
      const subject = cleanString(req.body?.subject, 180) || 'Group Message';
      const body = cleanMultiline(req.body?.body, 5000);
      const audienceType = cleanString(req.body?.audienceType, 30);
      const requestedThreadId = cleanString(req.body?.threadId, 36);
      const requestedTitle = cleanString(req.body?.threadTitle, 180);
      const rawRecipientIds: unknown[] = Array.isArray(req.body?.recipientUserIds) ? req.body.recipientUserIds : [];

      if (!senderAccountId) {
        return res.status(400).json({ error: 'Sender is required' });
      }

      if (!body) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const sender = await AuthAccountModel.getAccountById(senderAccountId);
      if (!sender) {
        return res.status(404).json({ error: 'Sender account not found' });
      }

      const accounts = await AuthAccountModel.listAccounts();
      const recipientMap = new Map<string, Awaited<ReturnType<typeof AuthAccountModel.listAccounts>>[number]>();

      if (audienceType === 'district') {
        const senderDistrict = sender.district || '';
        accounts
          .filter((account) =>
            account.id !== senderAccountId &&
            account.isActive &&
            account.receivesMessages &&
            Boolean(senderDistrict) &&
            account.district === senderDistrict,
          )
          .forEach((account) => recipientMap.set(account.id, account));
      }

      rawRecipientIds
        .map((value) => cleanString(value, 36))
        .filter(Boolean)
        .forEach((recipientId: string) => {
          const account = accounts.find((item) => item.id === recipientId);
          if (account && account.id !== senderAccountId && account.isActive && account.receivesMessages) {
            recipientMap.set(account.id, account);
          }
        });

      const recipients = Array.from(recipientMap.values());
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'Choose at least one recipient that can receive messages' });
      }

      const participantIds = [senderAccountId, ...recipients.map((recipient) => recipient.id)];
      const participantNames = [
        sender.displayName || sender.email,
        ...recipients.map((recipient) => recipient.displayName || recipient.email),
      ];
      const threadId = requestedThreadId || uuidv4();
      const groupMessageId = uuidv4();
      const threadTitle = requestedTitle || (audienceType === 'district' && sender.district
        ? `${sender.district} District`
        : `Group: ${recipients.slice(0, 3).map((recipient) => recipient.displayName || recipient.email).join(', ')}${recipients.length > 3 ? ` +${recipients.length - 3}` : ''}`);

      const createdMessages = await Promise.all(recipients.map((recipient) =>
        UserMessageModel.createMessage({
          senderAccountId,
          recipientUserId: recipient.id,
          subject,
          body,
          threadId,
          threadType: audienceType === 'district' ? 'district' : 'group',
          threadTitle,
          threadParticipantIds: JSON.stringify(participantIds),
          threadParticipantNames: JSON.stringify(participantNames),
          groupMessageId,
        }),
      ));

      const enrichedMessages = await Promise.all(createdMessages.map((message) => UserMessageModel.getById(message.id)));
      const firstMessage = enrichedMessages.find(Boolean) || createdMessages[0];

      await notifyMentions(body, {
        actorId: senderAccountId,
        actorName: sender.displayName || sender.email || 'A user',
        entityType: 'user_message',
        entityId: groupMessageId,
        title: 'You were mentioned in a group message',
        message: `${sender.displayName || sender.email || 'A user'} mentioned you in Messages.`,
      });

      broadcastMessageEvent(participantIds, {
        type: 'message-created',
        message: firstMessage,
        actorAccountId: senderAccountId,
      });

      res.status(201).json({
        threadId,
        groupMessageId,
        messages: enrichedMessages.filter(Boolean).length > 0 ? enrichedMessages.filter(Boolean) : createdMessages,
      });
    } catch (error) {
      console.error('Create group message error:', error);
      res.status(500).json({ error: 'Failed to send group message' });
    }
  }

  static async uploadImage(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Image file is required' });
      }

      if (!isSafeMessageImage(file.path)) {
        fs.rmSync(file.path, { force: true });
        return res.status(400).json({ error: 'Only valid image uploads are allowed' });
      }

      await createImageThumbnails(file.path, [240, 640]);
      res.status(201).json({ imageUrl: `/uploads/messages/${file.filename}` });
    } catch (error) {
      console.error('Message image upload error:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }

  static async uploadAttachment(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Attachment file is required' });
      }

      res.status(201).json({
        fileUrl: getMessageAttachmentUrl(file.filename),
        fileName: file.originalname,
      });
    } catch (error) {
      console.error('Message attachment upload error:', error);
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }

  static async updateThreadTitle(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const threadId = cleanString(req.params.threadId, 36);
      const threadTitle = cleanString(req.body?.threadTitle, 180);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (!threadId) {
        return res.status(400).json({ error: 'Thread is required' });
      }

      if (!threadTitle) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const threadInfo = await UserMessageModel.getThreadInfo(threadId, account.id);
      if (!threadInfo) {
        return res.status(404).json({ error: 'Group thread not found' });
      }

      const updated = await UserMessageModel.updateThreadTitle(threadId, account.id, threadTitle);
      if (!updated) {
        return res.status(404).json({ error: 'Group thread not found' });
      }

      const participantIds = threadInfo.threadParticipantIds.filter(Boolean);
      const recipients = participantIds.filter((id) => id !== account.id);
      const groupMessageId = uuidv4();
      const actorName = account.displayName || account.email || 'Someone';
      const body = getSystemMessageBody(`${actorName} changed the group name to ${threadTitle}.`);

      await Promise.all(recipients.map((recipientUserId) =>
        UserMessageModel.createMessage({
          senderAccountId: account.id,
          recipientUserId,
          subject: threadTitle,
          body,
          threadId,
          threadType: threadInfo.threadType,
          threadTitle,
          threadParticipantIds: JSON.stringify(participantIds),
          threadParticipantNames: JSON.stringify(threadInfo.threadParticipantNames),
          threadImageUrl: threadInfo.threadImageUrl,
          groupMessageId,
        }),
      ));

      broadcastMessageEvent(participantIds, {
        type: 'message-created',
        actorAccountId: account.id,
      });

      res.json({ threadId, threadTitle });
    } catch (error) {
      console.error('Update thread title error:', error);
      res.status(500).json({ error: 'Failed to update group name' });
    }
  }

  static async updateThreadImage(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const threadId = cleanString(req.params.threadId, 36);
      const file = req.file;

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (!threadId) {
        return res.status(400).json({ error: 'Thread is required' });
      }

      if (!file) {
        return res.status(400).json({ error: 'Image file is required' });
      }

      if (!isSafeMessageImage(file.path)) {
        fs.rmSync(file.path, { force: true });
        return res.status(400).json({ error: 'Only valid image uploads are allowed' });
      }

      const threadInfo = await UserMessageModel.getThreadInfo(threadId, account.id);
      if (!threadInfo) {
        fs.rmSync(file.path, { force: true });
        return res.status(404).json({ error: 'Group thread not found' });
      }

      const imageUrl = `/uploads/messages/${file.filename}`;
      const updated = await UserMessageModel.updateThreadImage(threadId, account.id, imageUrl);
      if (!updated) {
        fs.rmSync(file.path, { force: true });
        return res.status(404).json({ error: 'Group thread not found' });
      }

      await createImageThumbnails(file.path, [96, 240]);
      const participantIds = threadInfo.threadParticipantIds.filter(Boolean);
      const recipients = participantIds.filter((id) => id !== account.id);
      const groupMessageId = uuidv4();
      const actorName = account.displayName || account.email || 'Someone';
      const body = getSystemMessageBody(`${actorName} changed the group photo.`);

      await Promise.all(recipients.map((recipientUserId) =>
        UserMessageModel.createMessage({
          senderAccountId: account.id,
          recipientUserId,
          subject: threadInfo.threadTitle || 'Group Message',
          body,
          threadId,
          threadType: threadInfo.threadType,
          threadTitle: threadInfo.threadTitle,
          threadParticipantIds: JSON.stringify(participantIds),
          threadParticipantNames: JSON.stringify(threadInfo.threadParticipantNames),
          threadImageUrl: imageUrl,
          groupMessageId,
        }),
      ));

      broadcastMessageEvent(participantIds, { type: 'message-created', actorAccountId: account.id });
      res.json({ threadId, imageUrl });
    } catch (error) {
      console.error('Update thread image error:', error);
      res.status(500).json({ error: 'Failed to update group image' });
    }
  }

  static async listMessagesForUser(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.userId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 250, maxPageSize: 500 });
      const messages = await UserMessageModel.listMessagesForUser(accountId, pagination.pageSize, pagination.offset);
      res.json(messages);
    } catch (error) {
      console.error('List messages error:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  static async listInbox(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.accountId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 250, maxPageSize: 500 });
      const sessionAccount = await getSessionAccount(req);
      const messages = await UserMessageModel.listInbox(accountId, pagination.pageSize, pagination.offset, {
        canViewIncognitoPresence: await canViewIncognitoPresence(sessionAccount),
      });
      res.json(messages);
    } catch (error) {
      console.error('List inbox error:', error);
      res.status(500).json({ error: 'Failed to load inbox' });
    }
  }

  static async getUnreadCount(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.accountId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const unreadCount = await UserMessageModel.countUnreadInbox(accountId);
      res.json({ unreadCount });
    } catch (error) {
      console.error('Get unread message count error:', error);
      res.status(500).json({ error: 'Failed to load unread count' });
    }
  }

  static async listSent(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.accountId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 250, maxPageSize: 500 });
      const sessionAccount = await getSessionAccount(req);
      const messages = await UserMessageModel.listSent(accountId, pagination.pageSize, pagination.offset, {
        canViewIncognitoPresence: await canViewIncognitoPresence(sessionAccount),
      });
      res.json(messages);
    } catch (error) {
      console.error('List sent messages error:', error);
      res.status(500).json({ error: 'Failed to load sent messages' });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const recipientUserId = cleanString(req.body?.recipientUserId, 36);

      if (!recipientUserId) {
        return res.status(400).json({ error: 'Recipient is required' });
      }

      const updated = await UserMessageModel.markRead(req.params.id, recipientUserId);

      if (!updated) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = await UserMessageModel.getById(req.params.id);
      broadcastMessageEvent(
        message ? [message.senderAccountId, message.recipientUserId] : [recipientUserId],
        {
          type: 'message-read',
          ...(message ? { message } : {}),
          messageId: req.params.id,
          actorAccountId: recipientUserId,
        }
      );

      res.json({ message: 'Message marked read' });
    } catch (error) {
      console.error('Mark message read error:', error);
      res.status(500).json({ error: 'Failed to mark message read' });
    }
  }

  static async setReaction(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.body?.accountId, 36);
      const rawReaction = cleanString(req.body?.reaction, 30);
      const allowedReactions = new Set(['thumbsUp', 'check', 'laugh', 'heart', 'eyes']);
      const reaction = rawReaction && allowedReactions.has(rawReaction) ? rawReaction : null;

      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const updated = await UserMessageModel.setReaction(req.params.id, accountId, reaction);
      if (!updated) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = await UserMessageModel.getById(req.params.id);
      broadcastMessageEvent(
        message ? [message.senderAccountId, message.recipientUserId] : [accountId],
        {
          type: 'message-reaction',
          ...(message ? { message } : {}),
          messageId: req.params.id,
          actorAccountId: accountId,
        }
      );

      res.json(message || { message: 'Reaction updated' });
    } catch (error) {
      console.error('Message reaction error:', error);
      res.status(500).json({ error: 'Failed to update reaction' });
    }
  }

  static async typing(req: Request, res: Response) {
    try {
      const senderAccountId = cleanString(req.body?.senderAccountId, 36);
      const recipientUserId = cleanString(req.body?.recipientUserId, 36);
      const typingName = cleanString(req.body?.typingName, 150);
      const typingIsActive = req.body?.isTyping !== false;

      if (!senderAccountId || !recipientUserId) {
        return res.status(400).json({ error: 'Sender and recipient are required' });
      }

      broadcastMessageEvent([recipientUserId], {
        type: 'message-typing',
        actorAccountId: senderAccountId,
        typingThreadId: senderAccountId,
        typingName: typingName || 'Someone',
        typingIsActive,
      });

      res.json({ message: 'Typing status sent' });
    } catch (error) {
      console.error('Message typing error:', error);
      res.status(500).json({ error: 'Failed to update typing status' });
    }
  }

  static async archiveMessage(req: Request, res: Response) {
    try {
      const recipientUserId = cleanString(req.body?.recipientUserId, 36);

      if (!recipientUserId) {
        return res.status(400).json({ error: 'Recipient is required' });
      }

      const updated = await UserMessageModel.archiveForRecipient(req.params.id, recipientUserId);

      if (!updated) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = await UserMessageModel.getById(req.params.id);
      broadcastMessageEvent(
        message ? [message.senderAccountId, message.recipientUserId] : [recipientUserId],
        {
          type: 'message-archived',
          ...(message ? { message } : {}),
          messageId: req.params.id,
          actorAccountId: recipientUserId,
        }
      );

      res.json({ message: 'Message archived' });
    } catch (error) {
      console.error('Archive message error:', error);
      res.status(500).json({ error: 'Failed to archive message' });
    }
  }

  static async deleteMessage(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.body?.accountId, 36);

      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const updated = await UserMessageModel.deleteForUser(req.params.id, accountId);

      if (!updated) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = await UserMessageModel.getById(req.params.id);
      broadcastMessageEvent(
        message ? [message.senderAccountId, message.recipientUserId] : [accountId],
        {
          type: 'message-deleted',
          ...(message ? { message } : {}),
          messageId: req.params.id,
          actorAccountId: accountId,
        }
      );

      res.json(message || { message: 'Message deleted' });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  static async deleteThread(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.body?.accountId, 36);
      const threadId = cleanString(req.params.threadId, 36);

      if (!accountId || !threadId) {
        return res.status(400).json({ error: 'Account and thread are required' });
      }

      const updated = await UserMessageModel.deleteThreadForUser(threadId, accountId);
      if (!updated) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      broadcastMessageEvent([accountId], {
        type: 'message-deleted',
        actorAccountId: accountId,
      });

      res.json({ message: 'Conversation deleted' });
    } catch (error) {
      console.error('Delete thread error:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }
}
