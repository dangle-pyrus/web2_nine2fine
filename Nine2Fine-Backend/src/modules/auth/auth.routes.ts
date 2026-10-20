// ============================================================================
// MODULE AUTH - ROUTES (auth.routes.ts)
// Định nghĩa các Endpoint RESTful API cho chức năng Auth
// Tuân thủ cấu trúc Express Router được giảng dạy trong slide của thầy Nguyễn Quang Phúc
// ============================================================================

import { Router } from 'express';
import authController from './auth.controller';

const router = Router();

/**
 * 1. POST /api/auth/check-email
 * Mô tả: Kiểm tra tài khoản email có tồn tại trên hệ thống và đã có mật khẩu hay chưa.
 * Auth: Public
 */
router.post('/check-email', (req, res) => authController.checkEmail(req, res));

/**
 * 2. POST /api/auth/send-otp
 * Mô tả: Gửi mã OTP xác thực (dành cho register hoặc login) kèm cơ chế giới hạn tần suất.
 * Auth: Public
 */
router.post('/send-otp', (req, res) => authController.sendOtp(req, res));

/**
 * 3. POST /api/auth/register
 * Mô tả: Đăng ký tài khoản người dùng mới sau khi xác thực mã OTP.
 * Auth: Public
 */
router.post('/register', (req, res) => authController.register(req, res));

/**
 * 4. POST /api/auth/login-otp
 * Mô tả: Đăng nhập nhanh chóng và an toàn bằng mã OTP gửi về email.
 * Auth: Public
 */
router.post('/login-otp', (req, res) => authController.loginOtp(req, res));

/**
 * 5. POST /api/auth/login
 * Mô tả: Đăng nhập bằng email và mật khẩu (kèm cơ chế khóa tạm thời nếu nhập sai 5 lần).
 * Auth: Public
 */
router.post('/login', (req, res) => authController.login(req, res));

/**
 * 6. POST /api/auth/forgot-password
 * Mô tả: Yêu cầu gửi mã OTP để đặt lại mật khẩu mới.
 * Auth: Public
 */
router.post('/forgot-password', (req, res) => authController.forgotPassword(req, res));

/**
 * 7. POST /api/auth/reset-password
 * Mô tả: Xác nhận mã OTP và cập nhật mật khẩu mới cho tài khoản.
 * Auth: Public
 */
router.post('/reset-password', (req, res) => authController.resetPassword(req, res));

/**
 * 8. POST /api/auth/logout
 * Mô tả: Đăng xuất người dùng và thu hồi phiên làm việc hiện tại.
 * Auth: Bearer Token
 */
router.post('/logout', (req, res) => authController.logout(req, res));

export default router;
