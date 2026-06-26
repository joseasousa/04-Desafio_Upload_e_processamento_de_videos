---
kind: library-refs
name: phase-03-videos
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-06-26"
---

# Phase 03 — Library References

Context7 was not available in this Codex session. The implementation uses official documentation fallback and records the libraries to verify with Context7 when the MCP is available.

## @aws-sdk/client-s3

- Use `S3Client` with explicit endpoint for MinIO, `forcePathStyle: true`, region, and static credentials from env.
- Use multipart commands: `CreateMultipartUploadCommand`, `UploadPartCommand`, `CompleteMultipartUploadCommand`, and `AbortMultipartUploadCommand`.
- Use `GetObjectCommand` with `Range` for streaming byte ranges.

## @aws-sdk/s3-request-presigner

- Use `getSignedUrl(client, command, { expiresIn })` for presigned upload part URLs.
- Keep expiration configurable; Phase 03 default is 900 seconds.

## @nestjs/bullmq / bullmq / ioredis

- Use `BullModule.forRoot()` with Redis connection from env and `BullModule.registerQueue({ name: 'video-processing' })`.
- API publishes `video.processing.requested` jobs after multipart completion.
- Worker consumes with BullMQ Worker/Processor semantics and updates DB idempotently.

## ffmpeg / ffprobe

- Install OS package `ffmpeg` in the Docker image.
- Worker uses `ffprobe` to extract duration and metadata, and `ffmpeg` to capture one thumbnail frame.

