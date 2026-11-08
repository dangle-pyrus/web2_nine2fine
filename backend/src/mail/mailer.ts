import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfig, getConfig } from '../config/env';
import { logger } from '../lib/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Hợp đồng tối thiểu của một nơi gửi thư (SMTP thật, hộp thư dev, hoặc giả trong test). */
export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

function fromHeader(cfg: AppConfig): string {
  return `"${cfg.mail.fromName.replace(/"/g, '')}" <${cfg.mail.fromAddress}>`;
}

export function createSmtpTransport(cfg: AppConfig): MailTransport {
  const smtp = cfg.mail.smtp;
  if (!smtp) throw new Error('SMTP is not configured');
  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return {
    async send(msg) {
      await transporter.sendMail({ from: fromHeader(cfg), to: msg.to, subject: msg.subject, text: msg.text });
    },
  };
}

/** Ghi mỗi thư thành một file .eml vào thư mục dev-outbox (đã nằm trong .gitignore). */
export function createDevOutboxTransport(cfg: AppConfig): MailTransport {
  const dir = cfg.mail.outboxDir
    ? path.resolve(cfg.mail.outboxDir)
    : path.resolve(__dirname, '..', '..', 'dev-outbox');
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  return {
    async send(msg) {
      const info = await composer.sendMail({
        from: fromHeader(cfg),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });
      await mkdir(dir, { recursive: true });
      const safeTo = msg.to.replace(/[^a-z0-9@._+-]/gi, '_');
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeTo}_${randomUUID().slice(0, 8)}.eml`);
      await writeFile(file, info.message as Buffer);
    },
  };
}

let transport: MailTransport | undefined;
const pending = new Set<Promise<void>>();

function getTransport(): MailTransport {
  if (!transport) {
    const cfg = getConfig();
    transport = cfg.mail.mode === 'smtp' ? createSmtpTransport(cfg) : createDevOutboxTransport(cfg);
  }
  return transport;
}

/** Test thay transport bằng bản giả. Truyền undefined để quay về mặc định. */
export function setMailTransport(t: MailTransport | undefined): void {
  transport = t;
}

/**
 * Gửi thư nền: không chờ (để thời gian phản hồi không phụ thuộc việc email có tồn tại, BR-AUTH-03).
 * Lỗi chỉ được log tên lỗi, không log địa chỉ nhận đầy đủ, nội dung hay mã.
 */
export function sendMailInBackground(msg: MailMessage): void {
  runInBackground('mail-send', async () => {
    await getTransport().send(msg);
  });
}

/** Gửi thư và CHỜ kết quả (ném lỗi nếu thất bại): dùng cho việc thử lại có đếm (email xác nhận đơn). */
export async function sendMail(msg: MailMessage): Promise<void> {
  await getTransport().send(msg);
}

/**
 * Chạy tác vụ nền (không chờ). Lỗi chỉ được log tên lỗi + nhãn, không log địa chỉ, nội dung hay mã.
 * Được theo dõi để flushMail() chờ xong (test ổn định, tắt máy chủ gọn).
 */
export function runInBackground(label: string, task: () => Promise<void>): void {
  const p = (async () => {
    try {
      await task();
    } catch (err) {
      logger.error(`${label}-failed`, { reason: err instanceof Error ? err.name : 'unknown' });
    }
  })();
  pending.add(p);
  void p.finally(() => pending.delete(p));
}

/** Chờ mọi thư nền gửi xong (dùng trong test và khi tắt máy chủ). */
export async function flushMail(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
