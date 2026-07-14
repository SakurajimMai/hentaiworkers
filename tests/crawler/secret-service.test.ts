import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  buildSecretAad,
  SecretService,
} from '../../lib/server/crawler/application/secret-service';
import { InMemorySecretRepository } from '../../lib/server/crawler/testing/in-memory-config-repos';
import {
  AesGcmSecretCipher,
  constantTimeEqualBytes,
  keyringViewFromRecord,
} from '../../lib/server/infrastructure/crypto/aes-gcm-secret-cipher';
import { AppError } from '../../lib/server/shared/errors';

function makeCipher(currentKeyId = 'k1', keys?: Record<string, Uint8Array>) {
  const material = keys ?? {
    k1: randomBytes(32),
    k0: randomBytes(32),
  };
  return {
    cipher: new AesGcmSecretCipher(keyringViewFromRecord(currentKeyId, material)),
    keys: material,
  };
}

function makeService(currentKeyId = 'k1', keys?: Record<string, Uint8Array>) {
  const repo = new InMemorySecretRepository();
  const { cipher, keys: material } = makeCipher(currentKeyId, keys);
  return {
    service: new SecretService(repo, cipher),
    repo,
    cipher,
    keys: material,
  };
}

test('create encrypts with 96-bit nonce and AAD secretId:version:scope', async () => {
  const { service, repo, cipher } = makeService();
  const meta = await service.create({
    name: 'proxy-http',
    scope: 'network.proxy',
    plaintext: 'socks5://user:pass@host:1080',
  });

  assert.equal(meta.currentVersion, 1);
  assert.equal(meta.isRevoked, false);

  const version = await repo.getCurrentVersion(meta.id);
  assert.ok(version);
  assert.equal(version.nonce.byteLength, 12);
  assert.equal(version.authTag.byteLength, 16);
  assert.equal(version.keyId, 'k1');
  // ciphertext must not contain plaintext
  assert.equal(
    Buffer.from(version.ciphertext).includes(Buffer.from('socks5://')),
    false,
  );

  const aad = buildSecretAad(meta.id, 1, 'network.proxy');
  assert.equal(aad, `${meta.id}:1:network.proxy`);

  // wrong AAD fails
  assert.throws(
    () =>
      cipher.decrypt(
        {
          keyId: version.keyId,
          ciphertext: version.ciphertext,
          nonce: version.nonce,
          authTag: version.authTag,
        },
        buildSecretAad(meta.id, 1, 'wrong-scope'),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'SECRET_REVOKED');
      return true;
    },
  );
});

test('reveal returns plaintext with cacheControl no-store only', async () => {
  const { service } = makeService();
  const meta = await service.create({
    name: 'api-token',
    scope: 'worker.auth',
    plaintext: 'super-secret-value',
  });

  const revealed = await service.reveal(meta.id);
  assert.equal(revealed.plaintext, 'super-secret-value');
  assert.equal(revealed.cacheControl, 'no-store');
  assert.equal(revealed.version, 1);
  assert.equal(revealed.secretId, meta.id);

  // list never exposes plaintext
  const listed = await service.list();
  const item = listed.find((row) => row.id === meta.id);
  assert.ok(item);
  assert.equal(item.maskedValue, '••••••••');
  assert.equal(
    JSON.stringify(listed).includes('super-secret-value'),
    false,
  );
});

test('rotate writes new version; historical key still decrypts after keyring rotate write key', async () => {
  const k0 = randomBytes(32);
  const k1 = randomBytes(32);
  const keys = { k0, k1 };
  const repo = new InMemorySecretRepository();
  const cipherV0 = new AesGcmSecretCipher(keyringViewFromRecord('k0', keys));
  const serviceV0 = new SecretService(repo, cipherV0);

  const meta = await serviceV0.create({
    name: 'sftp-pass',
    scope: 'storage.sftp',
    plaintext: 'old-password',
  });

  // switch current write key to k1 (historical k0 remains for decrypt)
  const cipherV1 = new AesGcmSecretCipher(keyringViewFromRecord('k1', keys));
  const serviceV1 = new SecretService(repo, cipherV1);

  // old ciphertext still decrypts via keyId k0
  const stillOld = await serviceV1.reveal(meta.id);
  assert.equal(stillOld.plaintext, 'old-password');

  const rotated = await serviceV1.rotate(meta.id, 'new-password');
  assert.equal(rotated.currentVersion, 2);

  const revealed = await serviceV1.reveal(meta.id);
  assert.equal(revealed.plaintext, 'new-password');
  assert.equal(revealed.version, 2);

  const v2 = await repo.getCurrentVersion(meta.id);
  assert.ok(v2);
  assert.equal(v2.keyId, 'k1');
});

test('revoked secret rejects reveal and rotate', async () => {
  const { service } = makeService();
  const meta = await service.create({
    name: 'temp',
    scope: 'test',
    plaintext: 'value',
  });
  await service.revoke(meta.id);

  await assert.rejects(() => service.reveal(meta.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'SECRET_REVOKED');
    return true;
  });
  await assert.rejects(() => service.rotate(meta.id, 'next'), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'SECRET_REVOKED');
    return true;
  });
});

test('invalid nonce/authTag lengths are rejected', () => {
  const { cipher } = makeCipher();
  assert.throws(
    () =>
      cipher.decrypt(
        {
          keyId: 'k1',
          ciphertext: new Uint8Array([1, 2, 3]),
          nonce: new Uint8Array(8),
          authTag: new Uint8Array(16),
        },
        '1:1:scope',
      ),
    AppError,
  );
  assert.throws(
    () =>
      cipher.decrypt(
        {
          keyId: 'k1',
          ciphertext: new Uint8Array([1, 2, 3]),
          nonce: new Uint8Array(12),
          authTag: new Uint8Array(8),
        },
        '1:1:scope',
      ),
    AppError,
  );
});

test('keyring getKey returns a defensive copy', () => {
  const material = randomBytes(32);
  const view = keyringViewFromRecord('k1', { k1: material });
  const copy = view.getKey('k1');
  copy[0] ^= 0xff;
  assert.notEqual(copy[0], view.getKey('k1')[0]);
});

test('constantTimeEqualBytes compares equal-length buffers', () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 4]);
  const c = new Uint8Array([1, 2, 3, 5]);
  assert.equal(constantTimeEqualBytes(a, b), true);
  assert.equal(constantTimeEqualBytes(a, c), false);
  assert.equal(constantTimeEqualBytes(a, new Uint8Array([1, 2])), false);
});

test('create rejects empty fields', async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.create({ name: '  ', scope: 's', plaintext: 'x' }),
    AppError,
  );
  await assert.rejects(
    () => service.create({ name: 'n', scope: '', plaintext: 'x' }),
    AppError,
  );
  await assert.rejects(
    () => service.create({ name: 'n', scope: 's', plaintext: '' }),
    AppError,
  );
});
