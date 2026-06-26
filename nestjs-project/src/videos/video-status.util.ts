import { VideoStatus } from './entities/video.entity';

const allowedTransitions: Record<VideoStatus, VideoStatus[]> = {
  [VideoStatus.DRAFT]: [VideoStatus.UPLOADING, VideoStatus.FAILED],
  [VideoStatus.UPLOADING]: [VideoStatus.PROCESSING, VideoStatus.FAILED],
  [VideoStatus.PROCESSING]: [VideoStatus.READY, VideoStatus.FAILED],
  [VideoStatus.READY]: [],
  [VideoStatus.FAILED]: [],
};

export function canTransitionVideoStatus(
  from: VideoStatus,
  to: VideoStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}
