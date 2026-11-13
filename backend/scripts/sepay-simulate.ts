/**
 * Giả một webhook SePay "có tiền vào" gửi tới máy chủ đang chạy (thử đúng đường webhook thật, không cần ngân hàng).
 * Chạy (trong backend, máy chủ đang chạy, `.env` có SEPAY_WEBHOOK_KEY):
 *   npx tsx scripts/sepay-simulate.ts <MÃ ĐƠN> <SỐ TIỀN> [URL gốc API, mặc định http://localhost:<PORT>]
 * Ví dụ: npx tsx scripts/sepay-simulate.ts N2F2611130042 5250000
 * Gửi lại cùng một lệnh -> mã giao dịch mới (cộng thêm tiền). Đặt SEPAY_SIM_TX_ID để thử gửi trùng.
 */
import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const [code, amountRaw, baseRaw] = process.argv.slice(2);
  const amount = Number(amountRaw);
  if (!code || !Number.isInteger(amount) || amount <= 0) {
    console.error('Cách dùng: npx tsx scripts/sepay-simulate.ts <MÃ ĐƠN> <SỐ TIỀN> [URL gốc API]');
    process.exit(1);
  }
  const key = process.env.SEPAY_WEBHOOK_KEY;
  if (!key) {
    console.error('Thiếu SEPAY_WEBHOOK_KEY trong .env (đặt một chuỗi bất kỳ >= 16 ký tự, máy chủ và script dùng chung).');
    process.exit(1);
  }
  const base = (baseRaw ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
  const now = new Date(Date.now() + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19); // giờ VN như SePay
  const body = {
    id: Number(process.env.SEPAY_SIM_TX_ID ?? Date.now()),
    gateway: process.env.BANK_NAME ?? 'MBBank',
    transactionDate: now,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER ?? '0000000000',
    subAccount: null,
    code: null,
    content: `${code} thanh toan don hang`,
    transferType: 'in',
    description: `GIA LAP SEPAY ${code}`,
    transferAmount: amount,
    referenceCode: `SIM${Date.now()}`,
    accumulated: 0,
  };
  const res = await fetch(`${base}/api/payments/sepay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${key}` },
    body: JSON.stringify(body),
  });
  console.log(`HTTP ${res.status}`, await res.text());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
