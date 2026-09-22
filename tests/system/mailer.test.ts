import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { assertSmtpConfigured, sendSmtpMail } from '../../lib/server/system/application/mailer';
import { parseSystemSettings } from '../../lib/server/system/domain/settings';

const configured = (port: number, secure: boolean) => parseSystemSettings({
  smtp: { enabled: true, host: 'smtp.example.com', fromEmail: 'sender@example.com', username: 'mailbox', port, secure },
}).smtp;

test('SMTP standard ports use the matching TLS mode and preserve the supplied username', () => {
  assert.equal(assertSmtpConfigured(configured(465, false), 'password').secure, true);
  assert.equal(assertSmtpConfigured(configured(587, true), 'password').secure, false);
  assert.equal(assertSmtpConfigured(configured(2525, true), 'password').secure, true);
  assert.equal(assertSmtpConfigured(configured(2525, false), 'password').secure, false);
  assert.equal(assertSmtpConfigured(configured(465, false), 'password').username, 'mailbox');
  assert.throws(() => assertSmtpConfigured(configured(587, false), null), /未配置密码/);
});

test('mail transport uses TLS on 465, passes recipient and code, and closes after delivery', async (t) => {
  let closed = false;
  let options: unknown;
  let message: unknown;
  t.mock.method(nodemailer, 'createTransport', (input: unknown) => {
    options = input;
    return {
      sendMail: async (input: unknown) => { message = input; },
      close: () => { closed = true; },
    };
  });
  const smtp = assertSmtpConfigured(configured(465, false), 'password');
  await sendSmtpMail(smtp, { to: 'recipient@example.com', subject: '验证码', text: '123456' });
  assert.equal((options as { secure: boolean }).secure, true);
  assert.deepEqual((options as { auth: unknown }).auth, { user: 'mailbox', pass: 'password' });
  assert.equal((message as { to: string }).to, 'recipient@example.com');
  assert.equal((message as { text: string }).text, '123456');
  assert.equal(closed, true);
});
