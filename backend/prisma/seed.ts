import dotenv from 'dotenv';
import { PrismaClient, user_role } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto';

dotenv.config();

/**
 * Seed idempotent: upsert theo email 3 tài khoản (admin, staff, member demo).
 * Email lấy từ SEED_*_EMAIL, mật khẩu từ SEED_*_PASSWORD (BR-AUTH-20). Không đụng user khác, không in mật khẩu.
 */

interface SeedAccount {
  label: string;
  role: user_role;
  emailVar: string;
  passwordVar: string;
  firstName: string;
  lastName: string;
}

const ACCOUNTS: SeedAccount[] = [
  { label: 'admin', role: 'admin', emailVar: 'SEED_ADMIN_EMAIL', passwordVar: 'SEED_ADMIN_PASSWORD', firstName: 'Admin', lastName: 'Nine2fine' },
  { label: 'staff', role: 'staff', emailVar: 'SEED_STAFF_EMAIL', passwordVar: 'SEED_STAFF_PASSWORD', firstName: 'Staff', lastName: 'Nine2fine' },
  { label: 'member', role: 'member', emailVar: 'SEED_MEMBER_EMAIL', passwordVar: 'SEED_MEMBER_PASSWORD', firstName: 'Member', lastName: 'Demo' },
];

function passwordProblem(password: string, email: string): string | null {
  const len = [...password].length;
  if (len < 8 || len > 64) return 'độ dài phải 8-64 ký tự';
  if (!/[A-Z]/.test(password)) return 'thiếu chữ in hoa';
  if (!/[0-9]/.test(password)) return 'thiếu chữ số';
  if (password.toLowerCase() === email) return 'không được trùng email';
  return null;
}

async function main(): Promise<void> {
  const missing: string[] = [];
  const resolved = ACCOUNTS.map((a) => {
    const email = process.env[a.emailVar]?.trim().toLowerCase();
    const password = process.env[a.passwordVar];
    if (!email) missing.push(a.emailVar);
    if (!password) missing.push(a.passwordVar);
    return { a, email, password };
  });
  if (missing.length) {
    console.error(`Thiếu biến môi trường cho seed: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const { a, email, password } of resolved) {
    const problem = passwordProblem(password!, email!);
    if (problem) {
      console.error(`${a.passwordVar} không đạt quy tắc mật khẩu: ${problem}`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    for (const { a, email, password } of resolved) {
      const passwordHash = await hashPassword(password!);
      const existing = await prisma.user.findUnique({ where: { email: email! }, select: { user_id: true } });
      await prisma.user.upsert({
        where: { email: email! },
        create: {
          email: email!,
          passwordHash,
          firstName: a.firstName,
          lastName: a.lastName,
          role: a.role,
          isActive: true,
          terms_accepted_at: new Date(),
        },
        update: { passwordHash, role: a.role, isActive: true },
      });
      console.log(`${existing ? 'Đã cập nhật' : 'Đã tạo'} tài khoản seed (${a.label}).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Seed thất bại.');
  process.exit(1);
});
