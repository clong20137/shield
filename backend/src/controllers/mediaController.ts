import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
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

      for (const folder of mediaFolders) {
        const folderPath = path.join(uploadsRoot, folder.key);
        if (!fs.existsSync(folderPath)) {
          continue;
        }

        for (const fileName of fs.readdirSync(folderPath)) {
          const filePath = path.join(folderPath, fileName);
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || !allowedImageExtensions.has(path.extname(fileName).toLowerCase())) {
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
      }

      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json(items);
    } catch (error) {
      console.error('List media error:', error);
      res.status(500).json({ error: 'Failed to load media library' });
    }
  }
}
