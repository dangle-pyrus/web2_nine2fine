// ============================================================================
// MODULE AUTH - TYPES DEFINITIONS (auth.types.ts)
// ============================================================================

import { user_role } from '@prisma/client';

export interface CheckEmailInput {
  email: string;
}

export interface CheckEmailResponse {
  email: string;
  is_registered: boolean;
  has_password: boolean;
}

export type OtpPurpose = 'register' | 'login' | 'reset_password';

export interface SendOtpInput {
  email: string;
  purpose: OtpPurpose;
}

export interface SendOtpResponse {
  resend_available_in_seconds: number;
}

export interface RegisterInput {
  email: string;
  otp: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  accepted_terms: boolean;
  marketing_opt_in?: boolean;
}

export interface LoginOtpInput {
  email: string;
  otp: string;
}

export interface LoginPasswordInput {
  email: string;
  password: string;
  device_id?: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  email: string;
  otp: string;
  new_password: string;
  confirm_password: string;
}

export interface SafeUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: user_role;
  is_active: boolean;
  has_password: boolean;
  tier_id?: string | null;
  created_at: Date;
}

export interface AuthSuccessResponse {
  access_token: string;
  user: SafeUser;
}

export interface JwtUserPayload {
  userId: string;
  email: string;
  role: user_role;
}
