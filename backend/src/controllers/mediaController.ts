import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { AuditLogModel } from '../models/AuditLog';
import { AuthAccountModel } from '../models/AuthAccount';
import { UserModel } from '../models/User';
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
const profilePicturesFolder = 'profile-pictures';

interface MediaUsageRecord {
  url: string;
  source: 'user-profile' | 'dashboard-post' | 'message-thread';
  label: string;
  detail: string;
  entityId: string;
}

interface MediaUsageRow extends RowDataPacket {
  source: MediaUsageRecord['source'];
  url: string;
  entityId: string;
  label: string | null;
  detail: string | null;
}

interface MediaImageRequestItem {
  folder?: unknown;
  fileName?: unknown;
}

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

function sanitizeFolderPath(value: string): string {
  return value
    .replace(/\\/gu, '/')
    .split('/')
    .map((part) => sanitizeFolderName(part))
    .filter(Boolean)
    .join('/');
}

function getCustomFolderLabel(folderKey: string): string {
  const displayKey = folderKey.split('/').filter(Boolean).pop() || folderKey;
  return displayKey
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
  const cleanFolder = sanitizeFolderPath(folderKey);
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

function getFolderDefinitions(): Array<{ key: string; label: string; parentKey: string; depth: number; protected: boolean }> {
  const uploadsRoot = getUploadsRoot();
  const builtinFolders = mediaFolders.map((folder) => ({ ...folder, parentKey: '', depth: 0, protected: true }));

  if (!fs.existsSync(uploadsRoot)) {
    return builtinFolders;
  }

  const discoveredFolders: Array<{ key: string; label: string; parentKey: string; depth: number; protected: boolean }> = [];
  const visitFolder = (absoluteFolderPath: string, relativeFolderPath = '') => {
    for (const entry of fs.readdirSync(absoluteFolderPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'thumbs') {
        continue;
      }

      const key = sanitizeFolderPath([relativeFolderPath, entry.name].filter(Boolean).join('/'));
      if (!key || protectedFolders.has(key)) {
        if (protectedFolders.has(key)) {
          visitFolder(path.join(absoluteFolderPath, entry.name), key);
        }
        continue;
      }

      const parentKey = key.split('/').slice(0, -1).join('/');
      discoveredFolders.push({
        key,
        label: getCustomFolderLabel(key),
        parentKey,
        depth: parentKey ? parentKey.split('/').length : 0,
        protected: false,
      });
      visitFolder(path.join(absoluteFolderPath, entry.name), key);
    }
  };

  visitFolder(uploadsRoot);

  return [...builtinFolders, ...discoveredFolders].sort((a, b) => Number(b.protected) - Number(a.protected) || a.key.localeCompare(b.key));
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

async function deleteImageFileAndThumbnails(filePath: string) {
  const parsed = path.parse(filePath);
  const thumbDirectory = path.join(path.dirname(filePath), 'thumbs');
  await fs.promises.rm(filePath, { force: true });
  await Promise.all([96, 256, 480].map((width) => fs.promises.rm(path.join(thumbDirectory, `${parsed.name}-${width}.webp`), { force: true })));
}

function getImageUrlFromItem(folder: string, fileName: string): string | null {
  const filePath = getSafeImagePath(folder, fileName);
  if (!filePath) {
    return null;
  }

  return getUploadUrl(path.relative(getUploadsRoot(), filePath));
}

function collectImageUrlsFromFolder(folderPath: string): string[] {
  const uploadsRoot = getUploadsRoot();
  const urls: string[] = [];

  const visitFolder = (absoluteFolderPath: string) => {
    if (!fs.existsSync(absoluteFolderPath)) {
      return;
    }

    for (const entry of fs.readdirSync(absoluteFolderPath, { withFileTypes: true })) {
      if (entry.name === 'thumbs') {
        continue;
      }

      const entryPath = path.join(absoluteFolderPath, entry.name);
      if (entry.isDirectory()) {
        visitFolder(entryPath);
        continue;
      }

      if (entry.isFile() && allowedImageExtensions.has(path.extname(entry.name).toLowerCase())) {
        urls.push(getUploadUrl(path.relative(uploadsRoot, entryPath)));
      }
    }
  };

  visitFolder(folderPath);
  return urls;
}

async function getMediaUsageByUrls(urls: string[]): Promise<MediaUsageRecord[]> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) {
    return [];
  }

  const conn = await pool.getConnection();
  try {
    const [userRows] = await conn.query<MediaUsageRow[]>(
      `SELECT 'user-profile' AS source,
              \`profilePictureUrl\` AS url,
              \`id\` AS entityId,
              TRIM(CONCAT(COALESCE(\`firstName\`, ''), ' ', COALESCE(\`lastName\`, ''))) AS label,
              COALESCE(\`email\`, \`peNumber\`, '') AS detail
       FROM users
       WHERE \`profilePictureUrl\` IN (?)`,
      [uniqueUrls],
    );
    const [postRows] = await conn.query<MediaUsageRow[]>(
      `SELECT 'dashboard-post' AS source,
              \`imageUrl\` AS url,
              \`id\` AS entityId,
              \`title\` AS label,
              \`category\` AS detail
       FROM dashboard_posts
       WHERE \`imageUrl\` IN (?)`,
      [uniqueUrls],
    );
    const [messageRows] = await conn.query<MediaUsageRow[]>(
      `SELECT 'message-thread' AS source,
              \`threadImageUrl\` AS url,
              COALESCE(\`threadId\`, \`id\`) AS entityId,
              COALESCE(\`threadTitle\`, 'Group message') AS label,
              COALESCE(\`threadParticipantNames\`, '') AS detail
       FROM user_messages
       WHERE \`threadImageUrl\` IN (?)
       GROUP BY \`threadImageUrl\`, COALESCE(\`threadId\`, \`id\`), COALESCE(\`threadTitle\`, 'Group message'), COALESCE(\`threadParticipantNames\`, '')`,
      [uniqueUrls],
    );

    return [...userRows, ...postRows, ...messageRows].map((row) => ({
      url: row.url,
      source: row.source,
      entityId: row.entityId,
      label: row.label || 'Untitled',
      detail: row.detail || '',
    }));
  } finally {
    conn.release();
  }
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
      const safeSelectedFolder = selectedFolder ? sanitizeFolderPath(selectedFolder) : '';
      if (selectedFolder && selectedFolder !== safeSelectedFolder) {
        return res.status(400).json({ error: 'Valid folder is required' });
      }
      const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 60, 12), 120);
      const hasFullMediaAccess = account.role === 'administrator' || await canUseFullMediaLibrary(account.id);
      const hasProfilePictureMediaAccess = account.role === 'administrator' || await canUseProfilePictureMedia(account.id);
      const hasDashboardMediaAccess = account.role === 'administrator' || await canUseDashboardMedia(account.id);
      const canReadSelectedProfilePictures = hasProfilePictureMediaAccess && (!safeSelectedFolder || safeSelectedFolder === 'profile-pictures');

      if (!hasFullMediaAccess && !canReadSelectedProfilePictures && (!hasDashboardMediaAccess || safeSelectedFolder !== dashboardMediaFolder)) {
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
        parentKey: string;
        depth: number;
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
        const folderPath = path.join(uploadsRoot, ...folder.key.split('/'));
        let folderCount = 0;
        let folderSize = 0;
        let folderUpdatedAt: Date | null = null;

        if (!fs.existsSync(folderPath)) {
          folders.push({ key: folder.key, label: folder.label, count: 0, size: 0, updatedAt: null, parentKey: folder.parentKey, depth: folder.depth, protected: folder.protected });
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

          if (safeSelectedFolder && safeSelectedFolder !== folder.key) {
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
          parentKey: folder.parentKey,
          depth: folder.depth,
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
      const parentKey = typeof req.body?.parent === 'string' ? sanitizeFolderPath(req.body.parent) : '';
      const folderName = sanitizeFolderName(name);
      const folderKey = sanitizeFolderPath([parentKey, folderName].filter(Boolean).join('/'));
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
      res.status(201).json({ key: folderKey, label: getCustomFolderLabel(folderKey), count: 0, size: 0, updatedAt: null, parentKey, depth: parentKey ? parentKey.split('/').length : 0, protected: false });
    } catch (error) {
      console.error('Create media folder error:', error);
      res.status(500).json({ error: 'Failed to create media folder' });
    }
  }

  static async renameFolder(req: Request, res: Response) {
    try {
      const currentFolder = sanitizeFolderPath(req.params.folder || req.body?.folder || '');
      if (protectedFolders.has(currentFolder)) {
        return res.status(400).json({ error: 'System folders cannot be renamed' });
      }

      const parentKey = currentFolder.split('/').slice(0, -1).join('/');
      const nextFolderName = sanitizeFolderName(typeof req.body?.name === 'string' ? req.body.name : '');
      const nextFolder = sanitizeFolderPath([parentKey, nextFolderName].filter(Boolean).join('/'));
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
      const folderKey = sanitizeFolderPath(req.params.folder || req.body?.folder || '');
      if (protectedFolders.has(folderKey)) {
        return res.status(400).json({ error: 'System folders cannot be deleted' });
      }

      const folderPath = getSafeFolderPath(folderKey);
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const usages = await getMediaUsageByUrls(collectImageUrlsFromFolder(folderPath));
      if (usages.length > 0) {
        return res.status(409).json({
          error: 'Folder contains media that is currently in use.',
          usages,
        });
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

  static async moveImages(req: Request, res: Response) {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const targetFolder = sanitizeFolderPath(typeof req.body?.targetFolder === 'string' ? req.body.targetFolder : '');
      const targetFolderPath = getSafeFolderPath(targetFolder);
      if (!targetFolderPath || !fs.existsSync(targetFolderPath)) {
        return res.status(400).json({ error: 'Valid destination folder is required' });
      }

      let movedCount = 0;
      const skipped: Array<{ fileName: string; reason: string }> = [];
      for (const item of items.slice(0, 300)) {
        const sourceFolder = sanitizeFolderPath(typeof item?.folder === 'string' ? item.folder : '');
        const fileName = typeof item?.fileName === 'string' ? item.fileName : '';
        const sourcePath = getSafeImagePath(sourceFolder, fileName);
        const destinationPath = getSafeImagePath(targetFolder, fileName);
        if (!sourcePath || !destinationPath || !fs.existsSync(sourcePath)) {
          skipped.push({ fileName, reason: 'Image not found' });
          continue;
        }

        if (sourceFolder === targetFolder) {
          skipped.push({ fileName, reason: 'Already in destination' });
          continue;
        }

        let finalDestinationPath = destinationPath;
        if (fs.existsSync(finalDestinationPath)) {
          const parsed = path.parse(fileName);
          finalDestinationPath = getSafeImagePath(targetFolder, `${parsed.name}-${Date.now()}${parsed.ext}`) || destinationPath;
        }

        await fs.promises.rename(sourcePath, finalDestinationPath);
        const sourceThumbDirectory = path.join(path.dirname(sourcePath), 'thumbs');
        const destinationThumbDirectory = path.join(path.dirname(finalDestinationPath), 'thumbs');
        await fs.promises.mkdir(destinationThumbDirectory, { recursive: true });
        const sourceParsed = path.parse(sourcePath);
        const destinationParsed = path.parse(finalDestinationPath);
        await Promise.all([96, 256, 480].map(async (width) => {
          const sourceThumb = path.join(sourceThumbDirectory, `${sourceParsed.name}-${width}.webp`);
          const destinationThumb = path.join(destinationThumbDirectory, `${destinationParsed.name}-${width}.webp`);
          if (fs.existsSync(sourceThumb)) {
            await fs.promises.rename(sourceThumb, destinationThumb);
          }
        }));
        movedCount += 1;
      }

      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.images_moved',
        entityType: 'media-folder',
        entityId: targetFolder,
        details: JSON.stringify({ targetFolder, movedCount, skippedCount: skipped.length }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: targetFolder });
      res.json({ movedCount, skipped });
    } catch (error) {
      console.error('Move media images error:', error);
      res.status(500).json({ error: 'Failed to move media images' });
    }
  }

  static async deleteImages(req: Request, res: Response) {
    try {
      const items: MediaImageRequestItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
      const urlsToDelete = items.slice(0, 300)
        .map((item: MediaImageRequestItem) => {
          const folder = sanitizeFolderPath(typeof item?.folder === 'string' ? item.folder : '');
          const fileName = typeof item?.fileName === 'string' ? item.fileName : '';
          return getImageUrlFromItem(folder, fileName);
        })
        .filter((url: string | null): url is string => Boolean(url));
      const usages = await getMediaUsageByUrls(urlsToDelete);
      if (usages.length > 0) {
        return res.status(409).json({
          error: 'One or more selected images are currently in use.',
          usages,
        });
      }

      let deletedCount = 0;
      const skipped: Array<{ fileName: string; reason: string }> = [];
      for (const item of items.slice(0, 300)) {
        const folder = sanitizeFolderPath(typeof item?.folder === 'string' ? item.folder : '');
        const fileName = typeof item?.fileName === 'string' ? item.fileName : '';
        const filePath = getSafeImagePath(folder, fileName);
        if (!filePath || !fs.existsSync(filePath)) {
          skipped.push({ fileName, reason: 'Image not found' });
          continue;
        }

        await deleteImageFileAndThumbnails(filePath);
        deletedCount += 1;
      }

      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.images_deleted',
        entityType: 'media-image',
        entityId: 'bulk',
        details: JSON.stringify({ deletedCount, skippedCount: skipped.length }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: 'bulk' });
      res.json({ deletedCount, skipped });
    } catch (error) {
      console.error('Bulk delete media images error:', error);
      res.status(500).json({ error: 'Failed to delete media images' });
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
      const folder = sanitizeFolderPath(req.params.folder || req.body?.folder || '');
      const fileName = typeof (req.params.fileName || req.body?.fileName) === 'string' ? (req.params.fileName || req.body?.fileName) : '';
      const filePath = getSafeImagePath(folder, fileName);
      const extension = path.extname(fileName).toLowerCase();
      const nextBaseName = sanitizeFolderName(typeof req.body?.name === 'string' ? req.body.name : '');
      if (!filePath || !nextBaseName) {
        return res.status(400).json({ error: 'Valid image name is required' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const nextPath = getSafeImagePath(folder, `${nextBaseName}${extension}`);
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
        entityId: `${folder}/${path.basename(nextPath)}`,
        details: JSON.stringify({ from: fileName, to: path.basename(nextPath) }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: folder });
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

      const imageUrl = getUploadUrl(path.relative(getUploadsRoot(), filePath));
      const usages = await getMediaUsageByUrls([imageUrl]);
      if (usages.length > 0) {
        return res.status(409).json({
          error: 'This image is currently in use.',
          usages,
        });
      }

      await deleteImageFileAndThumbnails(filePath);
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

  static async getImageUsage(req: Request, res: Response) {
    try {
      const items: MediaImageRequestItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
      const urls = items.slice(0, 300)
        .map((item: MediaImageRequestItem) => {
          const folder = sanitizeFolderPath(typeof item?.folder === 'string' ? item.folder : '');
          const fileName = typeof item?.fileName === 'string' ? item.fileName : '';
          return getImageUrlFromItem(folder, fileName);
        })
        .filter((url: string | null): url is string => Boolean(url));

      const usages = await getMediaUsageByUrls(urls);
      res.json({ usages });
    } catch (error) {
      console.error('Get media usage error:', error);
      res.status(500).json({ error: 'Failed to check media usage' });
    }
  }

  static async deleteAllProfilePictures(req: Request, res: Response) {
    try {
      const folderPath = getSafeFolderPath(profilePicturesFolder);
      if (!folderPath) {
        return res.status(500).json({ error: 'Profile picture folder is unavailable' });
      }

      const uploadsRoot = getUploadsRoot();
      const deletedUrls: string[] = [];
      let deletedCount = 0;
      const requestedBatchSize = Number(req.query.batchSize);
      const batchSize = Number.isFinite(requestedBatchSize) && requestedBatchSize > 0
        ? Math.min(Math.floor(requestedBatchSize), 100)
        : 0;
      const profileImageFiles: string[] = [];

      if (fs.existsSync(folderPath)) {
        for (const fileName of fs.readdirSync(folderPath)) {
          const filePath = path.join(folderPath, fileName);
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || !allowedImageExtensions.has(path.extname(fileName).toLowerCase())) {
            continue;
          }

          profileImageFiles.push(filePath);
        }
      }

      const filesToDelete = batchSize > 0 ? profileImageFiles.slice(0, batchSize) : profileImageFiles;
      for (const filePath of filesToDelete) {
        const relativePath = path.relative(uploadsRoot, filePath);
        deletedUrls.push(getUploadUrl(relativePath));
        await deleteImageFileAndThumbnails(filePath);
        deletedCount += 1;
      }

      const clearedUserCount = await UserModel.clearProfilePicturesByUrls(deletedUrls);
      const totalCount = profileImageFiles.length;
      const remainingCount = Math.max(totalCount - deletedCount, 0);
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'media.profile_pictures_deleted',
        entityType: 'media-folder',
        entityId: profilePicturesFolder,
        details: JSON.stringify({ folder: profilePicturesFolder, deletedCount, clearedUserCount, remainingCount }),
        ...requestAuditFields(req),
      });
      broadcastAppEvent({ type: 'media-updated', entityId: profilePicturesFolder });
      broadcastAppEvent({ type: 'user-updated' });
      res.json({ deletedCount, clearedUserCount, totalCount, remainingCount, done: remainingCount === 0 });
    } catch (error) {
      console.error('Delete all profile pictures error:', error);
      res.status(500).json({ error: 'Failed to delete profile pictures' });
    }
  }
}
