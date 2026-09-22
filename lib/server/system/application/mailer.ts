import nodemailer from 'nodemailer';
import { AppError } from '../../shared/errors';
import { createLogger } from '../../shared/logger';
import type { SmtpSettings } from '../domain/settings';

export type SendMailInput = Readonly<{
  to: string;
  subject: string;
  text: string;
  html?: string;
}>;

export type ResolvedSmtp = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}>;

export function assertSmtpConfigured(smtp: SmtpSettings, password: string | null): ResolvedSmtp {
  if (!smtp.enabled) {
    throw new AppError('CONFIG_INVALID', 'SMTP 未启用', 400);
  }
  if (!smtp.host.trim() || !smtp.fromEmail.trim()) {
    throw new AppError('CONFIG_INVALID', 'SMTP 主机与发件人邮箱必填', 400);
  }
  if (smtp.username.trim() && !password) {
    throw new AppError('CONFIG_INVALID', 'SMTP 已配置登录账号但未配置密码', 400);
  }
  return {
    host: smtp.host.trim(),
    port: smtp.port,
    secure: smtp.port === 465 ? true : smtp.port === 587 ? false : smtp.secure,
    username: smtp.username.trim(),
    password: password ?? '',
    fromEmail: smtp.fromEmail.trim(),
    fromName: smtp.fromName.trim() || 'AnimeStream',
  };
}

export async function sendSmtpMail(
  smtp: ResolvedSmtp,
  message: SendMailInput,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: smtp.username
      ? {
          user: smtp.username,
          pass: smtp.password,
        }
      : undefined,
  });

  try {
    await transport.sendMail({
      from: smtp.fromName
        ? `"${smtp.fromName.replace(/"/g, '')}" <${smtp.fromEmail}>`
        : smtp.fromEmail,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    const failure = error as { code?: string; command?: string; responseCode?: number };
    createLogger().error('SMTP delivery failed', {
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      code: failure?.code, command: failure?.command, responseCode: failure?.responseCode,
    });
    const msg = error instanceof Error ? error.message : String(error);
    throw new AppError('RESULT_INVALID', `邮件发送失败: ${msg}`, 502);
  } finally {
    transport.close();
  }
}

export async function sendSmtpTest(
  smtp: ResolvedSmtp,
  to: string,
  siteTitle: string = 'AnimeStream',
): Promise<void> {
  await sendSmtpMail(smtp, {
    to,
    subject: `[${siteTitle}] SMTP 测试邮件`,
    text: `这是一封来自 ${siteTitle} 管理后台的 SMTP 配置测试邮件。若你收到此信，说明 SMTP 配置正常。`,
    html: `<p>这是一封来自 <strong>${siteTitle}</strong> 管理后台的 SMTP 配置测试邮件。</p><p>若你收到此信，说明 SMTP 配置正常。</p>`,
  });
}
