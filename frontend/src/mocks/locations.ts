import { Location } from '../app/features/account/data-access/account-models';

/**
 * Small sample of the post-2025 two-level (province → ward) administrative list for the mock
 * adapter. The real catalogue must come from the backend; it is not hard-coded in the UI.
 */
export const PROVINCES: readonly Location[] = [
  { code: '01', name: 'Thành phố Hà Nội' },
  { code: '48', name: 'Thành phố Đà Nẵng' },
  { code: '79', name: 'Thành phố Hồ Chí Minh' },
];

export const WARDS: Readonly<Record<string, readonly Location[]>> = {
  '01': [
    { code: '01-ba-dinh', name: 'Phường Ba Đình' },
    { code: '01-cau-giay', name: 'Phường Cầu Giấy' },
    { code: '01-hoan-kiem', name: 'Phường Hoàn Kiếm' },
  ],
  '48': [
    { code: '48-hai-chau', name: 'Phường Hải Châu' },
    { code: '48-son-tra', name: 'Phường Sơn Trà' },
  ],
  '79': [
    { code: '79-ben-thanh', name: 'Phường Bến Thành' },
    { code: '79-dong-hoa', name: 'Phường Đông Hòa' },
    { code: '79-sai-gon', name: 'Phường Sài Gòn' },
    { code: '79-tan-dinh', name: 'Phường Tân Định' },
  ],
};
