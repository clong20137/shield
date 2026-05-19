import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { AuditLogModel } from '../models/AuditLog';
import { AuthAccountModel } from '../models/AuthAccount';
import { PerformanceEvaluationModel } from '../models/PerformanceEvaluation';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { parsePagination } from '../utils/pagination';

async function canCreateCpar(account: { id: string; role: string } | null): Promise<boolean> {
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('reports:cpar');
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class PerformanceEvaluationController {
  static async list(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 200, maxPageSize: 500 });
      const evaluations = await PerformanceEvaluationModel.listForAccount(account.id, account.role === 'administrator', pagination.pageSize, pagination.offset);
      res.json(evaluations);
    } catch (error) {
      console.error('List performance evaluations error:', error);
      res.status(500).json({ error: 'Failed to load performance evaluations' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (!(await canCreateCpar(account))) {
        return res.status(403).json({ error: 'CPAR creation permission required' });
      }

      const employeeAccountId = cleanText(req.body?.employeeAccountId);
      const evaluationPeriod = cleanText(req.body?.evaluationPeriod);
      if (!employeeAccountId || !evaluationPeriod) {
        return res.status(400).json({ error: 'Employee and evaluation period are required' });
      }

      const employee = await AuthAccountModel.getAccountById(employeeAccountId);
      if (!employee) {
        return res.status(404).json({ error: 'Employee account not found' });
      }

      const ratings = req.body?.ratings && typeof req.body.ratings === 'object' && !Array.isArray(req.body.ratings)
        ? req.body.ratings
        : {};

      const evaluation = await PerformanceEvaluationModel.create({
        employeeAccountId: employee.id,
        employeeName: employee.displayName,
        employeeEmail: employee.email,
        supervisorAccountId: account.id,
        supervisorName: account.displayName || account.email,
        evaluationPeriod,
        positionTitle: cleanText(req.body?.positionTitle),
        district: cleanText(req.body?.district),
        ratings,
        strengths: cleanText(req.body?.strengths),
        improvements: cleanText(req.body?.improvements),
        goals: cleanText(req.body?.goals),
        supervisorComments: cleanText(req.body?.supervisorComments),
      });

      await UserNotificationModel.create({
        userId: employee.id,
        type: 'performance-evaluation',
        title: 'Performance Evaluation Ready',
        message: `${evaluation.supervisorName} sent you a performance evaluation to review and sign.`,
        entityType: 'performance_evaluation',
        entityId: evaluation.id,
      });

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'Created performance evaluation',
        entityType: 'performance_evaluation',
        entityId: evaluation.id,
        details: `Sent to ${employee.displayName}`,
      });

      broadcastAccountEvent(employee.id, { type: 'notification-created', entityId: evaluation.id });
      broadcastAccountEvent(employee.id, { type: 'performance-evaluation-updated', entityId: evaluation.id });
      broadcastAccountEvent(account.id, { type: 'performance-evaluation-updated', entityId: evaluation.id });
      broadcastAppEvent({ type: 'performance-evaluation-updated', entityId: evaluation.id });
      res.status(201).json(evaluation);
    } catch (error) {
      console.error('Create performance evaluation error:', error);
      res.status(500).json({ error: 'Failed to create performance evaluation' });
    }
  }

  static async sign(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const existing = await PerformanceEvaluationModel.getById(req.params.id);
      if (!existing || existing.employeeAccountId !== account.id) {
        return res.status(404).json({ error: 'Evaluation not found' });
      }

      const signature = cleanText(req.body?.signature) || account.displayName || account.email;
      const evaluation = await PerformanceEvaluationModel.sign(
        req.params.id,
        account.id,
        signature,
        cleanText(req.body?.employeeComments)
      );

      if (!evaluation) {
        return res.status(400).json({ error: 'Evaluation cannot be signed' });
      }

      await UserNotificationModel.create({
        userId: evaluation.supervisorAccountId,
        type: 'performance-evaluation',
        title: 'Performance Evaluation Signed',
        message: `${evaluation.employeeName} signed and returned their performance evaluation.`,
        entityType: 'performance_evaluation',
        entityId: evaluation.id,
      });

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'Signed performance evaluation',
        entityType: 'performance_evaluation',
        entityId: evaluation.id,
        details: `Signed by ${signature}`,
      });

      broadcastAccountEvent(evaluation.supervisorAccountId, { type: 'notification-created', entityId: evaluation.id });
      broadcastAccountEvent(evaluation.supervisorAccountId, { type: 'performance-evaluation-updated', entityId: evaluation.id });
      broadcastAccountEvent(account.id, { type: 'performance-evaluation-updated', entityId: evaluation.id });
      broadcastAppEvent({ type: 'performance-evaluation-updated', entityId: evaluation.id });
      res.json(evaluation);
    } catch (error) {
      console.error('Sign performance evaluation error:', error);
      res.status(500).json({ error: 'Failed to sign performance evaluation' });
    }
  }

  static async remind(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const existing = await PerformanceEvaluationModel.getById(req.params.id);
      if (!existing || existing.status !== 'Sent') {
        return res.status(404).json({ error: 'Unsigned evaluation not found' });
      }

      if (existing.supervisorAccountId !== account.id && account.role !== 'administrator' && !(await canCreateCpar(account))) {
        return res.status(403).json({ error: 'Supervisor access required' });
      }

      await UserNotificationModel.create({
        userId: existing.employeeAccountId,
        type: 'performance-evaluation',
        title: 'Performance Evaluation Reminder',
        message: `${account.displayName || account.email} reminded you to review and sign your performance evaluation for ${existing.evaluationPeriod}.`,
        entityType: 'performance_evaluation',
        entityId: existing.id,
      });

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'Sent performance evaluation reminder',
        entityType: 'performance_evaluation',
        entityId: existing.id,
        details: `Reminder sent to ${existing.employeeName}`,
      });

      const evaluation = await PerformanceEvaluationModel.updateSentAt(existing.id);
      broadcastAccountEvent(existing.employeeAccountId, { type: 'notification-created', entityId: existing.id });
      broadcastAccountEvent(existing.employeeAccountId, { type: 'performance-evaluation-updated', entityId: existing.id });
      broadcastAccountEvent(account.id, { type: 'performance-evaluation-updated', entityId: existing.id });
      broadcastAppEvent({ type: 'performance-evaluation-updated', entityId: existing.id });
      res.json(evaluation || existing);
    } catch (error) {
      console.error('Remind performance evaluation error:', error);
      res.status(500).json({ error: 'Failed to send evaluation reminder' });
    }
  }
}
