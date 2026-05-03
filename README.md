# Node.js TypeScript API - Lead CRM
> [!IMPORTANT]
> Under active development

Scalable Node.js (TypeScript) API for lead management, campaign automation, and WhatsApp messaging via Meta's WhatsApp Cloud API.

Implements segmentation, frequency capping, retries with exponential backoff, idempotent delivery, opt-in/opt-out handling, and inbound message parsing.

Designed for scalable, reliable, and compliant WhatsApp messaging workflows.


## Stack

- Node.js 20
- TypeScript (ESM)
- Express
- Axios
- Winston
- Prisma + PostgreSQL
- Zod (request validation)
- Jest

---

## Architecture

This project follows **DDD + Clean Architecture** principles:

- `src/domain`: entities, value objects, domain policies and strategies
- `src/application`: use cases, repository/provider contracts, application errors
- `src/infrastructure`: database (Prisma), HTTP layer, external providers, factories
- `src/shared`: cross-cutting concerns and shared utilities

---

## Prerequisites

- Docker
- Docker Compose
