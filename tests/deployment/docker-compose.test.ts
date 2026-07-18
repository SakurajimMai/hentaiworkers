import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = process.cwd();
const composePaths = ['docker-compose.yml', 'deploy/docker-compose.yml'] as const;
const workflow = readFileSync(join(root, '.github/workflows/docker-publish.yml'), 'utf8');

for (const relativePath of composePaths) {
  test(`${relativePath} is Docker Hub app-only`, () => {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const compose = parse(source) as {
      services: Record<string, {
        build?: unknown;
        image?: string;
        pull_policy?: string;
        volumes?: string[];
      }>;
    };

    assert.deepEqual(Object.keys(compose.services), ['app']);
    const app = compose.services.app;
    assert.ok(app);
    assert.equal('build' in app, false);
    assert.match(app.image ?? '', /^\$\{DOCKERHUB_USERNAME:\?/);
    assert.match(app.image ?? '', /hentaiworkers-app/);
    assert.equal(app.pull_policy, 'always');
    assert.ok(app.volumes?.includes('./certificates:/app/certificates:ro'));
    assert.doesNotMatch(source, /hentaiworkers-(?:ops|worker)/);
    assert.doesNotMatch(source, /profiles:/);
  });
}

test('Docker Hub workflow publishes only the app image', () => {
  assert.match(workflow, /APP_IMAGE:.*hentaiworkers-app/);
  assert.match(workflow, /file: \.\/Dockerfile/);
  assert.doesNotMatch(workflow, /hentaiworkers-(?:ops|worker)/);
  assert.doesNotMatch(workflow, /Dockerfile\.(?:ops|worker)/);
});
