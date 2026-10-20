// ============================================================================
// MODULE AUTH - SERVICE (auth.service.ts)
// Đồng bộ 100% với cấu trúc Database PostgreSQL trên Supabase của Nine2Fine
// ============================================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/prisma';
import { token_purpose, user_role, auth_method } from '@prisma/client';
import {
  CheckEmailResponse,
  SendOtpInput,
  SendOtpResponse,
  RegisterInput,
  AuthSuccessResponse,
  LoginOtpInput,
  LoginPasswordInput,
  ResetPasswordInput,
  JwtUserPayload,
  SafeUser,
} from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'nine2fine_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  private generateNumericOtp(digits: number = 8): string {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  private generateJwtToken(payload: JwtUserPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as any,
    });
  }

  private async sendEmail(to: string, subject: string, message: string): Promise<void> {
    console.log(`\n================== [DỊCH VỤ EMAIL NINE2FINE] ==================`);
    console.log(`📩 Gửi đến: ${to}`);
    console.log(`📌 Tiêu đề: ${subject}`);
    console.log(`📄 Nội dung: ${message}`);
    console.log(`=================================================================\n`);
  }

  private formatSafeUser(user: any): SafeUser {
    return {
      id: user.user_id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      phone: user.phone_number,
      role: user.role,
      is_active: user.isActive,
      has_password: Boolean(user.passwordHash),
      tier_id: user.membership_tier_id,
      created_at: user.createdAt,
    };
  }

  // 1. KIỂM TRA TÀI KHOẢN EMAIL
  async checkEmail(rawEmail: string): Promise<CheckEmailResponse> {
    const email = rawEmail.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        email,
        is_registered: false,
        has_password: false,
      };
    }

    return {
      email,
      is_registered: true,
      has_password: Boolean(user.passwordHash),
    };
  }

  // 2. GỬI MÃ OTP
  async sendOtp(input: SendOtpInput): Promise<SendOtpResponse> {
    const email = input.email.trim().toLowerCase();
    const purpose = input.purpose as token_purpose;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (purpose === 'register' && existingUser) {
      const error: any = new Error('Email này đã được sử dụng. Vui lòng đăng nhập.');
      error.statusCode = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // Kiểm tra khóa xác thực OTP (sai 5 lần bị khóa 15 phút)
    const activeLockToken = await prisma.authActionToken.findFirst({
      where: {
        email,
        lockedUntil: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeLockToken && activeLockToken.lockedUntil) {
      const remainingMinutes = Math.ceil(
        (activeLockToken.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      const error: any = new Error(
        `Email đang tạm khóa xác thực do nhập sai quá 5 lần. Vui lòng thử lại sau ${remainingMinutes} phút.`
      );
      error.statusCode = 429;
      throw error;
    }

    // Giới hạn gửi OTP: cách nhau 60s
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const recentToken = await prisma.authActionToken.findFirst({
      where: {
        email,
        purpose,
        createdAt: { gte: sixtySecondsAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentToken) {
      const secondsLeft = Math.ceil(
        (recentToken.createdAt.getTime() + 60 * 1000 - Date.now()) / 1000
      );
      const error: any = new Error(
        `Vui lòng chờ ${secondsLeft} giây trước khi yêu cầu gửi lại mã OTP.`
      );
      error.statusCode = 429;
      throw error;
    }

    // Tối đa 5 lần trong 30 phút
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const countIn30Mins = await prisma.authActionToken.count({
      where: {
        email,
        purpose,
        createdAt: { gte: thirtyMinutesAgo },
      },
    });

    if (countIn30Mins >= 5) {
      const error: any = new Error(
        'Bạn đã vượt quá giới hạn gửi OTP (tối đa 5 lần trong 30 phút). Vui lòng thử lại sau 30 phút.'
      );
      error.statusCode = 429;
      throw error;
    }

    // Vô hiệu hóa OTP cũ bằng cách cập nhật invalidated_at
    await prisma.authActionToken.updateMany({
      where: {
        email,
        purpose,
        used_at: null,
        invalidated_at: null,
      },
      data: { invalidated_at: new Date() },
    });

    // Nếu purpose = login mà email chưa đăng ký -> trả thành công nhưng không gửi mail
    if (purpose === 'login' && !existingUser) {
      return { resend_available_in_seconds: 60 };
    }

    // Tạo OTP 8 số và hash
    const otp = this.generateNumericOtp(8);
    const salt = await bcrypt.genSalt(10);
    const tokenHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.authActionToken.create({
      data: {
        email,
        user_id: existingUser?.user_id || null,
        tokenHash,
        purpose,
        attempts: 0,
        expiresAt,
      },
    });

    await this.sendEmail(
      email,
      `[Nine2Fine] Mã xác thực OTP cho mục đích ${purpose.toUpperCase()}`,
      `Xin chào, mã xác thực OTP của bạn là: ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`
    );

    return { resend_available_in_seconds: 60 };
  }

  // HÀM XÁC THỰC MÃ OTP
  private async verifyOtp(email: string, rawOtp: string, purpose: token_purpose): Promise<void> {
    const lockToken = await prisma.authActionToken.findFirst({
      where: {
        email,
        lockedUntil: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lockToken && lockToken.lockedUntil) {
      const mins = Math.ceil((lockToken.lockedUntil.getTime() - Date.now()) / (1000 * 60));
      const error: any = new Error(
        `Email đang bị khóa xác thực do nhập sai 5 lần. Vui lòng thử lại sau ${mins} phút.`
      );
      error.statusCode = 429;
      throw error;
    }

    const tokenRecord = await prisma.authActionToken.findFirst({
      where: {
        email,
        purpose,
        used_at: null,
        invalidated_at: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!tokenRecord) {
      const error: any = new Error('Mã OTP không hợp lệ hoặc đã hết hạn.');
      error.statusCode = 400;
      throw error;
    }

    if (new Date() > tokenRecord.expiresAt) {
      await prisma.authActionToken.update({
        where: { token_id: tokenRecord.token_id },
        data: { invalidated_at: new Date() },
      });
      const error: any = new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
      error.statusCode = 400;
      throw error;
    }

    const isMatch = await bcrypt.compare(rawOtp, tokenRecord.tokenHash);
    if (!isMatch) {
      const updatedAttempts = tokenRecord.attempts + 1;
      const isLockedNow = updatedAttempts >= 5;
      const lockedUntil = isLockedNow ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.authActionToken.update({
        where: { token_id: tokenRecord.token_id },
        data: {
          attempts: updatedAttempts,
          lockedUntil,
          invalidated_at: isLockedNow ? new Date() : null,
        },
      });

      if (isLockedNow) {
        const error: any = new Error(
          'Bạn đã nhập sai OTP 5 lần liên tiếp. Phiên xác thực tạm khóa 15 phút.'
        );
        error.statusCode = 429;
        throw error;
      }

      const error: any = new Error(
        `Mã OTP không chính xác. Bạn còn ${5 - updatedAttempts} lần thử.`
      );
      error.statusCode = 400;
      throw error;
    }

    await prisma.authActionToken.update({
      where: { token_id: tokenRecord.token_id },
      data: { used_at: new Date() },
    });
  }

  // 3. ĐĂNG KÝ TÀI KHOẢN
  async register(input: RegisterInput): Promise<AuthSuccessResponse> {
    const email = input.email.trim().toLowerCase();

    if (!input.accepted_terms) {
      const error: any = new Error('Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật.');
      error.statusCode = 400;
      throw error;
    }

    let parsedDob: Date | undefined;
    if (input.date_of_birth) {
      parsedDob = new Date(input.date_of_birth);
      if (isNaN(parsedDob.getTime()) || parsedDob > new Date()) {
        const error: any = new Error('Ngày sinh không hợp lệ hoặc không được ở tương lai.');
        error.statusCode = 400;
        throw error;
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const error: any = new Error('Email này đã được sử dụng.');
      error.statusCode = 409;
      throw error;
    }

    await this.verifyOtp(email, input.otp, 'register');

    const newUser = await prisma.user.create({
      data: {
        email,
        firstName: input.first_name.trim(),
        lastName: input.last_name.trim(),
        dateOfBirth: parsedDob,
        passwordHash: null,
        role: 'member',
        isActive: true,
        terms_accepted_at: new Date(),
        marketingOptIn: Boolean(input.marketing_opt_in),
      },
    });

    const access_token = this.generateJwtToken({
      userId: newUser.user_id,
      email: newUser.email,
      role: newUser.role,
    });

    return {
      access_token,
      user: this.formatSafeUser(newUser),
    };
  }

  // 4. ĐĂNG NHẬP BẰNG OTP
  async loginOtp(input: LoginOtpInput): Promise<AuthSuccessResponse> {
    const email = input.email.trim().toLowerCase();

    await this.verifyOtp(email, input.otp, 'login');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const error: any = new Error('Không tìm thấy tài khoản người dùng.');
      error.statusCode = 404;
      throw error;
    }

    if (!user.isActive) {
      const error: any = new Error('Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.');
      error.statusCode = 403;
      throw error;
    }

    const access_token = this.generateJwtToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token,
      user: this.formatSafeUser(user),
    };
  }

  // 5. ĐĂNG NHẬP BẰNG MẬT KHẨU
  async loginPassword(input: LoginPasswordInput): Promise<AuthSuccessResponse> {
    const email = input.email.trim().toLowerCase();
    const deviceId = input.device_id || 'default-device';

    // Kiểm tra khóa thiết bị (LOGIN-05)
    const lockCheck = await prisma.loginAttempt.findUnique({
      where: {
        email_deviceId: {
          email,
          deviceId,
        },
      },
    });

    if (lockCheck && lockCheck.lockedUntil && lockCheck.lockedUntil > new Date()) {
      const remainingMins = Math.ceil(
        (lockCheck.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      const error: any = new Error(
        `Thiết bị này tạm thời bị khóa 15 phút do nhập sai mật khẩu 5 lần. Vui lòng thử lại sau ${remainingMins} phút.`
      );
      error.statusCode = 429;
      throw error;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    let isPasswordCorrect = false;
    if (user && user.passwordHash) {
      isPasswordCorrect = await bcrypt.compare(input.password, user.passwordHash);
    }

    if (!user || !user.passwordHash || !isPasswordCorrect) {
      const currentFailed = (lockCheck?.failed_count || 0) + 1;
      const isLockedNow = currentFailed >= 5;
      const lockedUntil = isLockedNow ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.loginAttempt.upsert({
        where: {
          email_deviceId: {
            email,
            deviceId,
          },
        },
        update: {
          failed_count: currentFailed,
          lockedUntil,
          updated_at: new Date(),
        },
        create: {
          email,
          deviceId,
          failed_count: 1,
          lockedUntil: null,
          updated_at: new Date(),
        },
      });

      const error: any = new Error('Email hoặc mật khẩu không chính xác.');
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error: any = new Error('Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.');
      error.statusCode = 403;
      throw error;
    }

    // Reset bộ đếm số lần sai
    await prisma.loginAttempt.deleteMany({
      where: { email, deviceId },
    });

    // Tạo phiên Session
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.user_id,
        deviceId,
        refreshTokenHash,
        login_method: 'password',
        expiresAt,
      },
    });

    const access_token = this.generateJwtToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token,
      user: this.formatSafeUser(user),
    };
  }

  // 6. QUÊN MẬT KHẨU
  async forgotPassword(rawEmail: string): Promise<{ message: string }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      await prisma.authActionToken.updateMany({
        where: { email, purpose: 'reset_password', used_at: null },
        data: { invalidated_at: new Date() },
      });

      const otp = this.generateNumericOtp(8);
      const salt = await bcrypt.genSalt(10);
      const tokenHash = await bcrypt.hash(otp, salt);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.authActionToken.create({
        data: {
          email,
          user_id: user.user_id,
          tokenHash,
          purpose: 'reset_password',
          expiresAt,
          attempts: 0,
        },
      });

      await this.sendEmail(
        email,
        '[Nine2Fine] Yêu cầu đặt lại mật khẩu',
        `Mã OTP để đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 5 phút.`
      );
    }

    return {
      message:
        'Nếu email tồn tại trên hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
    };
  }

  // 7. ĐẶT LẠI MẬT KHẨU
  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const email = input.email.trim().toLowerCase();

    if (input.new_password !== input.confirm_password) {
      const error: any = new Error('Mật khẩu mới và mật khẩu nhập lại không trùng khớp.');
      error.statusCode = 400;
      throw error;
    }

    if (input.new_password.length < 8) {
      const error: any = new Error('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      error.statusCode = 400;
      throw error;
    }

    await this.verifyOtp(email, input.otp, 'reset_password');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.new_password, salt);

    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    };
  }

  // 8. ĐĂNG XUẤT
  async logout(userId: string): Promise<{ message: string }> {
    await prisma.session.updateMany({
      where: { userId, revoked_at: null },
      data: { revoked_at: new Date(), revoke_reason: 'user_logout' },
    });

    return { message: 'Đăng xuất thành công.' };
  }
}

export default new AuthService();
