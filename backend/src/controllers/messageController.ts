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
}
