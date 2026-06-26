---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-06-26
scope_description: "Backend and infrastructure decisions for large video upload, S3-compatible storage, background processing, thumbnail generation, streaming, download, and unique video URLs."
---

# Technical Decisions — Phase 03: Upload e Processamento de Videos

_Subprojects in scope:_

- `nestjs-project/` — backend API, video worker, Docker services, migrations, storage integration, queue integration, and tests for the Phase 03 capabilities.
- `next-frontend/` — deferred for this phase; upload and watch UI are out of scope.

---

## TD-01: Processing Queue

**Scope:** Backend

**Capability:** Servico de processamento em segundo plano (filas)

**Context:** Video processing must happen outside the request/response path. The queue must run locally in Docker and support retries, separate worker processes, and observable job lifecycle.

**Options:**

### Option A: BullMQ + Redis
- Redis-backed Node queue with worker processes, retry/backoff, delayed jobs, and strong NestJS integration through `@nestjs/bullmq`.
- **Pros:** Excellent fit for NestJS and Node workers, small local footprint, mature job semantics, easy Docker setup.
- **Cons:** Adds Redis infrastructure and requires idempotency at the worker/service boundary.

### Option B: RabbitMQ
- General-purpose message broker with durable queues and acknowledgements.
- **Pros:** Strong broker semantics and broad ecosystem.
- **Cons:** More operational complexity and less direct job lifecycle ergonomics for this project.

### Option C: SQS-compatible queue
- Cloud-oriented managed queue model.
- **Pros:** Production-friendly on AWS.
- **Cons:** Poorer local development fit and unnecessary cloud coupling for this phase.

**Recommendation:** **Option A (BullMQ + Redis)** — best balance for a NestJS monorepo, Docker local development, and a separate Node worker.

**Decision:** A (BullMQ + Redis)

**Libraries:** `@nestjs/bullmq`, `bullmq`, `ioredis`

---

## TD-02: Large Upload Strategy

**Scope:** Cross-layer

**Capability:** Upload de videos com suporte a arquivos de ate 10GB sem impacto na performance

**Context:** Uploading large videos through the API would hold API connections and disk/memory resources for too long. The API should orchestrate uploads, not proxy the full file.

**Options:**

### Option A: S3 multipart upload with presigned part URLs
- API creates a video draft, starts a multipart upload in MinIO/S3, returns presigned URLs for parts, and completes the upload after the client uploads directly to storage.
- **Pros:** Supports 10GB uploads, enables retry/resume by part, keeps the API lightweight, works with MinIO locally and S3 in production.
- **Cons:** Requires more endpoints and client-side multipart orchestration.

### Option B: Multipart form upload through NestJS
- Client sends the full file to the API, which uploads it to storage.
- **Pros:** Simple API.
- **Cons:** Violates the non-blocking large-upload requirement and stresses the API process.

### Option C: tus resumable upload server
- Dedicated resumable upload protocol/server.
- **Pros:** Strong resumability semantics.
- **Cons:** Adds another protocol/service and is unnecessary because S3 multipart already satisfies the requirement.

**Recommendation:** **Option A (S3 multipart upload with presigned part URLs)**.

**Decision:** A

**Libraries:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`

---

## TD-03: Video Worker and Media Processing

**Scope:** Backend

**Capability:** Transversal — covers: "Processamento automatico do video apos upload (extracao de duracao e metadados)", "Geracao automatica de thumbnail a partir de um frame do video"

**Context:** Metadata extraction and thumbnail generation are CPU/file-system heavy. They must run outside the API container and update the database when done.

**Options:**

### Option A: Separate Node/Nest worker container with FFmpeg/ffprobe
- Worker consumes BullMQ jobs, reads the uploaded object, runs `ffprobe` and `ffmpeg`, uploads a thumbnail, and updates the video row.
- **Pros:** Reuses TypeScript/NestJS config and DI, isolates CPU work, simple Docker topology.
- **Cons:** Requires FFmpeg installed in the worker image and temporary workspace cleanup.

### Option B: Inline processing in API after upload completion
- API completes upload and processes immediately.
- **Pros:** Fewer moving parts.
- **Cons:** Blocks the API and violates the background-processing requirement.

### Option C: External media processing service
- Delegate processing to a cloud/media service.
- **Pros:** Scales well in production.
- **Cons:** Out of scope for local Docker-first project.

**Recommendation:** **Option A (separate Node worker with FFmpeg/ffprobe)**.

**Decision:** A

---

## TD-04: Streaming and Download

**Scope:** Backend

**Capability:** Transversal — covers: "Reproducao via streaming (sem necessidade de download completo)", "Download do video pelo usuario"

**Context:** Anonymous users must be able to watch ready videos without downloading the whole object. Downloads must expose the same stored original file with appropriate headers.

**Options:**

### Option A: API proxy with HTTP Range support
- API reads byte ranges from object storage and returns `206 Partial Content` with `Content-Range`, while download returns attachment headers.
- **Pros:** Keeps a stable API URL, allows auth/visibility checks later, testable via Supertest.
- **Cons:** API handles streaming bandwidth.

### Option B: Presigned GET URLs directly to storage
- API returns short-lived object URLs for streaming/download.
- **Pros:** Offloads bandwidth.
- **Cons:** Harder to keep stable public URLs and future visibility checks.

**Recommendation:** **Option A (API proxy with Range support)** for Phase 03, with the option to optimize with CDN/storage direct delivery later.

**Decision:** A

---

## TD-05: Unique URL and Status Lifecycle

**Scope:** Backend

**Capability:** Transversal — covers: "Pre-cadastro automatico do video como rascunho ao iniciar o upload", "URL unica por video, sem conflito com outros videos"

**Context:** A video needs a public identifier before it is ready, and the system must represent upload/processing failures explicitly.

**Options:**

### Option A: Short random slug with database uniqueness and explicit status enum
- Generate a URL-safe slug using cryptographic random bytes and enforce uniqueness in PostgreSQL. Store status as `draft`, `uploading`, `processing`, `ready`, or `failed`.
- **Pros:** Simple, collision-resistant, independent of editable titles, supports clear worker transitions.
- **Cons:** Slugs are not human-readable.

### Option B: Title-derived slug with suffix on collision
- Generate slugs from title.
- **Pros:** Human-readable.
- **Cons:** Titles are editable in later phases and collision handling is noisier.

**Recommendation:** **Option A (short random slug + explicit status enum)**.

**Decision:** A

