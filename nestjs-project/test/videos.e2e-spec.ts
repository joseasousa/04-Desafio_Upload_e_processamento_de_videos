import * as crypto from 'crypto';
import { Readable } from 'stream';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { VideoQueueService } from '../src/video-queue/video-queue.service';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';

interface TokenResponse {
  access_token: string;
}

interface UploadResponse {
  id: string;
  status: string;
  upload_id: string;
}

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let channelRepository: Repository<Channel>;
  let throttlerStorage: ThrottlerStorageService;

  const storageMock = {
    createMultipartUpload: jest.fn(),
    presignUploadParts: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    getObjectStream: jest.fn(),
  };
  const queueMock = { enqueueProcessing: jest.fn() };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .overrideProvider(VideoQueueService)
      .useValue(queueMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    channelRepository = dataSource.getRepository(Channel);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    storageMock.createMultipartUpload.mockResolvedValue('upload-id');
    storageMock.presignUploadParts.mockResolvedValue([
      { part_number: 1, url: 'http://localhost:9000/upload-part-1' },
    ]);
  });

  async function registerConfirmAndLogin(
    email: string,
    password = 'password123',
  ): Promise<string> {
    const authService = app.get(AuthService);
    // Test-only access to the private collaborator follows the existing auth E2E pattern.

    const mailServiceInstance = (authService as any).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce((_e: string, _n: string, t: string) => {
        capturedToken = t;
        return Promise.resolve();
      });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: capturedToken })
      .expect(204);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return (res.body as TokenResponse).access_token;
  }

  async function createReadyVideo(email = 'ready@example.com'): Promise<Video> {
    await registerConfirmAndLogin(email);
    const channel = await channelRepository.findOneByOrFail({
      user_id: await userIdByEmail(email),
    });
    return videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        title: 'Ready video',
        original_file_name: 'ready.mp4',
        mime_type: 'video/mp4',
        size_bytes: '11',
        status: VideoStatus.READY,
        storage_key: `videos/${channel.id}/ready.mp4`,
        thumbnail_key: 'thumbnails/ready.jpg',
        duration_seconds: 1,
        metadata: { format: { duration: '1.0' } },
        slug: crypto.randomBytes(6).toString('base64url').slice(0, 8),
        upload_id: null,
        failure_reason: null,
      }),
    );
  }

  async function userIdByEmail(email: string): Promise<string> {
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return rows[0].id;
  }

  it('rejects starting uploads without authentication', async () => {
    await request(app.getHttpServer())
      .post('/videos/uploads')
      .send({
        title: 'Video',
        original_file_name: 'video.mp4',
        mime_type: 'video/mp4',
        size_bytes: 1024,
      })
      .expect(401);
  });

  it('starts a multipart upload for the authenticated user', async () => {
    const token = await registerConfirmAndLogin('uploader@example.com');

    const res = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Video',
        original_file_name: 'video.mp4',
        mime_type: 'video/mp4',
        size_bytes: 1024,
      })
      .expect(201);

    const body = res.body as UploadResponse;
    expect(body.id).toBeDefined();
    expect(body.status).toBe(VideoStatus.UPLOADING);
    expect(body.upload_id).toBe('upload-id');
  });

  it('denies completing an upload from another channel owner', async () => {
    const ownerToken = await registerConfirmAndLogin('owner@example.com');
    const otherToken = await registerConfirmAndLogin('other@example.com');

    const upload = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Video',
        original_file_name: 'video.mp4',
        mime_type: 'video/mp4',
        size_bytes: 1024,
      })
      .expect(201);

    const uploadBody = upload.body as UploadResponse;

    await request(app.getHttpServer())
      .post(`/videos/${uploadBody.id}/uploads/${uploadBody.upload_id}/complete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ parts: [{ part_number: 1, etag: 'etag' }] })
      .expect(403);
  });

  it('streams ready videos with partial content for byte ranges', async () => {
    const video = await createReadyVideo();
    storageMock.headObject.mockResolvedValue({
      size: 11,
      contentType: 'video/mp4',
    });
    storageMock.getObjectStream.mockResolvedValue(Readable.from('hello'));

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/stream`)
      .set('Range', 'bytes=0-4')
      .expect(206);

    expect(res.headers['content-range']).toBe('bytes 0-4/11');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('downloads ready videos with attachment headers', async () => {
    const video = await createReadyVideo('download@example.com');
    storageMock.headObject.mockResolvedValue({
      size: 11,
      contentType: 'video/mp4',
    });
    storageMock.getObjectStream.mockResolvedValue(Readable.from('hello world'));

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/download`)
      .expect(200);

    expect(res.headers['content-disposition']).toContain(
      'attachment; filename="ready.mp4"',
    );
  });
});
