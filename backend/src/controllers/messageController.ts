import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';
import { UserMessageModel } from '../models/UserMessage';
import { addMessageEventClient, broadcastMessageEvent } from '../services/messageEvents';
import { cleanMultiline, cleanString } from '../utils/validation';
import { isWellFormedSessionToken } from '../middleware/authSession';

export class MessageController {
  static async streamEvents(req: Request, res: Response) {
    try {
      const token = typeof req.query.token === 'string' && isWellFormedSessionToken(req.query.token) ? req.query.token : '';
      const account = token ? await AuthSessionModel.getAccountForToken(token) : null;

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      addMessageEventClient(account.id, res);
    } catch (error) {
      console.error('Message events error:', error);
      res.status(500).json({ error: 'Failed to start message updates' });
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
      broadcastMessageEvent([senderAccountId, recipientUserId], {
        type: 'message-created',
        message: enrichedMessage || message,
        actorAccountId: senderAccountId,
      });

      res.status(201).json(message);
    } catch (error) {
      console.error('Create message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  static async listMessagesForUser(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.userId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const messages = await UserMessageModel.listMessagesForUser(accountId);
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

      const messages = await UserMessageModel.listInbox(accountId);
      res.json(messages);
    } catch (error) {
      console.error('List inbox error:', error);
      res.status(500).json({ error: 'Failed to load inbox' });
    }
  }

  static async listSent(req: Request, res: Response) {
    try {
      const accountId = cleanString(req.params.accountId, 36);
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const messages = await UserMessageModel.listSent(accountId);
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

      res.json({ message: 'Message deleted' });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
}
