import fs from 'fs';
import path from 'path';
import multer from 'multer';

const uploadDirectory = path.join(process.cwd(), 'uploads', 'memorials');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp']);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${allowedExtensions.has(extension) ? extension : ''}`);
  },
});

export const memorialPhotoUpload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      callback(new Error('Only image uploads are allowed'));
      return;
    }

    callback(null, true);
  },
});
