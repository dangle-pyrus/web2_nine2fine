#!/bin/sh
set -e
# Chờ DB sẵn sàng (compose đã có healthcheck, đây là lớp phòng thêm), áp migration, seed idempotent rồi chạy API.
npx prisma migrate deploy
npm run seed
npm run seed:checkout
npm run seed:zara -- --if-empty
npm run seed:home
exec npx tsx src/server.ts
