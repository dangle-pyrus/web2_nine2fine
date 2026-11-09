import prisma from '../../config/prisma';
import { now } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { money } from '../../mail/order-templates';
import { customerRuleViolation } from '../voucher/voucher.service';

/** BR-ACC-16 (Should): mã công khai thành viên đang dùng được. Không có ví cá nhân (S5-Q6). */

export interface MemberVoucherDto {
  id: string;
  code: string;
  headline: string;
  subline: string;
  conditions: string;
  expiresAt: string | null;
}

export async function listMemberVouchers(userId: string): Promise<MemberVoucherDto[]> {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user || !user.isActive) throw Errors.unauthenticated();
  const t = now();
  const rows = await prisma.voucher.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: t } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: t } }] }],
    },
    include: { category: true },
  });
  const customer = { userId, email: user.email, phone: user.phone_number ?? undefined };
  const out: Array<MemberVoucherDto & { sortKey: number }> = [];
  for (const v of rows) {
    if (v.totalLimit !== null && v.usedCount >= v.totalLimit) continue;
    if (await customerRuleViolation(prisma, v, customer)) continue;
    const headline =
      v.kind === 'free_shipping' ? 'Miễn phí giao hàng' : v.kind === 'percent' ? `Giảm ${v.value ?? 0}%` : `Giảm ${money(v.value ?? 0)}`;
    const subline = v.kind === 'percent' && v.maxDiscount ? `tối đa ${money(v.maxDiscount)}` : v.name === headline ? '' : v.name;
    const conditions = [
      v.minSubtotal > 0 ? `Đơn từ ${money(v.minSubtotal)}` : 'Không yêu cầu đơn tối thiểu',
      v.membersOnly ? 'Chỉ thành viên' : null,
      v.firstOrderOnly ? 'Đơn đầu tiên' : null,
      v.category ? `Danh mục ${v.category.name}` : null,
      v.excludeSaleItems ? 'Không áp cho hàng đang giảm' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    out.push({
      id: v.voucher_id,
      code: v.code,
      headline,
      subline,
      conditions,
      expiresAt: v.endsAt ? v.endsAt.toISOString() : null,
      sortKey: v.endsAt ? v.endsAt.getTime() : Number.MAX_SAFE_INTEGER,
    });
  }
  out.sort((a, b) => a.sortKey - b.sortKey || a.code.localeCompare(b.code));
  return out.map(({ sortKey: _s, ...dto }) => dto);
}
