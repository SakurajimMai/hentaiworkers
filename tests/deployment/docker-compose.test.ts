import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = process.cwd();
const composePaths = ['docker-compose.yml', 'deploy/docker-compose.yml'] as const;
const workflow = readFileSync(join(root, '.github/workflows/docker-publish.yml'), 'utf8');
const dockerIgnore = readFileSync(join(root, '.dockerignore'), 'utf8');
const gitIgnore = readFileSync(join(root, '.gitignore'), 'utf8');

for (const relativePath of composePaths) {
  test(`${relativePath} runs isolated app and crawler worker services`, () => {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const compose = parse(source) as {
      services: Record<string, {
        build?: unknown;
        image?: string;
        pull_policy?: string;
        ports?: string[];
        env_file?: string[];
        environment?: Record<string, string>;
        volumes?: string[];
        read_only?: boolean;
        tmpfs?: string[];
        cap_drop?: string[];
        security_opt?: string[];
        depends_on?: Record<string, { condition?: string }>;
        restart?: string;
      }>;
    };

    assert.deepEqual(Object.keys(compose.services), ['app', 'worker']);
    const app = compose.services.app;
    assert.ok(app);
    assert.equal('build' in app, false);
    assert.equal(app.image, 'sakurajiamai/hentaiworkers-app:latest');
    assert.equal(app.pull_policy, 'always');
    assert.equal(app.volumes, undefined);

    const worker = compose.services.worker;
    assert.ok(worker);
    assert.equal('build' in worker, false);
    assert.equal(worker.image, 'sakurajiamai/hentaiworkers-worker:latest');
    assert.equal(worker.pull_policy, 'always');
    assert.deepEqual(worker.env_file, ['worker.env']);
    assert.equal(
      worker.environment?.CRAWLER_CONTROL_URL,
      'http://app:3000/api/internal/crawler/v1',
    );
    assert.equal(worker.environment?.CRAWLER_TEMP_DIR, '/tmp/crawler-worker');
    assert.equal(worker.read_only, true);
    assert.equal(worker.tmpfs, undefined);
    assert.deepEqual(worker.volumes, [
      './crawler-worker-tmp:/tmp/crawler-worker',
    ]);
    assert.deepEqual(worker.cap_drop, ['ALL']);
    assert.deepEqual(worker.security_opt, ['no-new-privileges:true']);
    assert.equal(worker.depends_on?.app?.condition, 'service_healthy');
    assert.equal(worker.restart, 'unless-stopped');
    assert.equal(worker.ports, undefined);

    assert.doesNotMatch(source, /DATABASE_TLS_CA_FILE|certificates/);
    assert.doesNotMatch(source, /docker\.sock/);
    assert.doesNotMatch(source, /DATABASE_URL|MYSQL_HOST|MYSQL_USER|MYSQL_PASSWORD/);
    assert.doesNotMatch(source, /profiles:/);
  });
}

test('worker Dockerfile is minimal, locked, and non-root', () => {
  const dockerfile = readFileSync(join(root, 'Dockerfile.worker'), 'utf8');
  assert.match(dockerfile, /^FROM python:3\.(?:12|13)(?:\.\d+)?-slim(?:-[a-z]+)?/m);
  assert.match(dockerfile, /COPY requirements-worker\.lock/);
  assert.match(dockerfile, /pip install[^\n]+requirements-worker\.lock/);
  assert.match(dockerfile, /COPY crawler_worker\/? \/app\/crawler_worker\/?/);
  assert.match(dockerfile, /USER crawler(?::crawler)?/);
  assert.match(dockerfile, /CMD \["python", "-u", "-m", "crawler_worker\.main"\]/);
  assert.doesNotMatch(dockerfile, /COPY \. \./);
  assert.doesNotMatch(dockerfile, /node|npm|drizzle|migrations/i);
});

test('Docker Hub workflow publishes app and worker images with isolated caches', () => {
  assert.match(workflow, /APP_IMAGE: sakurajiamai\/hentaiworkers-app/);
  assert.match(workflow, /WORKER_IMAGE: sakurajiamai\/hentaiworkers-worker/);
  assert.match(workflow, /images: \$\{\{ env\.APP_IMAGE \}\}/);
  assert.match(workflow, /images: \$\{\{ env\.WORKER_IMAGE \}\}/);
  assert.match(workflow, /file: \.\/Dockerfile/);
  assert.match(workflow, /file: \.\/Dockerfile\.worker/);
  assert.match(workflow, /cache-from: type=gha,scope=app/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=app/);
  assert.match(workflow, /cache-from: type=gha,scope=worker/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=worker/);
});

test('worker environment examples contain identity only and real files stay ignored', () => {
  for (const relativePath of ['worker.env.example', 'deploy/worker.env.example']) {
    const source = readFileSync(join(root, relativePath), 'utf8');
    assert.match(source, /^CRAWLER_WORKER_ID=/m);
    assert.match(source, /^CRAWLER_WORKER_TOKEN=/m);
    assert.match(source, /^CRAWLER_WORKER_VERSION=/m);
    assert.doesNotMatch(
      source,
      /DATABASE_URL|MYSQL_HOST|MYSQL_USER|MYSQL_PASSWORD|SESSION_SECRET|APP_ENCRYPTION/,
    );
  }
  assert.match(gitIgnore, /^worker\.env$/m);
  assert.match(gitIgnore, /^crawler-worker-tmp\/$/m);
  assert.match(dockerIgnore, /^worker\.env$/m);
  assert.match(dockerIgnore, /^\*\*\/worker\.env$/m);
  assert.match(dockerIgnore, /^crawler-worker-tmp$/m);
  assert.match(dockerIgnore, /^\*\*\/crawler-worker-tmp$/m);
});
