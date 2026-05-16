import { Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { BugReportModel, BugReportPriority, BugReportStatus } from '../models/BugReport';
import { getSessionAccount } from '../middleware/authSession';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';

const statuses: BugReportStatus[] = ['New', 'Pending', 'Fixed', 'Closed'];
const priorities: BugReportPriority[] = ['Low', 'Normal', 'High', 'Critical'];

export class BugReportController {
  static async create(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const { title, description, location, priority } = req.body as {
        title?: string;
        description?: string;
        location?: string;
        priority?: BugReportPriority;
      };

      if (!account) {
        return res.status(401).json({ error: 'Sign in to report a bug' });
      }

      if (!title?.trim() || !description?.trim()) {
        return res.status(400).json({ error: 'Bug title and description are required' });
      }

      const report = await BugReportModel.create({
        reporterId: account.id,
        reporterName: account.displayName,
        reporterEmail: account.email,
        title,
        description,
        location,
        priority: priority && priorities.includes(priority) ? priority : 'Normal',
      });

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'created',
        entityType: 'bug_report',
        entityId: report.id,
        details: JSON.stringify(report),
      });

      broadcastAppEvent({ type: 'bug-updated', entityId: report.id });
      res.status(201).json(report);
    } catch (error) {
      console.error('Create bug report error:', error);
      res.status(500).json({ error: 'Failed to submit bug report' });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const reports = await BugReportModel.list();
      res.json(reports);
    } catch (error) {
      console.error('List bug reports error:', error);
      res.status(500).json({ error: 'Failed to load bug reports' });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const { status, adminNotes } = req.body as { status?: BugReportStatus; adminNotes?: string };

      if (!status || !statuses.includes(status)) {
        return res.status(400).json({ error: 'Choose a valid bug status' });
      }

      const report = await BugReportModel.updateStatus(req.params.id, status, adminNotes || '');
      if (!report) {
        return res.status(404).json({ error: 'Bug report not found' });
      }

      if (report.reporterId) {
        await UserNotificationModel.create({
          userId: report.reporterId,
          type: 'bug',
          title: `Bug report ${status.toLowerCase()}`,
          message: `"${report.title}" was marked ${status}.${adminNotes ? ` ${adminNotes}` : ''}`,
          entityType: 'bug_report',
          entityId: report.id,
        });
        broadcastAccountEvent(report.reporterId, { type: 'notification-created', entityId: report.id });
      }

      await AuditLogModel.create({
        actorId: account?.id || null,
        actorName: account?.displayName || account?.email || null,
        action: 'updated',
        entityType: 'bug_report',
        entityId: report.id,
        details: JSON.stringify({ status, adminNotes: adminNotes || '' }),
      });

      broadcastAppEvent({ type: 'bug-updated', entityId: report.id });
      res.json(report);
    } catch (error) {
      console.error('Update bug report error:', error);
      res.status(500).json({ error: 'Failed to update bug report' });
    }
  }
}
