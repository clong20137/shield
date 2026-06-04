import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp']);
const mediaFolders = [
  { key: 'profile-pictures', label: 'Profile Pictures' },
  { key: 'dashboard-posts', label: 'Dashboard Posts' },
] as const;

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
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      const selectedFolder = typeof req.query.folder === 'string' ? req.query.folder : '';
      const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 60, 12), 120);
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
      }> = [];

      for (const folder of mediaFolders) {
        const folderPath = path.join(uploadsRoot, folder.key);
        let folderCount = 0;
        let folderSize = 0;
        let folderUpdatedAt: Date | null = null;

        if (!fs.existsSync(folderPath)) {
          folders.push({ key: folder.key, label: folder.label, count: 0, size: 0, updatedAt: null });
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
}
