import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface UploadedArtifact {
  localPath: string;
  key: string;
  bucket: string;
}

export function isS3Enabled(): boolean {
  return Boolean(process.env.S3_BUCKET);
}

export async function uploadRunArtifacts(runDir: string): Promise<UploadedArtifact[]> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return [];
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  const files = listFiles(runDir);
  const uploaded: UploadedArtifact[] = [];
  for (const file of files) {
    const key = `${process.env.S3_PREFIX ?? 'testhub'}/${path.relative(process.cwd(), file).replaceAll(path.sep, '/')}`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(file),
    }));
    uploaded.push({ localPath: file, key, bucket });
  }
  return uploaded;
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}
