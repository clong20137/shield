import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';
import { UserMessageModel } from '../models/UserMessage';
import { addMessageEventClient, broadcastMessageEvent } from '../services/messageEvents';

export class MessageController {
  static async streamEvents(req: Request, res: Response) {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
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
      const { senderAccountId, recipientUserId, subject, body } = req.body as {
        senderAccountId?: string;
        recipientUserId?: string;
        subject?: string;
        body?: string;
      };

      if (!senderAccountId || !recipientUserId || !subject?.trim() || !body?.trim()) {
        return res.status(400).json({ error: 'Sender, recipient, subject, and message are required' });
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
        subject: subject.trim(),
        body: body.trim(),
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
      const messages = await UserMessageModel.listMessagesForUser(req.params.userId);
      res.json(messages);
    } catch (error) {
      console.error('List messages error:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  static async listInbox(req: Request, res: Response) {
    try {
      const messages = await UserMessageModel.listInbox(req.params.accountId);
      res.json(messages);
    } catch (error) {
      console.error('List inbox error:', error);
      res.status(500).json({ error: 'Failed to load inbox' });
    }
  }

  static async listSent(req: Request, res: Response) {
    try {
      const messages = await UserMessageModel.listSent(req.params.accountId);
      res.json(messages);
    } catch (error) {
      console.error('List sent messages error:', error);
      res.status(500).json({ error: 'Failed to load sent messages' });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const { recipientUserId } = req.body as { recipientUserId?: string };

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
      const { recipientUserId } = req.body as { recipientUserId?: string };

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
      const { accountId } = req.body as { accountId?: string };

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
