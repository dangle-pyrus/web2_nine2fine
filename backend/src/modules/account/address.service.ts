import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ACCOUNT_ASSUMPTIONS } from '../../config/assumptions';
import { now } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { UUID_RE } from '../../lib/validate';
import type { AddressBody } from './account.schemas';

/** Sổ địa chỉ (PRD Slice 5 BR-ACC-09..13). Mọi ghi chạy trong giao dịch có khoá theo người dùng. */

export interface AddressDto {
  id: string;
  recipient: string;
  phone: string;
  province: { code: string; name: string };
  ward: { code: string; name: string };
  street: string;
  isDefault: boolean;
  isReturn: false;
}

const INCLUDE = { province: true, ward: true } as const;
type Row = Prisma.AddressGetPayload<{ include: typeof INCLUDE }>;

const toDto = (a: Row): AddressDto => ({
  id: a.address_id,
  recipient: a.recipientName,
  phone: a.phone_number,
  province: { code: a.provinceCode ?? '', name: a.province?.name ?? a.city ?? '' },
  ward: { code: a.wardCode ?? '', name: a.ward?.name ?? a.district ?? '' },
  street: a.street,
  isDefault: a.isDefault,
  isReturn: false,
});

type Tx = Prisma.TransactionClient;

/** Khoá theo người dùng (dòng `users`) để thêm / đổi mặc định không đua nhau (AC-ACC-17). */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "users" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
}

async function listRows(db: Tx | typeof prisma, userId: string): Promise<Row[]> {
  return db.address.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { address_id: 'desc' }],
  });
}

export async function listAddresses(userId: string): Promise<AddressDto[]> {
  return (await listRows(prisma, userId)).map(toDto);
}

async function assertLocation(tx: Tx, provinceCode: string, wardCode: string): Promise<void> {
  const ward = await tx.ward.findFirst({ where: { code: wardCode, provinceCode }, select: { code: true } });
  if (!ward) throw Errors.invalidAddress('wardCode');
}

async function ownRow(tx: Tx, userId: string, id: string): Promise<Row> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy địa chỉ.');
  const row = await tx.address.findFirst({ where: { address_id: id, userId }, include: INCLUDE });
  if (!row) throw Errors.notFound('Không tìm thấy địa chỉ.');
  return row;
}

const fields = (b: AddressBody) => ({
  recipientName: b.recipient,
  phone_number: b.phone,
  provinceCode: b.provinceCode,
  wardCode: b.wardCode,
  street: b.street,
});

export async function createAddress(userId: string, body: AddressBody): Promise<AddressDto> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const count = await tx.address.count({ where: { userId } });
    if (count >= ACCOUNT_ASSUMPTIONS.maxAddresses) {
      throw Errors.validation(`Bạn chỉ lưu được tối đa ${ACCOUNT_ASSUMPTIONS.maxAddresses} địa chỉ.`, 'addresses');
    }
    await assertLocation(tx, body.provinceCode, body.wardCode);
    const makeDefault = count === 0 || body.isDefault;
    if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    const t = now();
    const row = await tx.address.create({
      data: { ...fields(body), userId, isDefault: makeDefault, createdAt: t, updatedAt: t },
      include: INCLUDE,
    });
    return toDto(row);
  });
}

export async function updateAddress(userId: string, id: string, body: AddressBody): Promise<AddressDto> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await ownRow(tx, userId, id);
    await assertLocation(tx, body.provinceCode, body.wardCode);
    const makeDefault = current.isDefault || body.isDefault;
    if (makeDefault && !current.isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    const row = await tx.address.update({
      where: { address_id: id },
      data: { ...fields(body), isDefault: makeDefault, updatedAt: now() },
      include: INCLUDE,
    });
    return toDto(row);
  });
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await ownRow(tx, userId, id);
    await tx.address.delete({ where: { address_id: id } });
    if (current.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { address_id: 'desc' }] });
      if (next) await tx.address.update({ where: { address_id: next.address_id }, data: { isDefault: true } });
    }
  });
}

export async function setDefaultAddress(userId: string, id: string): Promise<AddressDto[]> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await ownRow(tx, userId, id);
    if (!current.isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      await tx.address.update({ where: { address_id: id }, data: { isDefault: true, updatedAt: now() } });
    }
    return (await listRows(tx, userId)).map(toDto);
  });
}
