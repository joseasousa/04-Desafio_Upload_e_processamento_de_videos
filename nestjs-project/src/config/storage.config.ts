import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  publicEndpoint:
    process.env.STORAGE_PUBLIC_ENDPOINT ??
    process.env.STORAGE_ENDPOINT ??
    'http://localhost:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'streamtube',
  bucket: process.env.STORAGE_BUCKET ?? 'streamtube-videos',
  presignedExpiresSeconds: Number(
    process.env.STORAGE_PRESIGNED_EXPIRES_SECONDS ?? 900,
  ),
}));
