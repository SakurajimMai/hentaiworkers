import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = process.cwd();

for (const relativePath of ['docker-compose.yml', 'deploy/docker-compose.yml']) {
  test(`${relativePath} deploys only the application`, () => {
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
        depends_on?: unknown;
        restart?: string;
        healthcheck?: { test?: string[] };
      }>;
    };

    assert.deepEqual(Object.keys(compose.services), ['app']);
    const app = compose.services.app;
    assert.equal('build' in app, false);
    assert.equal(app.image, 'sakurajiamai/hentaiworkers-app:${IMAGE_TAG:-manga}');
    assert.equal(app.pull_policy, '${PULL_POLICY:-never}');
    assert.deepEqual(app.ports, ['${APP_HOST_BIND:-127.0.0.1}:${APP_PORT:-3000}:3000']);
    assert.deepEqual(app.env_file, ['.env']);
    assert.equal(app.environment?.NODE_ENV, 'production');
    assert.equal(app.environment?.PORT, '3000');
    assert.equal(app.environment?.HOSTNAME, '0.0.0.0');
    assert.equal(app.volumes, undefined);
    assert.equal(app.depends_on, undefined);
    assert.equal(app.restart, 'unless-stopped');
    assert.match(app.healthcheck?.test?.join(' ') ?? '', /\/api\/live/);

    assert.doesNotMatch(source, /docker\.sock/);
    assert.doesNotMatch(source, /MYSQL_(?:HOST|USER|PASSWORD)\s*[:=]/);
  });
}

test('Android APK workflow builds mobile and publishes a GitHub Release', () => {
  const workflow = readFileSync(join(root, '.github/workflows/build-android.yml'), 'utf8');
  assert.match(workflow, /name: Build Android APK/);
  assert.match(workflow, /working-directory: mobile/);
  assert.match(workflow, /npx expo prebuild --platform android/);
  assert.match(workflow, /\.\/gradlew assembleRelease/);
  assert.match(workflow, /tag_name: build-\$\{\{ github\.run_number \}\}/);
  assert.match(workflow, /EXPO_PUBLIC_API_BASE_URL: https:\/\/www\.ixacg\.de/);
});

test('Docker Hub workflow publishes only the application image', () => {
  const workflow = readFileSync(join(root, '.github/workflows/docker-publish.yml'), 'utf8');

  assert.match(workflow, /APP_IMAGE: sakurajiamai\/hentaiworkers-app/);
  assert.match(workflow, /images: \$\{\{ env\.APP_IMAGE \}\}/);
  assert.match(workflow, /context: \./);
  assert.match(workflow, /file: \.\/Dockerfile/);
  assert.match(workflow, /cache-from: type=gha,scope=app/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=app/);
  assert.doesNotMatch(workflow, /WORKER_IMAGE|crawler\/Dockerfile|scope=worker/);
});

test('deployment files keep secrets outside the image', () => {
  const dockerIgnore = readFileSync(join(root, '.dockerignore'), 'utf8');
  const gitIgnore = readFileSync(join(root, '.gitignore'), 'utf8');

  assert.match(dockerIgnore, /^\.env$/m);
  assert.match(dockerIgnore, /^\.env\.\*$/m);
  assert.match(gitIgnore, /^\.env\*$/m);
  assert.match(gitIgnore, /^!\.env\.example$/m);
});
