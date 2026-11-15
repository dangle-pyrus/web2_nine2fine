/**
 * Bật (hoặc tắt) thanh toán chuyển khoản QR cho cửa hàng: ghi cờ `store_settings.bank_transfer_enabled`
 * rồi in ra QR có thực sự hiện ở checkout không (còn cần `.env` đủ BANK_* + SEPAY_WEBHOOK_KEY, hoặc PAYMENT_SIMULATOR=true).
 * Chạy trong backend: npx tsx scripts/enable-bank-transfer.ts        (bật)
 *                     npx tsx scripts/enable-bank-transfer.ts off    (tắt)
 * Sau khi đổi `.env` phải khởi động lại backend.
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

async function main(): Promise<void> {
  const enable = process.argv[2] !== 'off';
  const prisma = new PrismaClient();
  try {
    await prisma.storeSetting.upsert({
      where: { id: 1 },
      update: { bankTransferEnabled: enable },
      create: { id: 1, bankTransferEnabled: enable },
    });
  } finally {
    await prisma.$disconnect();
  }
  const bank = !!(process.env.BANK_NAME && process.env.BANK_ACCOUNT_NUMBER && process.env.BANK_ACCOUNT_NAME);
  const key = (process.env.SEPAY_WEBHOOK_KEY ?? '').length >= 16;
  const simulator = ['true', '1', 'yes'].includes((process.env.PAYMENT_SIMULATOR ?? '').trim().toLowerCase());
  console.log(`Cờ bank_transfer_enabled = ${enable}.`);
  if (!enable) return;
  if (simulator) {
    console.log(`Chế độ GIẢ LẬP: QR hiện ở checkout${bank ? '' : ' (tài khoản demo NINE2FINE DEMO)'}, trang QR có nút "Giả lập đã nhận tiền".`);
  } else if (bank && key) {
    console.log('Chế độ THẬT: QR SePay hiện ở checkout, tiền vào được đối soát qua webhook.');
  } else {
    console.log('QR VẪN CHƯA hiện: .env thiếu BANK_NAME / BANK_ACCOUNT_NUMBER / BANK_ACCOUNT_NAME / SEPAY_WEBHOOK_KEY, hoặc đặt PAYMENT_SIMULATOR=true.');
  }
  console.log('Nhớ khởi động lại backend nếu vừa sửa .env.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
