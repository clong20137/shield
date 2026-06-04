import fs from 'fs';
import path from 'path';
import multer from 'multer';

const uploadDirectory = path.join(process.cwd(), 'uploads', 'profile-pictures');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const imageSignatures: Record<string, number[][]> = {
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
};

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${allowedExtensions.has(extension) ? extension : ''}`);
  },
});

export const profilePictureUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
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

export const profilePictureImportUpload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 3000,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      cb(new Error('Only image uploads are allowed'));
      return;
    }

    cb(null, true);
  },
});

export function isSafeUploadedImage(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  const signatures = imageSignatures[extension];
  if (!signatures) {
    return false;
  }

  const fileHandle = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    fs.readSync(fileHandle, buffer, 0, buffer.length, 0);

    if (extension === '.webp') {
      return buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';
    }

    return signatures.some((signature) => signature.every((byte, index) => buffer[index] === byte));
  } finally {
    fs.closeSync(fileHandle);
  }
}
