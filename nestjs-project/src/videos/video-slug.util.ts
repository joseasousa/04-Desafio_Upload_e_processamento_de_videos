import * as crypto from 'crypto';
import { VIDEO_SLUG_BYTES } from './video.constants';

export function generateVideoSlug(): string {
  return crypto.randomBytes(VIDEO_SLUG_BYTES).toString('base64url').slice(0, 8);
}
