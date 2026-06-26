import {
  VideoForbiddenException,
  VideoNotReadyException,
  VideoUploadNotActiveException,
} from '../common/exceptions/domain.exception';
import { VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';

function createRepositoryMock<T>() {
  return {
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn((value: T) => value),
    save: jest.fn((value: T) => Promise.resolve({ id: 'video-id', ...value })),
  };
}

describe('VideosService', () => {
  const storageService = {
    createMultipartUpload: jest.fn(),
    presignUploadParts: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  };
  const queueService = { enqueueProcessing: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a draft, starts multipart upload, and returns uploading video', async () => {
    const videoRepository = createRepositoryMock<any>();
    const channelRepository = createRepositoryMock<any>();
    channelRepository.findOne.mockResolvedValue({
      id: 'channel-id',
      user_id: 'user-id',
    });
    videoRepository.exists.mockResolvedValue(false);
    storageService.createMultipartUpload.mockResolvedValue('upload-id');
    const service = new VideosService(
      videoRepository as any,
      channelRepository as any,
      storageService as any,
      queueService as any,
      { maxSizeBytes: 1000 },
    );

    const result = await service.startUpload('user-id', {
      title: 'Video',
      original_file_name: 'video.mp4',
      mime_type: 'video/mp4',
      size_bytes: 500,
    });

    expect(result.status).toBe(VideoStatus.UPLOADING);
    expect(result.upload_id).toBe('upload-id');
    expect(storageService.createMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'video/mp4' }),
    );
  });

  it('rejects upload larger than configured limit', async () => {
    const service = new VideosService(
      createRepositoryMock<any>() as any,
      createRepositoryMock<any>() as any,
      storageService as any,
      queueService as any,
      { maxSizeBytes: 10 },
    );

    await expect(
      service.startUpload('user-id', {
        title: 'Video',
        original_file_name: 'video.mp4',
        mime_type: 'video/mp4',
        size_bytes: 11,
      }),
    ).rejects.toThrow(VideoUploadNotActiveException);
  });

  it('prevents non-owner upload completion', async () => {
    const videoRepository = createRepositoryMock<any>();
    const channelRepository = createRepositoryMock<any>();
    videoRepository.findOne.mockResolvedValue({
      id: 'video-id',
      channel: { user_id: 'other-user' },
    });
    const service = new VideosService(
      videoRepository as any,
      channelRepository as any,
      storageService as any,
      queueService as any,
      { maxSizeBytes: 1000 },
    );

    await expect(
      service.completeUpload('user-id', 'video-id', 'upload-id', []),
    ).rejects.toThrow(VideoForbiddenException);
  });

  it('completes upload and enqueues processing', async () => {
    const videoRepository = createRepositoryMock<any>();
    const channelRepository = createRepositoryMock<any>();
    videoRepository.findOne.mockResolvedValue({
      id: 'video-id',
      channel: { user_id: 'user-id' },
      status: VideoStatus.UPLOADING,
      upload_id: 'upload-id',
      storage_key: 'key',
    });
    const service = new VideosService(
      videoRepository as any,
      channelRepository as any,
      storageService as any,
      queueService as any,
      { maxSizeBytes: 1000 },
    );

    await service.completeUpload('user-id', 'video-id', 'upload-id', [
      { part_number: 1, etag: 'etag' },
    ]);

    expect(storageService.completeMultipartUpload).toHaveBeenCalled();
    expect(queueService.enqueueProcessing).toHaveBeenCalledWith('video-id');
  });

  it('does not expose non-ready public videos', async () => {
    const videoRepository = createRepositoryMock<any>();
    videoRepository.findOne.mockResolvedValue({
      status: VideoStatus.PROCESSING,
    });
    const service = new VideosService(
      videoRepository as any,
      createRepositoryMock<any>() as any,
      storageService as any,
      queueService as any,
      { maxSizeBytes: 1000 },
    );

    await expect(service.findReadyBySlug('slug')).rejects.toThrow(
      VideoNotReadyException,
    );
  });
});
