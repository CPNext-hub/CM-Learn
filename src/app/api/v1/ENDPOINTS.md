# Interaction API

These Next.js Route Handlers expose the BE 02 endpoints under `/api/v1`.
`{id}` and `:sheetId` refer to `sheets.id`. Mutating endpoints require the Better Auth session.

> Full, up-to-date documentation (Thai, with response shapes) is in `docs/API.md`.
> `GET /favorites` now returns full sheet objects (same shape as `GET /sheets`) plus `favoritedAt`.

| Method | Endpoint | Body |
| --- | --- | --- |
| GET | `/sheets/:id/comments` | — |
| POST | `/sheets/:id/comments` | `{ "body": "..." }` |
| POST | `/comments/:id/replies` | `{ "body": "..." }` |
| DELETE | `/comments/:id` | — |
| POST | `/sheets/:id/reactions` | `{ "reaction": "like" | "dislike" }` |
| DELETE | `/sheets/:id/reactions` | — |
| GET | `/favorites` | — |
| POST / DELETE | `/favorites/:sheetId` | — |
| GET | `/collections` | — |
| POST | `/collections` | `{ "name": "...", "description"?: "...", "isPublic"?: boolean }` |
| GET | `/collections/:id/sheets` | — |
| POST | `/collections/:id/sheets` | `{ "sheetId": "..." }` |
| DELETE | `/collections/:id/sheets/:sheetId` | — |
| POST | `/sheets/:id/reports` | `{ "reason": "spam" | "copyright" | "inappropriate" | "other", "details"?: "..." }` |
| GET | `/users/me/dashboard` | — |

Successful responses use `{ "data": ... }`; errors use
`{ "error": { "message": ... } }`. See `src/db/migrations/0003_interactions.sql`
for the schema changes. Apply migrations using `npm run db:migrate`.

The dashboard returns sheet totals, published sheet totals, total views,
comments and favorites received, and like/dislike totals. View counts begin at
zero; sheet-view handlers should increment `subject.view_count` when they are
implemented.
