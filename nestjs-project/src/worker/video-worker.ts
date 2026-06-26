import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { VideoProcessingWorker } from './video-processing.worker';

async function bootstrap(): Promise<void> {
  const logger = new Logger('VideoWorkerBootstrap');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const worker = app.get(VideoProcessingWorker);
  worker.start();
  logger.log('Video worker started');

  const shutdown = async () => {
    logger.log('Stopping video worker');
    await worker.close();
    await app.close();
  };

  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
}

void bootstrap();
