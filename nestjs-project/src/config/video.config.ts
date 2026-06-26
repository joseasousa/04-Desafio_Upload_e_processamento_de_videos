import { registerAs } from '@nestjs/config';

export default registerAs('video', () => ({
  maxSizeBytes: Number(process.env.VIDEO_MAX_SIZE_BYTES ?? 10 * 1024 ** 3),
}));
