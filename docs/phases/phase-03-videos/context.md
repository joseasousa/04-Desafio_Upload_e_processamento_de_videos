---
kind: phase-context
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-06-26"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-06-26"
---

# Phase 03 — Context

## Phase Scope

Phase 03 delivers backend video upload and processing:

- S3-compatible object storage for video files and thumbnails.
- Background processing queue and worker.
- 10GB-capable upload without passing the file through the API.
- Automatic draft pre-registration when upload starts.
- Automatic metadata extraction and thumbnail generation after upload.
- Unique URL per video.
- Streaming and download endpoints.

Frontend upload/watch screens are out of scope.

## Existing System

- Backend lives in `nestjs-project/` using NestJS 11, TypeORM 0.3, PostgreSQL 17, global JWT guard, global validation pipe, domain exception filters, Swagger decorators, migrations, and Docker Compose.
- Phase 02 created `users`, `channels`, auth tokens, Mailpit, and the global auth/error conventions.
- Each user has one `Channel`; videos must belong to a channel.
- Current Compose has `nestjs-api`, `db`, and `mailpit`. Phase 03 adds Redis, MinIO, and a `video-worker`.

## Decisions Index

| Decision | Summary |
|---|---|
| `phase-03-videos/TD-01` | BullMQ + Redis for background jobs |
| `phase-03-videos/TD-02` | S3 multipart presigned upload directly to MinIO/S3 |
| `phase-03-videos/TD-03` | Separate Node worker container using FFmpeg/ffprobe |
| `phase-03-videos/TD-04` | API streaming proxy with Range support and download headers |
| `phase-03-videos/TD-05` | Short random unique slug and explicit status lifecycle |

## Inherited Constraints

- Use Docker Compose service names for internal hosts (`db`, `redis`, `minio`), never `localhost` inside containers.
- Keep services focused by responsibility and preserve module boundaries.
- Use TypeORM entities with explicit columns and migrations; `synchronize` remains disabled.
- Use class-validator DTOs, domain exceptions, and the existing error envelope.
- Tests follow suffix conventions: `*.spec.ts`, `*.integration-spec.ts`, `*.e2e-spec.ts`.

## Libraries

Context7 is not exposed in this Codex session. Library references are captured in `library-refs.md` from official primary documentation fallback and must be cross-checked with Context7 if the MCP becomes available before merge.

