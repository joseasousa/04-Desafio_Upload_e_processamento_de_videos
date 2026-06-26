import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CompletedPart,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';
import { VideoStorageException } from '../common/exceptions/domain.exception';

interface MultipartPart {
  part_number: number;
  etag: string;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly cfg: ConfigType<typeof storageConfig>,
  ) {
    const baseConfig = {
      region: cfg.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    };
    this.client = new S3Client({ ...baseConfig, endpoint: cfg.endpoint });
    this.presignClient = new S3Client({
      ...baseConfig,
      endpoint: cfg.publicEndpoint,
    });
  }

  async createMultipartUpload(params: {
    key: string;
    contentType: string;
  }): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        ContentType: params.contentType,
      }),
    );
    if (!result.UploadId) throw new VideoStorageException();
    return result.UploadId;
  }

  async presignUploadParts(params: {
    key: string;
    uploadId: string;
    partNumbers: number[];
  }): Promise<{ part_number: number; url: string }[]> {
    return Promise.all(
      params.partNumbers.map(async (partNumber) => {
        const command = new UploadPartCommand({
          Bucket: this.cfg.bucket,
          Key: params.key,
          UploadId: params.uploadId,
          PartNumber: partNumber,
        });
        return {
          part_number: partNumber,
          url: await getSignedUrl(this.presignClient, command, {
            expiresIn: this.cfg.presignedExpiresSeconds,
          }),
        };
      }),
    );
  }

  async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void> {
    const Parts: CompletedPart[] = params.parts
      .map((part) => ({
        ETag: part.etag,
        PartNumber: part.part_number,
      }))
      .sort((a, b) => Number(a.PartNumber) - Number(b.PartNumber));

    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: { Parts },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async putObject(params: {
    key: string;
    body: Buffer | Uint8Array | string | Readable;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async headObject(
    key: string,
  ): Promise<{ size: number; contentType?: string }> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    return {
      size: Number(result.ContentLength ?? 0),
      contentType: result.ContentType,
    };
  }

  async getObjectStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new VideoStorageException();
    }
    return result.Body;
  }
}
