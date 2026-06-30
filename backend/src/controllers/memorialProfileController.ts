import path from 'path';
import { Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { getSessionAccount } from '../middleware/authSession';
import { isSafeUploadedImage } from '../middleware/profileUpload';
import { createImageThumbnails } from '../services/imageThumbnails';
import { MemorialProfileInput, MemorialProfileModel } from '../models/MemorialProfile';

function requestAuditFields(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  };
}

function parsePagination(query: Request['query']) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 24, 6), 60);
  return { page, limit, offset: (page - 1) * limit };
}

function cleanPayload(body: Record<string, unknown>): MemorialProfileInput {
  return MemorialProfileModel.cleanInput({
    linkedUserId: body.linkedUserId as string | null,
    firstName: body.firstName as string,
    lastName: body.lastName as string,
    rank: body.rank as string,
    district: body.district as string,
    appointedDate: body.appointedDate as string,
    deceasedDate: body.deceasedDate as string,
    photoUrl: body.photoUrl as string,
    serviceYears: body.serviceYears as string,
    memorialSummary: body.memorialSummary as string,
    memorialExternalUrl: body.memorialExternalUrl as string,
  });
}

export class MemorialProfileController {
  static async list(req: Request, res: Response) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const searchTerm = typeof req.query.q === 'string' ? req.query.q : '';
      const rows = await MemorialProfileModel.list(searchTerm, limit + 1, offset);
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      res.json({ data, page, limit, count: data.length, hasMore });
    } catch (error) {
      console.error('List memorial profiles error:', error);
      res.status(500).json({ error: 'Failed to load memorial profiles' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const payload = cleanPayload(req.body || {});
      if (!payload.firstName || !payload.lastName) {
        return res.status(400).json({ error: 'First and last name are required' });
      }

      const profile = await MemorialProfileModel.create(payload);
      if (account) {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'memorial_profiles.created',
          entityType: 'memorial_profile',
          entityId: profile.id,
          details: JSON.stringify({ linkedUserId: profile.linkedUserId || null }),
          ...requestAuditFields(req),
        });
      }

      res.status(201).json(profile);
    } catch (error) {
      console.error('Create memorial profile error:', error);
      res.status(500).json({ error: 'Failed to create memorial profile' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const payload = cleanPayload(req.body || {});
      if (!payload.firstName || !payload.lastName) {
        return res.status(400).json({ error: 'First and last name are required' });
      }

      const profile = await MemorialProfileModel.update(req.params.id, payload);
      if (!profile) {
        return res.status(404).json({ error: 'Memorial profile not found' });
      }

      if (account) {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'memorial_profiles.updated',
          entityType: 'memorial_profile',
          entityId: profile.id,
          details: JSON.stringify({ linkedUserId: profile.linkedUserId || null }),
          ...requestAuditFields(req),
        });
      }

      res.json(profile);
    } catch (error) {
      console.error('Update memorial profile error:', error);
      res.status(500).json({ error: 'Failed to update memorial profile' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const deleted = await MemorialProfileModel.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Memorial profile not found' });
      }

      if (account) {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'memorial_profiles.deleted',
          entityType: 'memorial_profile',
          entityId: req.params.id,
          details: JSON.stringify({}),
          ...requestAuditFields(req),
        });
      }

      res.json({ deleted: true });
    } catch (error) {
      console.error('Delete memorial profile error:', error);
      res.status(500).json({ error: 'Failed to delete memorial profile' });
    }
  }

  static async uploadPhoto(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Photo is required' });
      }

      if (!isSafeUploadedImage(req.file.path)) {
        return res.status(400).json({ error: 'Only image uploads are allowed' });
      }

      await createImageThumbnails(req.file.path, [160, 420, 640]);
      const relativePath = path.relative(path.join(process.cwd(), 'uploads'), req.file.path).replace(/\\/gu, '/');
      res.status(201).json({ photoUrl: `/uploads/${relativePath}` });
    } catch (error) {
      console.error('Upload memorial photo error:', error);
      res.status(500).json({ error: 'Failed to upload memorial photo' });
    }
  }
}
