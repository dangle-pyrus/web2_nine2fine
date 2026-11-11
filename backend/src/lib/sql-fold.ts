import { Prisma } from '@prisma/client';
import { foldVi } from './text';

const VN_ACCENTED = 'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ';
const VN_FROM = VN_ACCENTED + VN_ACCENTED.toUpperCase();
const VN_TO = [...VN_FROM].map((c) => foldVi(c)).join('');

/** Bỏ dấu + hạ chữ thường phía cột (cùng ánh xạ với `foldVi` phía từ khoá). Dùng chung Slice 4 (đơn) và Slice 7 (khách). */
export const foldCol = (col: string) => Prisma.sql`translate(lower(${Prisma.raw(col)}), ${VN_FROM}, ${VN_TO})`;
