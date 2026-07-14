import { AppError } from '../../shared/errors';

export type TurnstileVerifyResult = Readonly<{
  success: boolean;
  errorCodes: readonly string[];
}>;

/**
 * Verify Cloudflare Turnstile token server-side.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifyTurnstileToken(input: {
  secret: string;
  token: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileVerifyResult> {
  const token = input.token.trim();
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }
  if (!input.secret) {
    throw new AppError('CONFIG_INVALID', 'Turnstile secret 未配置', 500);
  }

  const body = new URLSearchParams();
  body.set('secret', input.secret);
  body.set('response', token);
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  const fetchFn = input.fetchImpl ?? fetch;
  const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new AppError('RESULT_INVALID', 'Turnstile 校验服务不可用', 502);
  }

  const data = (await res.json()) as {
    success?: boolean;
    'error-codes'?: string[];
  };

  return {
    success: !!data.success,
    errorCodes: data['error-codes'] ?? [],
  };
}

export async function assertTurnstileOk(input: {
  secret: string;
  token: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const result = await verifyTurnstileToken(input);
  if (!result.success) {
    throw new AppError('RESULT_INVALID', '人机验证失败，请重试', 400, false, {
      field: 'turnstile',
      codes: result.errorCodes,
    });
  }
}
