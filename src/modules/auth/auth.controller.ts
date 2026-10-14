// ============================================================================
// MODULE AUTH - CONTROLLER (auth.controller.ts)
// Tiếp nhận Request từ Routes, thực hiện:
// 1. Kiểm tra tính hợp lệ dữ liệu đầu vào (Validation sơ bộ: định dạng email, trường bắt buộc)
// 2. Gọi hàm tương ứng từ AuthService để thực thi logic
// 3. Trả về Response chuẩn RESTful API với HTTP Status Code rõ ràng (200, 201, 400, 401, 500)
// Theo đúng phong cách mô hình MVC giảng dạy trong Slide của thầy Nguyễn Quang Phúc
// ============================================================================

import { Request, Response } from 'express';
import authService from './auth.service';
import jwt from 'jsonwebtoken';

// Regex kiểm tra định dạng email hợp lệ theo chuẩn
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthController {
  // --------------------------------------------------------------------------
  // 1. KIỂM TRA EMAIL (POST /api/auth/check-email)
  // --------------------------------------------------------------------------
  async checkEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      // Bước 1: Validate đầu vào
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          status: 'error',
          message: 'Vui lòng cung cấp địa chỉ email.',
        });
        return;
      }

      if (!EMAIL_REGEX.test(email)) {
        res.status(400).json({
          status: 'error',
          message: 'Định dạng email không hợp lệ.',
        });
        return;
      }

      // Bước 2: Gọi Service xử lý
      const result = await authService.checkEmail(email);

      // Bước 3: Trả về kết quả
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      console.error('Lỗi tại checkEmail:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi kiểm tra email.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. GỬI MÃ OTP (POST /api/auth/send-otp)
  // --------------------------------------------------------------------------
  async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { email, purpose } = req.body;

      // Validate email
      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({
          status: 'error',
          message: 'Định dạng email không hợp lệ.',
        });
        return;
      }

      // Validate purpose (chỉ chấp nhận register hoặc login)
      if (!purpose || !['register', 'login'].includes(purpose)) {
        res.status(400).json({
          status: 'error',
          message: "Mục đích gửi OTP (purpose) phải là 'register' hoặc 'login'.",
        });
        return;
      }

      // Gọi service
      const result = await authService.sendOtp({ email, purpose });

      res.status(200).json({
        status: 'success',
        message: 'Mã OTP đã được gửi đến email của bạn.',
        data: result,
      });
    } catch (error: any) {
      console.error('Lỗi tại sendOtp:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        code: error.code,
        message: error.message || 'Lỗi hệ thống khi gửi mã OTP.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. ĐĂNG KÝ TÀI KHOẢN (POST /api/auth/register)
  // --------------------------------------------------------------------------
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp, first_name, last_name, date_of_birth, accepted_terms, marketing_opt_in } =
        req.body;

      // Validate dữ liệu bắt buộc
      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ status: 'error', message: 'Email không hợp lệ.' });
        return;
      }

      if (!otp || String(otp).trim().length !== 8) {
        res.status(400).json({ status: 'error', message: 'Mã OTP phải gồm 8 chữ số.' });
        return;
      }

      if (!first_name || !String(first_name).trim()) {
        res.status(400).json({ status: 'error', message: 'Họ và tên đệm không được để trống.' });
        return;
      }

      if (!last_name || !String(last_name).trim()) {
        res.status(400).json({ status: 'error', message: 'Tên không được để trống.' });
        return;
      }

      if (accepted_terms !== true) {
        res.status(400).json({
          status: 'error',
          message: 'Bạn phải đồng ý với Điều khoản sử dụng và Chính sách bảo mật.',
        });
        return;
      }

      // Gọi service đăng ký
      const result = await authService.register({
        email,
        otp: String(otp).trim(),
        first_name,
        last_name,
        date_of_birth,
        accepted_terms,
        marketing_opt_in,
      });

      // Trả về mã 201 Created chuẩn RESTful API khi tạo mới thành công
      res.status(201).json({
        status: 'success',
        message: 'Đăng ký tài khoản thành công!',
        data: result,
      });
    } catch (error: any) {
      console.error('Lỗi tại register:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi đăng ký tài khoản.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 4. ĐĂNG NHẬP BẰNG OTP (POST /api/auth/login-otp)
  // --------------------------------------------------------------------------
  async loginOtp(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp } = req.body;

      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ status: 'error', message: 'Email không hợp lệ.' });
        return;
      }

      if (!otp || String(otp).trim().length !== 8) {
        res.status(400).json({ status: 'error', message: 'Mã OTP phải gồm 8 chữ số.' });
        return;
      }

      const result = await authService.loginOtp({
        email,
        otp: String(otp).trim(),
      });

      res.status(200).json({
        status: 'success',
        message: 'Đăng nhập bằng OTP thành công!',
        data: result,
      });
    } catch (error: any) {
      console.error('Lỗi tại loginOtp:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi đăng nhập bằng OTP.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 5. ĐĂNG NHẬP BẰNG MẬT KHẨU (POST /api/auth/login)
  // --------------------------------------------------------------------------
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      // Lấy Device ID từ header X-Device-Id hoặc từ body để theo dõi số lần sai
      const deviceId =
        (req.headers['x-device-id'] as string) || req.body.device_id || req.ip || 'unknown-device';

      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ status: 'error', message: 'Email không hợp lệ.' });
        return;
      }

      if (!password || typeof password !== 'string') {
        res.status(400).json({ status: 'error', message: 'Vui lòng nhập mật khẩu.' });
        return;
      }

      const result = await authService.loginPassword({
        email,
        password,
        device_id: deviceId,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đăng nhập thành công!',
        data: result,
      });
    } catch (error: any) {
      console.error('Lỗi tại login:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi đăng nhập.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 6. QUÊN MẬT KHẨU (POST /api/auth/forgot-password)
  // --------------------------------------------------------------------------
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ status: 'error', message: 'Email không hợp lệ.' });
        return;
      }

      const result = await authService.forgotPassword(email);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      console.error('Lỗi tại forgotPassword:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi yêu cầu quên mật khẩu.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. ĐẶT LẠI MẬT KHẨU (POST /api/auth/reset-password)
  // --------------------------------------------------------------------------
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp, new_password, confirm_password } = req.body;

      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ status: 'error', message: 'Email không hợp lệ.' });
        return;
      }

      if (!otp) {
        res.status(400).json({ status: 'error', message: 'Vui lòng cung cấp mã OTP.' });
        return;
      }

      if (!new_password || !confirm_password) {
        res.status(400).json({
          status: 'error',
          message: 'Vui lòng điền đầy đủ mật khẩu mới và xác nhận mật khẩu.',
        });
        return;
      }

      const result = await authService.resetPassword({
        email,
        otp: String(otp).trim(),
        new_password,
        confirm_password,
      });

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      console.error('Lỗi tại resetPassword:', error);
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Lỗi hệ thống khi đặt lại mật khẩu.',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 8. ĐĂNG XUẤT (POST /api/auth/logout)
  // --------------------------------------------------------------------------
  async logout(req: Request, res: Response): Promise<void> {
    try {
      // Đọc token từ Header Authorization: Bearer <token>
      const authHeader = req.headers['authorization'];
      let userId = 'anonymous';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const decoded: any = jwt.decode(token);
          if (decoded && decoded.userId) {
            userId = decoded.userId;
          }
        } catch (e) {
          // Token decode lỗi thì bỏ qua
        }
      }

      const result = await authService.logout(userId);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      console.error('Lỗi tại logout:', error);
      res.status(500).json({
        status: 'error',
        message: 'Lỗi hệ thống khi đăng xuất.',
      });
    }
  }
}

export default new AuthController();
