#!/bin/sh
set -e
# Chờ DB sẵn sàng (compose đã có healthcheck, đây là lớp phòng thêm), áp migration, seed idempotent rồi chạy API.
npx prisma migrate deploy
npm run seed
npm run seed:catalog || echo "Bỏ qua seed catalog (DB đã có dữ liệu, giữ nguyên)."
npm run seed:checkout
npm run seed:home
exec npx tsx src/server.ts
