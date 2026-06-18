import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { broadcastAppEvent } from '../services/appEvents';

const soundUploadFolder = 'notification-sounds';
const allowedAudioExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm']);
const allowedAudioMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
]);

function getUploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads');
}

function getSoundFolderPath(): string {
  return path.join(getUploadsRoot(), soundUploadFolder);
}

function sanitizeSoundLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80) || 'Notification sound';
}

function getSafeSoundPath(fileName: string): string | null {
  const baseName = path.basename(fileName);
  if (baseName !== fileName || !allowedAudioExtensions.has(path.extname(baseName).toLowerCase())) {
    return null;
  }

  const folderPath = getSoundFolderPath();
  const filePath = path.resolve(folderPath, baseName);
  return filePath.startsWith(folderPath + path.sep) ? filePath : null;
}

function getSoundItems() {
  const folderPath = getSoundFolderPath();
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  return fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && allowedAudioExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const filePath = path.join(folderPath, entry.name);
      const stat = fs.statSync(filePath);
      const originalName = entry.name.replace(/^[a-f0-9-]+-/iu, '');
      return {
        id: entry.name,
        label: sanitizeSoundLabel(originalName),
        url: `/uploads/${soundUploadFolder}/${entry.name}`,
        size: stat.size,
        updatedAt: stat.mtime,
      };
    })
    .sort((first, second) => first.label.localeCompare(second.label));
}

export class NotificationSoundController {
  static async list(req: Request, res: Response) {
    try {
      res.json({ sounds: getSoundItems() });
    } catch (error) {
      console.error('List notification sounds error:', error);
      res.status(500).json({ error: 'Failed to load notification sounds' });
    }
  }

  static async upload(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Choose an audio file to upload' });
      }

      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowedAudioExtensions.has(extension) || !allowedAudioMimeTypes.has(file.mimetype)) {
        return res.status(400).json({ error: 'Only MP3, WAV, OGG, M4A, AAC, and WEBM audio files are allowed' });
      }

      const folderPath = getSoundFolderPath();
      fs.mkdirSync(folderPath, { recursive: true });
      const safeOriginalName = path.basename(file.originalname)
        .replace(/[^a-z0-9._-]/giu, '-')
        .replace(/-+/gu, '-')
        .slice(-90);
      const fileName = `${uuidv4()}-${safeOriginalName || `sound${extension}`}`;
      const filePath = path.join(folderPath, fileName);
      fs.writeFileSync(filePath, file.buffer);

      broadcastAppEvent({ type: 'settings-updated', entityId: 'notification-sounds' });
      res.status(201).json({
        sound: {
          id: fileName,
          label: sanitizeSoundLabel(file.originalname),
          url: `/uploads/${soundUploadFolder}/${fileName}`,
          size: file.size,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Upload notification sound error:', error);
      res.status(500).json({ error: 'Failed to upload notification sound' });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const filePath = getSafeSoundPath(req.params.id);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Notification sound not found' });
      }

      fs.unlinkSync(filePath);
      broadcastAppEvent({ type: 'settings-updated', entityId: 'notification-sounds' });
      res.json({ message: 'Notification sound deleted' });
    } catch (error) {
      console.error('Delete notification sound error:', error);
      res.status(500).json({ error: 'Failed to delete notification sound' });
    }
  }
}
