/**
 * Seller identity published in the footer, the help page and the policies (e-commerce law requires
 * the trader's name, registration number, address, phone and email on the website). Replace every
 * value with the registered company's details before launch, and add the Ministry of Industry and
 * Trade (online.gov.vn) notification link once the website has been notified.
 */
export const STORE_INFO = {
  legalName: 'Công ty TNHH Thời trang Nine2Fine',
  registrationNumber: '0319245768',
  registrationIssuer: 'Sở Tài chính TP. Hồ Chí Minh',
  registrationDate: '2025-08-15',
  address: 'Tầng 5, 172 Hai Bà Trưng, Phường Tân Định, TP. Hồ Chí Minh',
  hotline: '1900 6868 29',
  hotlineHref: 'tel:1900686829',
  email: 'cskh@nine2fine.vn',
  privacyEmail: 'dulieu@nine2fine.vn',
  hours: '9:00 – 21:00, tất cả các ngày trong tuần',
  /** Ministry notification link (online.gov.vn); null until the website has been notified. */
  notificationUrl: null as string | null,
} as const;
