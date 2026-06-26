---
kind: phase
name: phase-03-videos
affected_subprojects: [nestjs-project]
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-06-26"
  docs/phases/phase-03-videos/validation.md: "2026-06-26"
  docs/phases/phase-03-videos/library-refs.md: "2026-06-26"
---

# Phase 03 — Upload e Processamento de Videos

## Objective

Deliver backend video upload and processing with S3-compatible storage, BullMQ/Redis background processing, FFmpeg metadata/thumbnail generation, unique video URLs, streaming, and download.

## Step Implementations

### SI-03.1 — Planning Artifacts and Dependencies

**Description:** Create Phase 03 artifacts, install video/storage/queue dependencies, and add Docker infrastructure for Redis, MinIO, and the worker.

**Technical actions:**

- Add dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@nestjs/bullmq`, `bullmq`, `ioredis`.
- Update `Dockerfile.dev` to install `ffmpeg`.
- Extend Compose with `redis`, `minio`, `createbuckets`, and `video-worker`.
- Add storage, queue, and video env defaults using Docker service names.

**Tests:** module/config validation tests.

**Dependencies:** None

### SI-03.2 — Video Entity, Migration, and Domain Rules

**Description:** Add the `Video` entity, status enum, slug/status utilities, migration, and table-cleanup awareness for tests.

**Technical actions:**

- Create `videos` table linked to `channels`.
- Persist storage keys, upload metadata, status, slug, duration, thumbnail, failure reason, and timestamps.
- Add unique slug index and channel/status index.
- Add domain exceptions for video errors.

**Tests:** entity integration tests and unit tests for slug/status/range utilities.

**Dependencies:** SI-03.1

### SI-03.3 — Storage and Queue Services

**Description:** Implement storage and queue adapters behind NestJS services.

**Technical actions:**

- Implement multipart upload start, presigned part URLs, complete, abort, object range reads, object upload, and object stat.
- Implement queue producer for `video.processing.requested`.
- Register modules with DI and configuration.

**Tests:** unit tests for service branching and integration tests against MinIO/Redis when available.

**Dependencies:** SI-03.2

### SI-03.4 — Upload API

**Description:** Implement authenticated upload orchestration endpoints.

**Technical actions:**

- `POST /videos/uploads`
- `POST /videos/:id/uploads/:uploadId/parts`
- `POST /videos/:id/uploads/:uploadId/complete`
- `DELETE /videos/:id/uploads/:uploadId`
- Enforce video ownership via authenticated user's channel.

**Tests:** service unit tests and E2E tests for auth, ownership, validation, and happy path.

**Dependencies:** SI-03.3

### SI-03.5 — Worker Processing

**Description:** Implement the worker bootstrap and processing service.

**Technical actions:**

- Consume `video.processing.requested`.
- Download/read the stored video, extract metadata with `ffprobe`, generate thumbnail with `ffmpeg`, upload thumbnail, and update status.
- Mark failed processing with `failure_reason`.

**Tests:** unit tests for failed/success paths and a small fixture integration test when FFmpeg is available.

**Dependencies:** SI-03.4

### SI-03.6 — Public Metadata, Streaming, and Download

**Description:** Implement public video metadata, Range streaming, and download.

**Technical actions:**

- `GET /videos/:slug`
- `GET /videos/:slug/stream`
- `GET /videos/:slug/download`
- Return 404 for non-ready videos on public endpoints.
- Implement `Range` parsing and `206 Partial Content`.

**Tests:** unit tests for Range handling and E2E tests for metadata, streaming, and download headers.

**Dependencies:** SI-03.5

### SI-03.7 — Documentation and Definition of Done

**Description:** Update AI documentation and run the required verification suite.

**Technical actions:**

- Update root `AGENTS.md`, root `CLAUDE.md`, and `nestjs-project/CLAUDE.md`.
- Update `progress.md`.
- Run full test, e2e, typecheck, and lint commands in the container.

**Tests:** full DoD commands.

**Dependencies:** SI-03.6

## Technical Specifications

### Data Model

`Video` stores: `id`, `channel_id`, `title`, `original_file_name`, `mime_type`, `size_bytes`, `status`, `storage_key`, `thumbnail_key`, `duration_seconds`, `metadata`, `slug`, `upload_id`, `failure_reason`, `created_at`, `updated_at`.

Statuses: `draft`, `uploading`, `processing`, `ready`, `failed`.

### API Contracts

- `POST /videos/uploads` -> `{ id, slug, upload_id, storage_key, status }`
- `POST /videos/:id/uploads/:uploadId/parts` -> `{ parts: [{ part_number, url }] }`
- `POST /videos/:id/uploads/:uploadId/complete` -> `{ id, status }`
- `DELETE /videos/:id/uploads/:uploadId` -> 204
- `GET /videos/:slug` -> ready video metadata
- `GET /videos/:slug/stream` -> `206` for Range, `200` for full stream
- `GET /videos/:slug/download` -> attachment response

### Authorization Matrix

| Endpoint | Auth | Rule |
|---|---|---|
| Start upload | Required | Creates under current user's channel |
| Presign parts | Required | Owner channel only |
| Complete upload | Required | Owner channel only |
| Abort upload | Required | Owner channel only |
| Metadata | Public | Ready videos only |
| Stream | Public | Ready videos only |
| Download | Public | Ready videos only |

### Error Catalog

- `VIDEO_NOT_FOUND` -> 404
- `VIDEO_UPLOAD_NOT_ACTIVE` -> 409
- `VIDEO_NOT_READY` -> 404
- `VIDEO_FORBIDDEN` -> 403
- `INVALID_VIDEO_STATUS_TRANSITION` -> 409
- `INVALID_RANGE` -> 416
- `VIDEO_STORAGE_ERROR` -> 502
- `VIDEO_PROCESSING_FAILED` -> persisted state, not normally thrown to clients

### Events/Messages

Queue name: `video-processing`

Job name: `video.processing.requested`

Payload: `{ video_id: string }`

The worker must be idempotent: if the row is no longer `processing`, the job exits without mutation.

## Dependency Map

SI-03.1 -> SI-03.2 -> SI-03.3 -> SI-03.4 -> SI-03.5 -> SI-03.6 -> SI-03.7

## Deliverables

- Phase 03 decisions and planning artifacts.
- Docker Compose infrastructure for Redis, MinIO, and video worker.
- Video module, storage service, queue producer, worker processor, migration, and tests.
- Upload, processing, thumbnail, unique URL, streaming, and download functional paths.
- AI documentation updated and DoD verification attempted.

