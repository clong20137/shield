import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { isSafeUploadedImage } from './profileUpload';

const uploadDirectory = path.join(process.cwd(), 'uploads', 'messages');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp']);
const allowedAttachmentMimeTypes = new Set([
  ...allowedMimeTypes,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const allowedAttachmentExtensions = new Set([
  ...allowedExtensions,
  '.pdf',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
]);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${allowedAttachmentExtensions.has(extension) ? extension : ''}`);
  },
});

export const messageImageUpload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      cb(new Error('Only image uploads are allowed'));
      return;
    }

    cb(null, true);
  },
});

export const messageAttachmentUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedAttachmentMimeTypes.has(file.mimetype) || !allowedAttachmentExtensions.has(extension)) {
      cb(new Error('This attachment type is not allowed'));
      return;
    }

    cb(null, true);
  },
});

export function isSafeMessageImage(filePath: string): boolean {
  return isSafeUploadedImage(filePath);
}
