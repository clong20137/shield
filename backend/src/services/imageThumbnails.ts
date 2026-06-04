import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function createImageThumbnail(filePath: string, width: number): Promise<string | null> {
  const source = path.resolve(filePath);
  const directory = path.dirname(source);
  const parsed = path.parse(source);
  const thumbnailDirectory = path.join(directory, 'thumbs');
  const thumbnailPath = path.join(thumbnailDirectory, `${parsed.name}-${width}.webp`);

  await fs.promises.mkdir(thumbnailDirectory, { recursive: true });

  try {
    await sharp(source, { failOn: 'none', animated: false })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  } catch (error) {
    console.error('Failed to create image thumbnail:', error);
    return null;
  }
}

export async function createImageThumbnails(filePath: string, widths: number[]): Promise<void> {
  await Promise.all(widths.map((width) => createImageThumbnail(filePath, width)));
}
