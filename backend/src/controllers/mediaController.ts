import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuditLogModel } from '../models/AuditLog';
import { AuthAccountModel } from '../models/AuthAccount';
import { getSessionAccount } from '../middleware/authSession';
import { isSafeUploadedImage } from '../middleware/profileUpload';
import { broadcastAppEvent } from '../services/appEvents';
import { createImageThumbnails } from '../services/imageThumbnails';

const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp']);
const mediaFolders = [
  { key: 'profile-pictures', label: 'Profile Pictures' },
  { key: 'dashboard-posts', label: 'Dashboard Posts' },
] as const;
const protectedFolders = new Set<string>(mediaFolders.map((folder) => folder.key));
const dashboardMediaFolder = 'dashboard-posts';

function getUploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads');
}

function sanitizeFolderName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 64);
}

function getCustomFolderLabel(folderKey: string): string {
  return folderKey
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || folderKey;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function getSafeFolderPath(folderKey: string): string | null {
  const cleanFolder = sanitizeFolderName(folderKey);
  if (!cleanFolder || cleanFolder !== folderKey) {
    return null;
  }

  const uploadsRoot = getUploadsRoot();
  const folderPath = path.resolve(uploadsRoot, cleanFolder);
  return isPathInside(uploadsRoot, folderPath) ? folderPath : null;
}

function getSafeImagePath(folderKey: string, fileName: string): string | null {
  const folderPath = getSafeFolderPath(folderKey);
  if (!folderPath || !allowedImageExtensions.has(path.extname(fileName).toLowerCase())) {
    return null;
  }

  const filePath = path.resolve(folderPath, path.basename(fileName));
  return isPathInside(folderPath, filePath) ? filePath : null;
}

function getFolderDefinitions(): Array<{ key: string; label: string; protected: boolean }> {
  const uploadsRoot = getUploadsRoot();
  const builtinFolders = mediaFolders.map((folder) => ({ ...folder, protected: true }));

  if (!fs.existsSync(uploadsRoot)) {
    return builtinFolders;
  }

  const customFolders = fs.readdirSync(uploadsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !protectedFolders.has(entry.name) && entry.name !== 'thumbs')
    .map((entry) => ({ key: entry.name, label: getCustomFolderLabel(entry.name), protected: false }));

  return [...builtinFolders, ...customFolders].sort((a, b) => Number(b.protected) - Number(a.protected) || a.label.localeCompare(b.label));
}

function requestAuditFields(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  };
}

async function canUseFullMediaLibrary(accountId: string): Promise<boolean> {
  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return ['media:view', 'media:upload', 'media:edit', 'media:delete', 'users:profile-picture'].some((permission) => permissions.includes(permission));
}

async function canUseProfilePictureMedia(accountId: string): Promise<boolean> {
  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return permissions.includes('account:profile-picture');
}

async function canUseDashboardMedia(accountId: string): Promise<boolean> {
  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return ['dashboard:create', 'dashboard:edit', 'dashboard:manage'].some((permission) => permissions.includes(permission));
}

function getUploadUrl(relativePath: string): string {
  return `/uploads/${relativePath.replace(/\\/gu, '/')}`;
}

