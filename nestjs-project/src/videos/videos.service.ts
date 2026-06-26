import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  VideoForbiddenException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadNotActiveException,
} from '../common/exceptions/domain.exception';
import videoConfig from '../config/video.config';
import { StorageService } from '../storage/storage.service';
import { VideoQueueService } from '../video-queue/video-queue.service';
import { StartVideoUploadDto } from './dto/start-video-upload.dto';
import { Video, VideoStatus } from './entities/video.entity';
import { generateVideoSlug } from './video-slug.util';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
    private readonly videoQueueService: VideoQueueService,
    @Inject(videoConfig.KEY)
    private readonly videoCfg: ConfigType<typeof videoConfig>,
  ) {}

  async startUpload(userId: string, dto: StartVideoUploadDto): Promise<Video> {
    if (dto.size_bytes > this.videoCfg.maxSizeBytes) {
      throw new VideoUploadNotActiveException();
    }

    const channel = await this.channelRepository.findOne({
      where: { user_id: userId },
    });
    if (!channel) throw new VideoForbiddenException();

    const slug = await this.generateUniqueSlug();
    const storageKey = `videos/${channel.id}/${slug}/${dto.original_file_name}`;

    const video = this.videoRepository.create({
      channel_id: channel.id,
      title: dto.title,
      original_file_name: dto.original_file_name,
      mime_type: dto.mime_type,
      size_bytes: String(dto.size_bytes),
      status: VideoStatus.DRAFT,
      storage_key: storageKey,
      thumbnail_key: null,
      duration_seconds: null,
      metadata: null,
      slug,
      upload_id: null,
      failure_reason: null,
    });

    const saved = await this.videoRepository.save(video);
    const uploadId = await this.storageService.createMultipartUpload({
      key: saved.storage_key,
      contentType: saved.mime_type,
    });
    saved.upload_id = uploadId;
    saved.status = VideoStatus.UPLOADING;
    return this.videoRepository.save(saved);
  }

  async presignParts(
    userId: string,
    videoId: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ part_number: number; url: string }[]> {
    const video = await this.getOwnedVideo(userId, videoId);
    this.assertActiveUpload(video, uploadId);
    return this.storageService.presignUploadParts({
      key: video.storage_key,
      uploadId,
      partNumbers: [...new Set(partNumbers)].sort((a, b) => a - b),
    });
  }

  async completeUpload(
    userId: string,
    videoId: string,
    uploadId: string,
    parts: { part_number: number; etag: string }[],
  ): Promise<Video> {
    const video = await this.getOwnedVideo(userId, videoId);
    this.assertActiveUpload(video, uploadId);
    await this.storageService.completeMultipartUpload({
      key: video.storage_key,
      uploadId,
      parts,
    });
    video.status = VideoStatus.PROCESSING;
    video.upload_id = null;
    const saved = await this.videoRepository.save(video);
    await this.videoQueueService.enqueueProcessing(saved.id);
    return saved;
  }

  async abortUpload(
    userId: string,
    videoId: string,
    uploadId: string,
  ): Promise<void> {
    const video = await this.getOwnedVideo(userId, videoId);
    this.assertActiveUpload(video, uploadId);
    await this.storageService.abortMultipartUpload(video.storage_key, uploadId);
    video.status = VideoStatus.FAILED;
    video.upload_id = null;
    video.failure_reason = 'Upload aborted';
    await this.videoRepository.save(video);
  }

  async findReadyBySlug(slug: string): Promise<Video> {
    const video = await this.videoRepository.findOne({ where: { slug } });
    if (!video) throw new VideoNotFoundException();
    if (video.status !== VideoStatus.READY) throw new VideoNotReadyException();
    return video;
  }

  async findById(videoId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }

  async markProcessingResult(params: {
    videoId: string;
    durationSeconds: number;
    metadata: Record<string, unknown>;
    thumbnailKey: string;
  }): Promise<void> {
    const video = await this.findById(params.videoId);
    if (video.status !== VideoStatus.PROCESSING) return;
    video.status = VideoStatus.READY;
    video.duration_seconds = params.durationSeconds;
    video.metadata = params.metadata;
    video.thumbnail_key = params.thumbnailKey;
    video.failure_reason = null;
    await this.videoRepository.save(video);
  }

  async markProcessingFailed(
    videoId: string,
    failureReason: string,
  ): Promise<void> {
    const video = await this.findById(videoId);
    if (video.status !== VideoStatus.PROCESSING) return;
    video.status = VideoStatus.FAILED;
    video.failure_reason = failureReason.slice(0, 2000);
    await this.videoRepository.save(video);
  }

  private async getOwnedVideo(userId: string, videoId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel'],
    });
    if (!video) throw new VideoNotFoundException();
    if (video.channel.user_id !== userId) throw new VideoForbiddenException();
    return video;
  }

  private assertActiveUpload(video: Video, uploadId: string): void {
    if (
      video.status !== VideoStatus.UPLOADING ||
      !video.upload_id ||
      video.upload_id !== uploadId
    ) {
      throw new VideoUploadNotActiveException();
    }
  }

  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const slug = generateVideoSlug();
      const existing = await this.videoRepository.exists({ where: { slug } });
      if (!existing) return slug;
    }
    throw new VideoUploadNotActiveException();
  }
}
