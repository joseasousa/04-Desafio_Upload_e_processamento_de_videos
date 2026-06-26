import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { StorageService } from '../storage/storage.service';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { PresignUploadPartsDto } from './dto/presign-upload-parts.dto';
import { StartVideoUploadDto } from './dto/start-video-upload.dto';
import { parseHttpRange } from './range.util';
import { Video } from './entities/video.entity';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
  ) {}

  @Post('uploads')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start a multipart video upload' })
  @ApiResponse({ status: 201, description: 'Upload initialized' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async startUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartVideoUploadDto,
  ): Promise<Record<string, string>> {
    const video = await this.videosService.startUpload(user.sub, dto);
    return this.toUploadResponse(video);
  }

  @Post(':id/uploads/:uploadId/parts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  async presignParts(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Body() dto: PresignUploadPartsDto,
  ): Promise<{ parts: { part_number: number; url: string }[] }> {
    return {
      parts: await this.videosService.presignParts(
        user.sub,
        id,
        uploadId,
        dto.part_numbers,
      ),
    };
  }

  @Post(':id/uploads/:uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<Record<string, string>> {
    const video = await this.videosService.completeUpload(
      user.sub,
      id,
      uploadId,
      dto.parts,
    );
    return this.toUploadResponse(video);
  }

  @Delete(':id/uploads/:uploadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  async abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ): Promise<void> {
    await this.videosService.abortUpload(user.sub, id, uploadId);
  }

  @Public()
  @Get(':slug')
  async getBySlug(
    @Param('slug') slug: string,
  ): Promise<Record<string, unknown>> {
    const video = await this.videosService.findReadyBySlug(slug);
    return {
      id: video.id,
      slug: video.slug,
      title: video.title,
      duration_seconds: video.duration_seconds,
      thumbnail_key: video.thumbnail_key,
      metadata: video.metadata,
    };
  }

  @Public()
  @Get(':slug/stream')
  async stream(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videosService.findReadyBySlug(slug);
    const object = await this.storageService.headObject(video.storage_key);
    const range = parseHttpRange(req.headers.range, object.size);
    const stream = await this.storageService.getObjectStream(
      video.storage_key,
      range ?? undefined,
    );

    if (range) {
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${object.size}`,
      );
      res.setHeader('Content-Length', String(range.contentLength));
    } else {
      res.status(HttpStatus.OK);
      res.setHeader('Content-Length', String(object.size));
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', object.contentType ?? video.mime_type);
    stream.pipe(res);
  }

  @Public()
  @Get(':slug/download')
  @Header('Accept-Ranges', 'bytes')
  async download(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videosService.findReadyBySlug(slug);
    const object = await this.storageService.headObject(video.storage_key);
    const stream = await this.storageService.getObjectStream(video.storage_key);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', object.contentType ?? video.mime_type);
    res.setHeader('Content-Length', String(object.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${video.original_file_name.replace(/"/g, '')}"`,
    );
    stream.pipe(res);
  }

  private toUploadResponse(video: Video): Record<string, string> {
    return {
      id: video.id,
      slug: video.slug,
      upload_id: video.upload_id ?? '',
      storage_key: video.storage_key,
      status: video.status,
    };
  }
}
