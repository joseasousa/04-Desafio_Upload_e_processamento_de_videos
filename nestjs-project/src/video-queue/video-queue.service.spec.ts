import { Queue } from 'bullmq';
import { VIDEO_PROCESSING_JOB } from '../videos/video.constants';
import { VideoQueueService } from './video-queue.service';

describe('VideoQueueService', () => {
  it('publishes processing jobs with the video id as job id', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = {
      add,
    } as unknown as Queue;
    const service = new VideoQueueService(queue);

    await service.enqueueProcessing('video-1');

    expect(add).toHaveBeenCalledWith(
      VIDEO_PROCESSING_JOB,
      { video_id: 'video-1' },
      expect.objectContaining({ jobId: 'video-1', attempts: 3 }),
    );
  });
});
