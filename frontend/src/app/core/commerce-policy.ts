import { STORE_POLICY } from './store-policy';

/** Operating limits (`Policy` in docs/api/openapi.yaml). With HTTP they come from the server. */
export interface CommercePolicy {
  maxPerVariant: number;
  maxItemsPerOrder: number;
  maxCartLines: number;
  shippingFee: number;
  freeShippingThreshold: number;
  codMaxTotal: number;
  bankHoldMinutes: number;
  bankTransferEnabled: boolean;
  cartRetentionDays: number;
}

/**
 * Policy used by the mock adapters and as the starting value before the first server answer.
 * `bankTransferEnabled` is true only for the mock (QR demo); the HTTP adapter always reports
 * what the server says (assumption Q2: false until SePay exists).
 */
export const MOCK_POLICY: Readonly<CommercePolicy> = {
  maxPerVariant: 5,
  maxItemsPerOrder: 20,
  maxCartLines: 30,
  shippingFee: STORE_POLICY.shippingFee,
  freeShippingThreshold: STORE_POLICY.freeShippingFrom,
  codMaxTotal: 5_000_000,
  bankHoldMinutes: STORE_POLICY.paymentHoldMinutes,
  bankTransferEnabled: true,
  cartRetentionDays: 30,
};
