import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerConfigService } from '../../lib/server/crawler/application/crawler-config-service';
import { StorageConfigService } from '../../lib/server/crawler/application/storage-config-service';
import {
  parseStorageConfig,
  type CrawlerProfileConfig,
  type StorageConfig,
} from '../../lib/server/crawler/domain/config';
import {
  InMemoryCrawlerConfigRepository,
  InMemoryStorageConfigRepository,
} from '../../lib/server/crawler/testing/in-memory-config-repos';
import { AppError } from '../../lib/server/shared/errors';

const sampleProfile = (): CrawlerProfileConfig => ({
  schemaVersion: 1,
  source: { baseUrl: 'https://hanime.example' },
  dateFilter: { years: [2024], months: [1, 2] },
  qualityPriority: ['1080', '720'],
  skipKeywords: ['preview'],
  concurrency: { download: 2, parse: 2 },
  continueOnError: true,
  maxActiveJobs: 1,
});

const sampleS3 = (): StorageConfig =>
  parseStorageConfig({
    driver: 's3',
    endpoint: 'https://s3.example.com',
    region: 'us-east-1',
    bucket: 'anime-media',
    prefix: 'prod/',
    deliveryMode: 'public',
    publicBaseUrl: 'https://cdn.example.com',
    forcePathStyle: true,
    organizeByDate: true,
  });

const sampleSftp = (): StorageConfig =>
  parseStorageConfig({
    driver: 'sftp',
    host: 'sftp.example.com',
    port: 22,
    username: 'deploy',
    rootPath: '/var/media',
    hostKeyFingerprint: 'sha256:abcdefghijklmnopqrstuvwxyz',
    publicBaseUrl: 'https://media.example.com',
    organizeByDate: false,
  });

test('crawler profile versions are immutable snapshots', async () => {
  const repo = new InMemoryCrawlerConfigRepository();
  const service = new CrawlerConfigService(repo);

  const v1 = await service.createProfile('default', sampleProfile());
  assert.equal(v1.version, 1);
  assert.equal(v1.config.source.baseUrl, 'https://hanime.example');

  const v2 = await service.updateProfile(v1.profileId, {
    ...sampleProfile(),
    concurrency: { download: 4, parse: 3 },
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.config.concurrency.download, 4);

  // original version unchanged
  const stillV1 = await service.getVersion(v1.id);
  assert.ok(stillV1);
  assert.equal(stillV1.config.concurrency.download, 2);

  const versions = await service.listVersions(v1.profileId);
  assert.equal(versions.length, 2);

  await assert.rejects(
    () => service.overwriteVersionForbidden(v1.id, sampleProfile()),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      assert.equal(error.status, 409);
      return true;
    },
  );
});

test('crawler profile rejects invalid config via Zod', async () => {
  const service = new CrawlerConfigService(new InMemoryCrawlerConfigRepository());
  await assert.rejects(
    () =>
      service.createProfile('bad', {
        schemaVersion: 1,
        source: { baseUrl: 'not-a-url' },
        dateFilter: { years: [], months: [1] },
        qualityPriority: [],
      }),
  );
});

test('storage config accepts S3 and SFTP discriminated unions', () => {
  const s3 = sampleS3();
  assert.equal(s3.driver, 's3');
  if (s3.driver === 's3') {
    assert.equal(s3.bucket, 'anime-media');
    assert.equal(s3.forcePathStyle, true);
    assert.equal(s3.organizeByDate, true);
  }

  const sftp = sampleSftp();
  assert.equal(sftp.driver, 'sftp');
  if (sftp.driver === 'sftp') {
    assert.equal(sftp.host, 'sftp.example.com');
    assert.equal(sftp.organizeByDate, false);
    assert.ok(sftp.hostKeyFingerprint.length >= 16);
  }
});

test('storage activate requires storageTestPassed', async () => {
  const repo = new InMemoryStorageConfigRepository();
  const service = new StorageConfigService(repo);

  const draft = await service.createDraft('prod-s3', sampleS3());
  assert.equal(draft.storageTestPassed, false);

  await assert.rejects(() => service.activate(draft.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'RESULT_CONFLICT');
    assert.match(error.message, /storage_test/);
    return true;
  });
  assert.equal(repo.isActivated(draft.id), false);

  await service.markStorageTestPassed(draft.id);
  const afterTest = await service.getVersion(draft.id);
  assert.ok(afterTest?.storageTestPassed);

  await service.activate(draft.id);
  assert.equal(repo.isActivated(draft.id), true);
});

test('storage append creates new immutable version', async () => {
  const service = new StorageConfigService(new InMemoryStorageConfigRepository());
  const v1 = await service.createDraft('edge', sampleS3());
  const v2 = await service.appendDraft(v1.profileId, {
    ...sampleS3(),
    prefix: 'staging/',
  });
  assert.equal(v2.version, 2);
  assert.notEqual(v1.id, v2.id);

  const stillV1 = await service.getVersion(v1.id);
  assert.ok(stillV1);
  if (stillV1.config.driver === 's3') {
    assert.equal(stillV1.config.prefix, 'prod/');
  }
});

test('storage rejects unknown driver', () => {
  assert.throws(() =>
    parseStorageConfig({
      driver: 'local',
      path: '/tmp',
    }),
  );
});
