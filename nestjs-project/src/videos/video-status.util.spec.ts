import { VideoStatus } from './entities/video.entity';
import { canTransitionVideoStatus } from './video-status.util';

describe('canTransitionVideoStatus', () => {
  it('allows the expected upload and processing lifecycle', () => {
    expect(
      canTransitionVideoStatus(VideoStatus.DRAFT, VideoStatus.UPLOADING),
    ).toBe(true);
    expect(
      canTransitionVideoStatus(VideoStatus.UPLOADING, VideoStatus.PROCESSING),
    ).toBe(true);
    expect(
      canTransitionVideoStatus(VideoStatus.PROCESSING, VideoStatus.READY),
    ).toBe(true);
  });

  it('prevents ready videos from moving backwards', () => {
    expect(
      canTransitionVideoStatus(VideoStatus.READY, VideoStatus.PROCESSING),
    ).toBe(false);
  });
});