function getThumbnailUrl(relativePath: string, width: number): string {
  const normalizedPath = relativePath.replace(/\\/gu, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `/uploads/${[...parts, 'thumbs', `${baseName}-${width}.webp`].join('/')}`;
}

export class MediaController {
  static async list(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const uploadsRoot = getUploadsRoot();
      const selectedFolder = typeof req.query.folder === 'string' ? req.query.folder : '';
      const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 60, 12), 120);
      const hasFullMediaAccess = account.role === 'administrator' || await canUseFullMediaLibrary(account.id);
      const hasProfilePictureMediaAccess = account.role === 'administrator' || await canUseProfilePictureMedia(account.id);
      const hasDashboardMediaAccess = account.role === 'administrator' || await canUseDashboardMedia(account.id);
      const canReadSelectedProfilePictures = hasProfilePictureMediaAccess && (!selectedFolder || selectedFolder === 'profile-pictures');

      if (!hasFullMediaAccess && !canReadSelectedProfilePictures && (!hasDashboardMediaAccess || selectedFolder !== dashboardMediaFolder)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const items: Array<{
        id: string;
        folder: string;
        label: string;
        fileName: string;
        url: string;
        thumbnailUrl: string;
        size: number;
        updatedAt: Date;
      }> = [];
      const folders: Array<{
        key: string;
        label: string;
        count: number;
        size: number;
        updatedAt: Date | null;
        protected: boolean;
      }> = [];

      const availableFolders = getFolderDefinitions().filter((folder) => {
        if (hasFullMediaAccess) {
          return true;
        }

        if (canReadSelectedProfilePictures) {
          return folder.key === 'profile-pictures';
        }

        return hasDashboardMediaAccess && folder.key === dashboardMediaFolder;
      });

      for (const folder of availableFolders) {
        const folderPath = path.join(uploadsRoot, folder.key);
        let folderCount = 0;
        let folderSize = 0;
        let folderUpdatedAt: Date | null = null;

        if (!fs.existsSync(folderPath)) {
          folders.push({ key: folder.key, label: folder.label, count: 0, size: 0, updatedAt: null, protected: folder.protected });
          continue;
        }

        for (const fileName of fs.readdirSync(folderPath)) {
          const filePath = path.join(folderPath, fileName);
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || !allowedImageExtensions.has(path.extname(fileName).toLowerCase())) {
            continue;
          }

          folderCount += 1;
          folderSize += stat.size;
          if (!folderUpdatedAt || stat.mtime.getTime() > folderUpdatedAt.getTime()) {
            folderUpdatedAt = stat.mtime;
          }

          if (selectedFolder && selectedFolder !== folder.key) {
            continue;
          }

          if (searchTerm && !`${fileName} ${folder.label}`.toLowerCase().includes(searchTerm)) {
            continue;
          }

          const relativePath = path.relative(uploadsRoot, filePath);
          items.push({
            id: relativePath.replace(/\\/gu, '/'),
            folder: folder.key,
            label: folder.label,
            fileName,
            url: getUploadUrl(relativePath),
            thumbnailUrl: getThumbnailUrl(relativePath, folder.key === 'profile-pictures' ? 256 : 480),
            size: stat.size,
            updatedAt: stat.mtime,
          });
        }

        folders.push({
          key: folder.key,
          label: folder.label,
          count: folderCount,
          size: folderSize,
          updatedAt: folderUpdatedAt,
          protected: folder.protected,
        });
      }

      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const totalItems = folders.reduce((total, folder) => total + folder.count, 0);
      const totalSize = folders.reduce((total, folder) => total + folder.size, 0);
      const total = items.length;
      const pagedItems = items.slice((page - 1) * limit, page * limit);

      res.json({
        items: pagedItems,
        folders,
        page,
        limit,
        total,
        totalItems,
        totalSize,
      });
    } catch (error) {
      console.error('List media error:', error);
      res.status(500).json({ error: 'Failed to load media library' });
    }
  }

  static async createFolder(req: Request, res: Response) {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const folderKey = sanitizeFolderName(name);
      const folderPath = getSafeFolderPath(folderKey);
      if (!folderKey || !folderPath) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      if (fs.existsSync(folderPath)) {
        return res.status(409).json({ error: 'Folder already exists' });
      }

      await fs.promises.mkdir(folderPath, { recursive: true });
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.folder_created',
        entityType: 'media-folder',
        entityId: folderKey,
        details: JSON.stringify({ folder: folderKey }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: folderKey });
      res.status(201).json({ key: folderKey, label: getCustomFolderLabel(folderKey), count: 0, size: 0, updatedAt: null, protected: false });
    } catch (error) {
      console.error('Create media folder error:', error);
      res.status(500).json({ error: 'Failed to create media folder' });
    }
  }

  static async renameFolder(req: Request, res: Response) {
    try {
      const currentFolder = req.params.folder;
      if (protectedFolders.has(currentFolder)) {
        return res.status(400).json({ error: 'System folders cannot be renamed' });
      }

      const nextFolder = sanitizeFolderName(typeof req.body?.name === 'string' ? req.body.name : '');
      const currentPath = getSafeFolderPath(currentFolder);
      const nextPath = getSafeFolderPath(nextFolder);
      if (!currentPath || !nextPath || !nextFolder) {
        return res.status(400).json({ error: 'Valid folder name is required' });
      }

      if (!fs.existsSync(currentPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      if (fs.existsSync(nextPath)) {
        return res.status(409).json({ error: 'Folder already exists' });
      }

      await fs.promises.rename(currentPath, nextPath);
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.folder_renamed',
        entityType: 'media-folder',
        entityId: nextFolder,
        details: JSON.stringify({ from: currentFolder, to: nextFolder }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: nextFolder });
      res.json({ key: nextFolder, label: getCustomFolderLabel(nextFolder) });
    } catch (error) {
      console.error('Rename media folder error:', error);
      res.status(500).json({ error: 'Failed to rename media folder' });
    }
  }

  static async deleteFolder(req: Request, res: Response) {
    try {
      const folderKey = req.params.folder;
      if (protectedFolders.has(folderKey)) {
        return res.status(400).json({ error: 'System folders cannot be deleted' });
      }

      const folderPath = getSafeFolderPath(folderKey);
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      await fs.promises.rm(folderPath, { recursive: true, force: true });
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.folder_deleted',
        entityType: 'media-folder',
        entityId: folderKey,
        details: JSON.stringify({ folder: folderKey }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: folderKey });
      res.status(204).send();
    } catch (error) {
      console.error('Delete media folder error:', error);
      res.status(500).json({ error: 'Failed to delete media folder' });
    }
  }

  static async uploadImages(req: Request, res: Response) {
    try {
      const actor = await getSessionAccount(req);
      if (!actor) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const folderKey = typeof req.body?.folder === 'string' ? req.body.folder : '';
      const hasFullMediaAccess = actor.role === 'administrator' || await canUseFullMediaLibrary(actor.id);
      const hasDashboardMediaAccess = actor.role === 'administrator' || await canUseDashboardMedia(actor.id);
      if (!hasFullMediaAccess && (!hasDashboardMediaAccess || folderKey !== dashboardMediaFolder)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const folderPath = getSafeFolderPath(folderKey);
      const files = req.files as Express.Multer.File[] | undefined;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Valid folder is required' });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
      }

      const uploaded: string[] = [];
      const skipped: Array<{ fileName: string; reason: string }> = [];
      for (const file of files) {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!allowedImageExtensions.has(extension)) {
          skipped.push({ fileName: file.originalname, reason: 'Unsupported image type' });
          continue;
        }

        const safeName = `${Date.now()}-${uuidv4()}${extension}`;
        const filePath = path.join(folderPath, safeName);
        await fs.promises.writeFile(filePath, file.buffer);
        if (!isSafeUploadedImage(filePath)) {
          await fs.promises.rm(filePath, { force: true });
          skipped.push({ fileName: file.originalname, reason: 'File is not a valid image' });
          continue;
        }

        await createImageThumbnails(filePath, [256, 480]);
        uploaded.push(safeName);
      }

      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.images_uploaded',
        entityType: 'media-folder',
        entityId: folderKey,
        details: JSON.stringify({ folder: folderKey, uploadedCount: uploaded.length, skippedCount: skipped.length }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: folderKey });
      res.status(201).json({ uploadedCount: uploaded.length, skippedCount: skipped.length, uploaded, skipped });
    } catch (error) {
      console.error('Upload media images error:', error);
      res.status(500).json({ error: 'Failed to upload media images' });
    }
  }

  static async renameImage(req: Request, res: Response) {
    try {
      const filePath = getSafeImagePath(req.params.folder, req.params.fileName);
      const extension = path.extname(req.params.fileName).toLowerCase();
      const nextBaseName = sanitizeFolderName(typeof req.body?.name === 'string' ? req.body.name : '');
      if (!filePath || !nextBaseName) {
        return res.status(400).json({ error: 'Valid image name is required' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const nextPath = getSafeImagePath(req.params.folder, `${nextBaseName}${extension}`);
      if (!nextPath) {
        return res.status(400).json({ error: 'Valid image name is required' });
      }

      if (fs.existsSync(nextPath)) {
        return res.status(409).json({ error: 'Image name already exists' });
      }

      await fs.promises.rename(filePath, nextPath);
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.image_renamed',
        entityType: 'media-image',
        entityId: `${req.params.folder}/${path.basename(nextPath)}`,
        details: JSON.stringify({ from: req.params.fileName, to: path.basename(nextPath) }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: req.params.folder });
      res.json({ fileName: path.basename(nextPath) });
    } catch (error) {
      console.error('Rename media image error:', error);
      res.status(500).json({ error: 'Failed to rename media image' });
    }
  }

  static async deleteImage(req: Request, res: Response) {
    try {
      const filePath = getSafeImagePath(req.params.folder, req.params.fileName);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const parsed = path.parse(filePath);
      const thumbDirectory = path.join(path.dirname(filePath), 'thumbs');
      await fs.promises.rm(filePath, { force: true });
      await Promise.all([96, 256, 480].map((width) => fs.promises.rm(path.join(thumbDirectory, `${parsed.name}-${width}.webp`), { force: true })));
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.image_deleted',
        entityType: 'media-image',
        entityId: `${req.params.folder}/${req.params.fileName}`,
        details: JSON.stringify({ folder: req.params.folder, fileName: req.params.fileName }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: req.params.folder });
      res.status(204).send();
    } catch (error) {
      console.error('Delete media image error:', error);
      res.status(500).json({ error: 'Failed to delete media image' });
    }
  }
}
