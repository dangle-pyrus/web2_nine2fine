import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';

export interface LocationDto {
  code: string;
  name: string;
}

/** Danh sách tỉnh/thành, sắp theo tên không dấu (BR-CHK-06). */
export async function listProvinces(): Promise<LocationDto[]> {
  const rows = await prisma.province.findMany({ orderBy: [{ nameSearch: 'asc' }, { code: 'asc' }] });
  return rows.map((p) => ({ code: p.code, name: p.name }));
}

export async function listWards(provinceCode: string): Promise<LocationDto[]> {
  const province = await prisma.province.findUnique({ where: { code: provinceCode } });
  if (!province) throw Errors.notFound('Không tìm thấy tỉnh / thành.');
  const rows = await prisma.ward.findMany({ where: { provinceCode }, orderBy: [{ nameSearch: 'asc' }, { code: 'asc' }] });
  return rows.map((w) => ({ code: w.code, name: w.name }));
}

/** Kiểm `wardCode` thuộc `provinceCode`; trả tên để chụp vào đơn. Sai -> null. */
export async function resolveAddress(
  db: Db,
  provinceCode: string,
  wardCode: string,
): Promise<{ provinceName: string; wardName: string } | null> {
  const ward = await db.ward.findFirst({
    where: { code: wardCode, provinceCode },
    select: { name: true, province: { select: { name: true } } },
  });
  return ward ? { provinceName: ward.province.name, wardName: ward.name } : null;
}
