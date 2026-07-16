import assert from 'node:assert/strict';
import test from 'node:test';
import {
  YAML_IMPORT_MAX_BYTES,
  YamlImportService,
} from '../../lib/server/crawler/application/yaml-import-service';
import { AppError } from '../../lib/server/shared/errors';

const service = new YamlImportService();

const minimalValidYaml = `
crawl:
  base_url: https://hanime.example
  date_filter:
    year: [2024]
    month: [1, 2]
  quality_priority: ["1080", "720"]
  skip_keywords: ["PV"]
download:
  max_concurrent: 3
  organize_by_date: true
  download_dir: /data/anime
web_access:
  domain_prefix: https://cdn.example.com
  base_path: media/
network:
  proxy:
    http: http://user:secretpass@proxy:8080
selenium:
  no_sandbox: false
performance:
  max_concurrent_downloads: 3
`;

test('preview maps production_config.yml fields into buckets', () => {
  const preview = service.preview(minimalValidYaml, { nodeEnv: 'development' });

  assert.ok(preview.mapped.some((i) => i.path === 'crawl.base_url'));
  assert.ok(preview.mapped.some((i) => i.path === 'crawl.date_filter.year'));
  assert.ok(preview.converted.some((i) => i.path === 'download.max_concurrent'));
  assert.ok(preview.converted.some((i) => i.path === 'download.organize_by_date'));
  assert.ok(preview.converted.some((i) => i.path === 'download.download_dir'));
  assert.ok(preview.converted.some((i) => i.path === 'web_access.domain_prefix'));
  assert.ok(preview.converted.some((i) => i.path === 'web_access.base_path'));

  assert.ok(preview.profileConfig);
  assert.equal(preview.profileConfig?.source.baseUrl, 'https://hanime.example');
  assert.deepEqual(preview.profileConfig?.dateFilter.years, [2024]);
  assert.equal(preview.profileConfig?.concurrency.download, 3);

  assert.equal(preview.storageHints.requiresManualDriverFields, true);
  assert.equal(preview.storageHints.publicBaseUrl, 'https://cdn.example.com');
  assert.equal(preview.storageHints.prefix, 'media/');
  assert.equal(preview.storageHints.organizeByDate, true);

  assert.equal(preview.invalid.length, 0);
  service.assertImportAllowed(preview);
});

test('database and d1_sync are deprecated and never mapped into profile', () => {
  const yaml = `
${minimalValidYaml}
database:
  host: db.internal
  password: root
d1_sync:
  account_id: abc
logging:
  file: /var/log/crawler.log
`;
  const preview = service.preview(yaml, { nodeEnv: 'development' });
  assert.ok(preview.deprecated.some((i) => i.path === 'database'));
  assert.ok(preview.deprecated.some((i) => i.path === 'd1_sync'));
  assert.ok(preview.deprecated.some((i) => i.path === 'logging.file'));
  assert.ok(preview.profileConfig);
  assert.equal(
    JSON.stringify(preview.profileConfig).includes('db.internal'),
    false,
  );
});

test('conflicting concurrency fields emit warning and prefer download.max_concurrent', () => {
  const yaml = `
crawl:
  base_url: https://hanime.example
  date_filter:
    year: 2024
    month: 6
  quality_priority: ["1080"]
download:
  max_concurrent: 2
performance:
  max_concurrent_downloads: 8
`;
  const preview = service.preview(yaml, { nodeEnv: 'development' });
  assert.ok(
    preview.warnings.some((i) =>
      i.path.includes('max_concurrent') && i.message.includes('download.max_concurrent'),
    ),
  );
  assert.equal(preview.profileConfig?.concurrency.download, 2);
});

test('organize_by_date converts to storage path hint', () => {
  const yaml = `
crawl:
  base_url: https://hanime.example
  date_filter:
    year: [2023]
    month: [12]
  quality_priority: ["720"]
download:
  organize_by_date: false
`;
  const preview = service.preview(yaml, { nodeEnv: 'test' });
  assert.ok(preview.converted.some((i) => i.path === 'download.organize_by_date'));
  assert.equal(preview.storageHints.organizeByDate, false);
});

test('proxy secrets appear masked only (no plaintext in preview DTO)', () => {
  const preview = service.preview(minimalValidYaml, { nodeEnv: 'development' });
  assert.ok(preview.secrets.length >= 1);
  const proxy = preview.secrets.find((s) => s.path === 'network.proxy.http');
  assert.ok(proxy);
  assert.ok(proxy.masked.includes('•'));
  assert.equal('plaintext' in proxy, false);
  assert.equal(JSON.stringify(preview.secrets).includes('secretpass'), false);
});

test('no_sandbox true is hard-rejected in production', () => {
  const yaml = `
crawl:
  base_url: https://hanime.example
  date_filter:
    year: [2024]
    month: [1]
  quality_priority: ["1080"]
selenium:
  no_sandbox: true
`;
  const prod = service.preview(yaml, { nodeEnv: 'production' });
  assert.ok(prod.invalid.some((i) => i.path === 'selenium.no_sandbox'));
  assert.throws(() => service.assertImportAllowed(prod), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'RESULT_INVALID');
    return true;
  });

  const dev = service.preview(yaml, { nodeEnv: 'development' });
  assert.ok(dev.warnings.some((i) => i.path === 'selenium.no_sandbox'));
  assert.equal(dev.invalid.filter((i) => i.path === 'selenium.no_sandbox').length, 0);
});

test('YAML over 1 MiB is rejected', () => {
  const padding = 'x'.repeat(YAML_IMPORT_MAX_BYTES);
  const huge = `crawl:\n  note: "${padding}"\n`;
  assert.throws(() => service.preview(huge), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.match(error.message, /1 MiB/);
    return true;
  });
});

test('YAML deeper than 20 levels is rejected', () => {
  let nested = 'leaf: 1';
  for (let i = 0; i < 22; i++) {
    nested = `l${i}:\n  ${nested.split('\n').join('\n  ')}`;
  }
  assert.throws(() => service.preview(nested), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.match(error.message, /嵌套/);
    return true;
  });
});

test('invalid YAML syntax fails with RESULT_INVALID', () => {
  assert.throws(() => service.preview('crawl: [\n  - unclosed'), AppError);
});

test('missing base_url and date filters are reported', () => {
  const preview = service.preview('crawl: {}\n', { nodeEnv: 'development' });
  assert.ok(preview.missing.some((i) => i.path === 'crawl.base_url'));
  assert.ok(preview.missing.some((i) => i.path === 'crawl.date_filter.year'));
  assert.ok(preview.missing.some((i) => i.path === 'crawl.date_filter.month'));
  assert.equal(preview.profileConfig, null);
});
