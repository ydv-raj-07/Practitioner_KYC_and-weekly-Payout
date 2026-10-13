# DECISIONS

What I chose, what I skipped, and why.

## 1. Stack

| Choice | Why |
|---|---|
| Node.js, Express 5, TypeScript | Required stack. TypeScript catches mistakes early. Express 5 sends async errors to the error handler by itself. |
| PostgreSQL + Prisma | Unique constraints and transactions are what money needs. Prisma gives safe queries. |
| `routes → services → Prisma` | Routes handle HTTP only. All rules live in services. |
| Zod, one `AppError`, one error handler | One place for input rules, and every error has the same shape. |
| Vitest + Supertest, separate test database | Tests can clean tables without touching real data. |

## 2. How each rule is done

**Rule 1: encrypted identity**
- AES-256-GCM, a fresh random IV per value. GCM also detects tampering.
- Keys come from `.env`. The server will not start if a key is missing or not 64 hex characters.
- Public responses use Prisma `select`, so only `id`, `displayName`, `skills`, `status`, `createdAt` can leave the server.
- **Duplicate PAN:** encrypted values are random, so the database cannot check them for uniqueness. I also store an **HMAC-SHA256 hash** of the PAN in a unique column. HMAC (not a plain hash) because the PAN format is small and a plain hash could be guessed. Encryption and hash use **two different keys**.

**Rule 2: admin only, everything logged**
- Every identity view and status change writes an audit row: who, what, which record, when. It never contains name, PAN or phone.
- **Audit first, data second**, in one transaction. If the audit write fails, no data is returned.
- Identity responses use `Cache-Control: no-store`.

**Rule 3: status flow**
- An `ALLOWED` table lists the only valid moves. Everything else returns `409`.
- Status update and audit log are one transaction.
- **Two admins at once:** Prisma has no `FOR UPDATE`, so I use compare-and-swap: `updateMany({ where: { id, status: <what I read> } })`. If someone changed it first, count is 0 and the second admin gets `409`.

**Rule 4: money**
- Whole paise, calculated with BigInt, rounded half up.
- `net = gross − platform − TDS` (by subtraction), so the parts always add up to gross exactly.

**Rule 5: no double payout** (three layers)
1. Postgres advisory lock per week, so parallel runs wait in line.
2. Unique constraint on `(practitionerId, weekStart)`.
3. `createMany` with `skipDuplicates` (`ON CONFLICT DO NOTHING`).

The run is one transaction, so a failure pays nobody. A repeat run returns `created: 0`. The database constraint is the real guarantee, even if the lock failed.

## 3. Assumptions (please check)

- **TDS is 1% of the gross amount** (section 194-O). If it should be on the amount after the platform share, it is a one-line change in `money.ts`.
- **Week = Monday date** (`?week=2026-10-05`). It runs from Monday 00:00 IST (included) to next Monday 00:00 IST (not included).
- **Only finished weeks.** A running week is refused, because earnings that arrive later could never be paid (the unique rule blocks a second payout).
- **Who is paid:** only `approved` practitioners with earnings above 0.
- **Display name:** optional in apply. If missing it is made from the name ("Raj R.").
- **Phone:** 10-digit Indian mobile number starting with 6 to 9. `+91` is accepted and removed.
- **Rejected practitioners** cannot upload and are never paid.

## 4. Tricky cases handled

- **Money:** same week run twice or 8 times at once, rounding (10001 → 3000 / 100 / 6901), amounts above the `Int` limit, exact IST week borders, zero or no earnings, bad `week` values (format, not Monday, fake date, future week, `?week=a&week=b`).
- **Status:** skipping a step, same status, going back, changing a final status, two admins at once, audit write failing.
- **Security:** missing or wrong headers (401), wrong role (403), uploading to someone else's id (403, checked before reading the file), client sending `status: "approved"` in apply (ignored), PAN or phone in responses, errors or logs (never), duplicate PAN even when two requests arrive together.
- **Uploads:** `.exe` renamed to `.pdf` (type is checked from the first bytes, not the name or Content-Type), over 5 MB, empty file, no file, wrong field name, names like `../../etc/passwd.pdf` (random UUID file names), orphan file deleted if the database write fails.

## 5. Skipped and why

| Skipped | Note |
|---|---|
| Real login (JWT) | Task allows headers. Headers can be faked, so this only simulates login. |
| Encrypting uploaded files, virus scan, download endpoint | Out of scope. Production: encrypted storage and a malware scan. |
| `BigInt` money columns | The schema uses `Int` (max about ₹2.14 crore). A guard raises an error instead of saving a wrong number. |
| Paying late earnings | Earnings that arrive after a run are not paid later. Production: pay them as an adjustment in the next run. |
| Higher TDS without PAN (206AA), TDS thresholds | Task says flat 1%. |
| Payout reversal, "paid" status, bank details | Payout rows only record what is owed. |
| Key rotation | Needs a key version stored with each value. |
| Rate limiting | Would use Redis (section 6). |
| Pagination, document count limit | Lists are small. |

**Known trade-off:** the duplicate-PAN `409` reveals that a PAN is already registered.

## 6. Where Redis could be used

I did **not** use Redis. It is optional, and correctness does not need it: the database already prevents double payment, which is safer than a Redis lock (a lock can expire, or Redis can be down).

```
Now:    Client → Express → PostgreSQL
Later:  Client → Load balancer → Express #1..N → PostgreSQL  (source of truth)
                                              ↘ Redis        (fast, temporary data only)
```

| Use | Where | Why | Priority |
|---|---|---|---|
| **Rate limiting** | Middleware before `auth` on `/apply`, `/identity`, `/payouts/run` | Stops spam and guessing. `INCR` + `EXPIRE` per IP. | Best fit |
| **Payout queue** (BullMQ) | `services/payout.ts` | For thousands of practitioners: return "accepted" fast, a worker creates payouts in the background. | When it grows |
| **Idempotency keys** | Middleware on write routes | A repeated request with the same `Idempotency-Key` returns the saved response. | Optional |
| **Cache `/me/payouts`** | `getMyPayouts` | Faster reads. Must be cleared after each payout run. | Low |
| **Token store** | Auth middleware | Only after real login (JWT) is added. | Later |

**Never use Redis for:**
- **Identity data.** A cache hit would skip the audit log and break Rule 2.
- **Money records.** Redis can lose data on restart. Payouts stay in PostgreSQL.
- **Replacing the unique constraint or advisory lock.**

**Safety rules if added:** rate limiting fails open (Redis down means requests still pass), and payout correctness never depends on Redis.

## 7. Testing

- **Unit tests** (no database): payout maths, encryption, week parsing, file detection, all 16 status moves.
- **API tests** (real PostgreSQL, separate `kyc_test`): access control, status rules, audit log, identity, uploads, payouts, race conditions.
- Some tests break things on purpose. For example, the audit table is renamed to prove that no identity data is returned when logging fails.
