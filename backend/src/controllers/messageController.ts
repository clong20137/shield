import { Request, Response } from 'express';
import { UserMessageModel } from '../models/UserMessage';

export class MessageController {
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

      const message = await UserMessageModel.createMessage({
        senderAccountId,
        recipientUserId,
        subject: subject.trim(),
        body: body.trim(),
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

      res.json({ message: 'Message deleted' });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
}
