import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = process.cwd();
const composePaths = ['docker-compose.yml', 'deploy/docker-compose.yml'] as const;

for (const relativePath of composePaths) {
  test(`${relativePath} is Docker Hub pull-only`, () => {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const compose = parse(source) as {
      services: Record<string, {
        build?: unknown;
        image?: string;
        pull_policy?: string;
        profiles?: string[];
      }>;
    };

    const app = compose.services.app;
    const worker = compose.services['crawler-worker'];

    assert.ok(app);
    assert.ok(worker);
    assert.equal('build' in app, false);
    assert.equal('build' in worker, false);
    assert.match(app.image ?? '', /^\$\{DOCKERHUB_USERNAME:\?/);
    assert.match(worker.image ?? '', /^\$\{DOCKERHUB_USERNAME:\?/);
    assert.equal(app.pull_policy, 'always');
    assert.equal(worker.pull_policy, 'always');
    assert.deepEqual(worker.profiles, ['worker']);
  });
}
