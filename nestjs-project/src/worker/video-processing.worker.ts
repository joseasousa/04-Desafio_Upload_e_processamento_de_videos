import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Worker } from 'bullmq';
import { pipeline } from 'stream/promises';
import queueConfig from '../config/queue.config';
import { StorageService } from '../storage/storage.service';
import {
  VIDEO_PROCESSING_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../videos/video.constants';
import { VideoStatus } from '../videos/entities/video.entity';
import { VideosService } from '../videos/videos.service';

const execFileAsync = promisify(execFile);

interface VideoProcessingPayload {
  video_id: string;
}

interface FfprobeFormat {
  duration?: string;
  format_name?: string;
  bit_rate?: string;
}

interface FfprobeResult {
  format?: FfprobeFormat;
  streams?: unknown[];
}

@Injectable()
export class VideoProcessingWorker {
  private readonly logger = new Logger(VideoProcessingWorker.name);
  private worker: Worker<VideoProcessingPayload> | null = null;

  constructor(
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
    @Inject(queueConfig.KEY)
    private readonly queueCfg: ConfigType<typeof queueConfig>,
  ) {}

  start(): void {
    this.worker = new Worker<VideoProcessingPayload>(
      VIDEO_PROCESSING_QUEUE,
      async (job) => {
        if (job.name !== VIDEO_PROCESSING_JOB) return;
        await this.processVideo(job.data.video_id);
      },
      {
        connection: {
          host: this.queueCfg.host,
          port: this.queueCfg.port,
          maxRetriesPerRequest: null,
        },
      },
    );
  }

  async close(): Promise<void> {
    await this.worker?.close();
  }

  async processVideo(videoId: string): Promise<void> {
    const video = await this.videosService.findById(videoId);
    if (video.status !== VideoStatus.PROCESSING) return;

    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'streamtube-'));
    const inputPath = path.join(workspace, video.original_file_name);
    const thumbnailPath = path.join(workspace, 'thumbnail.jpg');
    const thumbnailKey = `thumbnails/${video.channel_id}/${video.slug}.jpg`;

    try {
      const source = await this.storageService.getObjectStream(
        video.storage_key,
      );
      await pipeline(
        source,
        await fs.open(inputPath, 'w').then((f) => f.createWriteStream()),
      );

      const metadata = await this.probe(inputPath);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        '00:00:01',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        thumbnailPath,
      ]);

      await this.storageService.putObject({
        key: thumbnailKey,
        body: await fs.readFile(thumbnailPath),
        contentType: 'image/jpeg',
      });

      await this.videosService.markProcessingResult({
        videoId,
        durationSeconds: this.extractDuration(metadata),
        metadata,
        thumbnailKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Video processing failed for ${videoId}: ${message}`);
      await this.videosService.markProcessingFailed(videoId, message);
      throw error;
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  }

  private async probe(inputPath: string): Promise<Record<string, unknown>> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ]);
    return JSON.parse(stdout) as FfprobeResult as Record<string, unknown>;
  }

  private extractDuration(metadata: Record<string, unknown>): number {
    const format = metadata.format as FfprobeFormat | undefined;
    const duration = Number(format?.duration ?? 0);
    return Number.isFinite(duration) ? Math.round(duration) : 0;
  }
}
