import { MailMessage } from './mailer';

export type CodePurposeApi = 'login' | 'register' | 'reset-password';

const PURPOSE_TEXT: Record<CodePurposeApi, { subject: string; what: string }> = {
  login: { subject: 'Mã đăng nhập nine2fine', what: 'đăng nhập' },
  register: { subject: 'Mã đăng ký nine2fine', what: 'đăng ký tài khoản' },
  'reset-password': { subject: 'Mã đặt lại mật khẩu nine2fine', what: 'đặt lại mật khẩu' },
};

export function codeMail(to: string, purpose: CodePurposeApi, code: string): MailMessage {
  const p = PURPOSE_TEXT[purpose];
  return {
    to,
    subject: p.subject,
    text: [
      'Xin chào,',
      '',
      `Mã xác thực để ${p.what} tại nine2fine của bạn là: ${code}`,
      '',
      'Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.',
      'Không chia sẻ mã này với bất kỳ ai, kể cả người tự xưng là nhân viên nine2fine.',
      'Nếu bạn không yêu cầu mã này, hãy bỏ qua thư.',
      '',
      'nine2fine',
    ].join('\n'),
  };
}

export function alreadyRegisteredMail(to: string): MailMessage {
  return {
    to,
    subject: 'Email này đã có tài khoản nine2fine',
    text: [
      'Xin chào,',
      '',
      'Email này đã có tài khoản nine2fine. Hãy đăng nhập thay vì đăng ký mới.',
      'Nếu bạn quên mật khẩu, chọn "Quên mật khẩu" ở trang đăng nhập.',
      'Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua thư.',
      '',
      'nine2fine',
    ].join('\n'),
  };
}

export function accountDisabledMail(to: string, supportEmail: string): MailMessage {
  return {
    to,
    subject: 'Tài khoản nine2fine đang bị tạm khóa',
    text: [
      'Xin chào,',
      '',
      'Tài khoản nine2fine của bạn đang bị tạm khóa nên không thể đăng nhập hay đặt lại mật khẩu.',
      `Vui lòng liên hệ ${supportEmail} để được hỗ trợ.`,
      '',
      'nine2fine',
    ].join('\n'),
  };
}

export function passwordChangedMail(to: string, supportEmail: string): MailMessage {
  return {
    to,
    subject: 'Mật khẩu nine2fine vừa được thay đổi',
    text: [
      'Xin chào,',
      '',
      'Mật khẩu tài khoản nine2fine của bạn vừa được thay đổi và mọi phiên đăng nhập cũ đã bị đăng xuất.',
      `Nếu không phải bạn, hãy liên hệ ${supportEmail} ngay.`,
      '',
      'nine2fine',
    ].join('\n'),
  };
}
