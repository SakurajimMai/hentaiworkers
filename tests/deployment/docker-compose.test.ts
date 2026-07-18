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
        volumes?: string[];
      }>;
    };

    const app = compose.services.app;
    const ops = compose.services.ops;
    const worker = compose.services['crawler-worker'];

    assert.ok(app);
    assert.ok(ops);
    assert.ok(worker);
    for (const service of [app, ops, worker]) {
      assert.equal('build' in service, false);
      assert.match(service.image ?? '', /^\$\{DOCKERHUB_USERNAME:\?/);
      assert.equal(service.pull_policy, 'always');
    }
    assert.match(ops.image ?? '', /hentaiworkers-ops/);
    assert.ok(app.volumes?.includes('./certificates:/app/certificates:ro'));
    assert.ok(ops.volumes?.includes('./certificates:/ops/certificates:ro'));
    assert.deepEqual(ops.profiles, ['ops']);
    assert.deepEqual(worker.profiles, ['worker']);
  });
}
