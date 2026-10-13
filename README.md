# Practitioner KYC and Weekly Payouts

Backend for a wellness platform. Practitioners apply and upload ID documents, an admin approves them, and every week they are paid: **earnings − 30% platform share − 1% TDS**. Real name, PAN and phone are stored encrypted and only admins can see them.

## Tech stack

| Part | Technology |
|---|---|
| Runtime / framework | Node.js 20+, Express 5 |
| Language | TypeScript (run with `tsx`) |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Validation | Zod |
| Upload | Multer (memory storage) |
| Security | Node `crypto`: AES-256-GCM (data), HMAC-SHA256 (PAN lookup) |
| Tests | Vitest + Supertest |
| Redis | Not used (optional, see `DECISIONS.md`) |

## Setup

Needs Node.js 20+, npm and Docker.

```bash
npm install                                   
docker compose up -d                          
cp .env.example .env                          
docker compose exec db psql -U postgres -c 'CREATE DATABASE kyc_test'   
npx prisma migrate dev --name init            
npm run seed                                 
npm run dev                                   
```

`.env` variables:

| Variable | Meaning |
|---|---|
| `PORT` | Server port (default 3000) |
| `DATABASE_URL` | Main database |
| `TEST_DATABASE_URL` | Separate database for tests |
| `ENCRYPTION_KEY` | 64 hex characters, encrypts name / PAN / phone |
| `PAN_HASH_KEY` | 64 hex characters, used for the duplicate-PAN hash |
| `UPLOAD_DIR` | Upload folder (default `./uploads`) |

Generate each key (run twice):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Special characters in the DB password must be URL-encoded (`@` → `%40`). Keep `ENCRYPTION_KEY` safe: without it the encrypted data cannot be read again.

## Tests

```bash
npm test          
```
Unit tests need no database. API tests use real PostgreSQL on the separate `kyc_test` database, so your normal data is never touched.

## API

There is no login. Send two headers: `x-user-id` (a UUID; for practitioners use the `id` from apply) and `x-role` (`admin` or `practitioner`).

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/practitioners/apply` | anyone | Apply |
| POST | `/practitioners/:id/documents` | practitioner (own id) | Upload PDF / JPG / PNG, max 5 MB |
| PATCH | `/admin/practitioners/:id/status` | admin | Change status |
| GET | `/admin/practitioners/:id/identity` | admin | Real name, PAN, phone (logged) |
| POST | `/admin/payouts/run?week=` | admin | Create payouts for one week |
| GET | `/practitioners/me/payouts` | practitioner | My payouts with breakdown |
| GET | `/health` | anyone | Health check |

### Sample requests

```bash
ADMIN="-H x-user-id:11111111-1111-4111-8111-111111111111 -H x-role:admin"


curl -X POST localhost:3000/practitioners/apply -H 'content-type: application/json' \
  -d '{"name":"Raj Ranjan","pan":"ABCDE1234F","phone":"9876543210","skills":["backend","yoga"]}'


curl -X POST localhost:3000/practitioners/<ID>/documents \
  -H "x-user-id: <ID>" -H "x-role: practitioner" -F "file=@./id.pdf"

curl -X PATCH localhost:3000/admin/practitioners/<ID>/status $ADMIN \
  -H 'content-type: application/json' -d '{"status":"under_review"}'

curl localhost:3000/admin/practitioners/<ID>/identity $ADMIN

curl -X POST "localhost:3000/admin/payouts/run?week=2026-10-05" $ADMIN

curl localhost:3000/practitioners/me/payouts -H "x-user-id: <ID>" -H "x-role: practitioner"
```

- `displayName` is optional in apply. If missing it is made from the name.
- `week` is the **Monday date** of a **finished** week (use the week printed by `npm run seed`).
- Running the same week again returns `created: 0`. Nobody is paid twice.

## Rules in short

**Status:** `submitted → under_review → approved | rejected`. Any other move returns `409`.

**Payout** (all money in paise, whole numbers):
```
platform = 30% of gross    tds = 1% of gross    net = gross − platform − tds
```
| Gross | Platform | TDS | Net |
|---|---|---|---|
| 100000 | 30000 | 1000 | 69000 |
| 10001 | 3000 | 100 | 6901 |

**Errors** always look like `{ "error": { "code": "...", "message": "..." } }`.

| Status | Meaning |
|---|---|
| 400 | Bad input |
| 401 | Missing or invalid headers |
| 403 | Wrong role, or someone else's id |
| 404 | Not found |
| 409 | Not allowed now (bad status move, duplicate PAN, rejected practitioner) |
| 413 / 415 | File too big / not PDF, JPG or PNG |
| 500 | Unexpected error (details only in the server log) |

## Project structure

```
prisma/schema.prisma     models
src/
  routes.ts              URL -> service
  middleware.ts          auth, roles, upload, error handler
  validators.ts          Zod schemas
  config.ts, db.ts, errors.ts
  crypto.ts, money.ts, week.ts, fileType.ts
  services/              practitioner.ts, document.ts, payout.ts
scripts/seed.ts          sample data
tests/                   unit and API tests
```
Flow: `routes → auth / role → validators → services → Prisma → PostgreSQL`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `P1000` / `P1010` login failed | Check password and port (`5433`) in `DATABASE_URL`. Encode special characters. |
| `ENCRYPTION_KEY must be 64 hex chars` | Generate the key with the command above. Do not type it by hand. |
| `TEST_DATABASE_URL missing` | Add it to `.env`. |
| `database "kyc_test" does not exist` | Run the `CREATE DATABASE` command from Setup. |
| Tests cannot find `globalSetup.ts` | The folder must be named `tests` (lowercase). |
| Postman upload returns 400 | Field name must be `file`. Do not set `Content-Type` by hand. |