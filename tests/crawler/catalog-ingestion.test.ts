import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { CrawlerJobService } from '../../lib/server/crawler/application/crawler-job-service';
import { CrawlerResultService } from '../../lib/server/crawler/application/crawler-result-service';
import type {
  CatalogIngestionInput,
  CatalogIngestionPort,
} from '../../lib/server/crawler/ports/catalog-ingestion-port';
import { InMemoryCrawlerUnitOfWork } from '../../lib/server/crawler/testing/in-memory-crawler-uow';
import { createTestWorkerApi } from '../../lib/server/crawler/testing/create-test-worker-api';
import { LEASE_TOKEN_HEADER } from '../../lib/server/crawler/interfaces/worker-auth';

class FakeCatalogIngestion implements CatalogIngestionPort {
  readonly calls: CatalogIngestionInput[] = [];
  async upsertFromCrawler(input: CatalogIngestionInput) {
    this.calls.push(input);
    return {
      animeId: 73,
      created: this.calls.length === 1,
      target: 'legacy_animes' as const,
    };
  }
}

async function runningJob() {
  const uow = new InMemoryCrawlerUnitOfWork();
  const jobs = new CrawlerJobService(uow);
  await jobs.enqueueManual({ profileId: 1, profileVersionId: 1, configSnapshotJson: '{}' });
  const claimed = await jobs.claimForWorker({ workerId: 1 });
  assert.ok(claimed);
  const binding = {
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId: 1,
    leaseToken: claimed.leaseToken,
  };
  await jobs.start(binding);
  return { uow, binding };
}

test('successful crawler item upserts catalog metadata and links anime id', async () => {
  const { uow, binding } = await runningJob();
  const catalog = new FakeCatalogIngestion();
  const service = new CrawlerResultService(uow, catalog);

  const result = await service.commitItem({
    ...binding,
    idempotencyKey: 'hanime:42',
    source: 'hanime',
    sourceId: '42',
    status: 'succeeded',
    title: 'Example title',
    videoUrl: 'https://media.example/video.m3u8',
    coverUrl: 'https://media.example/cover.jpg',
    fanartUrls: ['https://media.example/1.jpg'],
    description: 'Plot',
    tags: ['tag-a', 'tag-b'],
    releaseYear: 2026,
    releaseDate: '2026-07-14',
  });

  assert.equal(catalog.calls.length, 1);
  assert.equal(catalog.calls[0].sourceId, '42');
  assert.equal(catalog.calls[0].coverUrl, 'https://media.example/cover.jpg');
  assert.equal(result.item.animeId, 73);
  assert.equal(result.catalog?.created, true);
});

test('local cover route is stored as an absolute SITE_URL cover', async () => {
  const { uow, binding } = await runningJob();
  const catalog = new FakeCatalogIngestion();
  const service = new CrawlerResultService(uow, catalog, {
    siteUrl: 'https://anime.example',
  });
  const localCover = `/api/media/covers/ikun/${'b'.repeat(64)}.webp`;

  await service.commitItem({
    ...binding,
    idempotencyKey: 'ikun:local-cover',
    source: 'ikun',
    sourceId: '77',
    status: 'succeeded',
    title: 'Local cover title',
    videoUrl: 'https://media.example/77.m3u8',
    coverUrl: localCover,
  });

  assert.equal(catalog.calls[0].coverUrl, `https://anime.example${localCover}`);
});

test('failed and skipped items do not write catalog', async () => {
  const { uow, binding } = await runningJob();
  const catalog = new FakeCatalogIngestion();
  const service = new CrawlerResultService(uow, catalog);

  await service.commitItem({
    ...binding,
    idempotencyKey: 'hanime:failed',
    source: 'hanime',
    sourceId: 'failed',
    status: 'failed',
    errorCode: 'SOURCE_UNAVAILABLE',
  });

  assert.equal(catalog.calls.length, 0);
});

test('worker API commits normalized metadata through catalog ingestion and returns anime id', async () => {
  const catalog = new FakeCatalogIngestion();
  const api = createTestWorkerApi({ catalog });
  const { token, workerId } = await api.provisionWorker();
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const request = (url: string, body: unknown, lease?: string) => new NextRequest(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(lease ? { [LEASE_TOKEN_HEADER]: lease } : {}),
    },
    body: JSON.stringify(body),
  });
  const claimResponse = await api.handlers.claim(request('http://local/jobs/claim', {}));
  const claim = (await claimResponse.json()).data as {
    jobId: number;
    attemptId: number;
    leaseToken: string;
  };
  await api.handlers.start(
    request('http://local/jobs/1/start', { attemptId: claim.attemptId }, claim.leaseToken),
    { id: String(claim.jobId) },
  );
  const response = await api.handlers.itemsCommit(
    request('http://local/jobs/1/items/commit', {
      attemptId: claim.attemptId,
      idempotencyKey: 'api-item-42',
      source: 'hanime',
      sourceId: '42',
      status: 'succeeded',
      title: 'API title',
      videoUrl: 'https://cdn.example/42.m3u8',
      tags: ['Drama'],
    }, claim.leaseToken),
    { id: String(claim.jobId) },
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()).data as { animeId: number; created: boolean };
  assert.equal(payload.animeId, 73);
  assert.equal(payload.created, true);
  assert.equal(catalog.calls[0].title, 'API title');
  assert.equal(workerId, 1);
});

test('successful item requires title and absolute http video URL', async () => {
  const { uow, binding } = await runningJob();
  const service = new CrawlerResultService(uow, new FakeCatalogIngestion());

  await assert.rejects(
    () => service.commitItem({
      ...binding,
      idempotencyKey: 'hanime:invalid',
      source: 'hanime',
      sourceId: 'invalid',
      status: 'succeeded',
      title: '',
      videoUrl: 'javascript:alert(1)',
    }),
    /标题与 HTTP\(S\) 视频地址必填/,
  );
});
