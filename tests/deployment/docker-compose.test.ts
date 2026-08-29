import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  const parsedWorkflow = parse(workflow) as {
    jobs: {
      build: {
        steps: Array<{ name?: string; env?: Record<string, string> }>;
      };
    };
  };
  const qualityStep = parsedWorkflow.jobs.build.steps.find(
    (step) => step.name === 'Format, lint, test and assemble',
  );

  assert.match(workflow, /name: Build Android APK/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /working-directory: mobile\/android/);
  assert.match(workflow, /ktlintCheck lintRelease testDebugUnitTest assembleRelease/);
  assert.match(workflow, /versionCode='\$\{GITHUB_RUN_NUMBER\}'/);
  assert.match(workflow, /de\.ixacg\.animestream\.MainActivity/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /tag_name: build-\$\{\{ github\.run_number \}\}/);
  assert.match(workflow, /ANIMESTREAM_API_BASE_URL: https:\/\/www\.ixacg\.de/);
  assert.match(workflow, /Android signing secrets are only partially configured/);
  assert.match(workflow, /needs\.build\.outputs\.signing_mode == 'release'/);
  assert.deepEqual(qualityStep?.env, {
    ANDROID_KEYSTORE_PASSWORD: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
    ANDROID_KEY_ALIAS: '${{ secrets.ANDROID_KEY_ALIAS }}',
    ANDROID_KEY_PASSWORD: '${{ secrets.ANDROID_KEY_PASSWORD }}',
  });
  assert.doesNotMatch(workflow, /setup-node|npm ci|expo prebuild|EXPO_PUBLIC/);
});

test('mobile is a native Kotlin application without a JavaScript runtime', () => {
  const appGradle = readFileSync(join(root, 'mobile/android/app/build.gradle.kts'), 'utf8');
  const versions = readFileSync(join(root, 'mobile/android/gradle/libs.versions.toml'), 'utf8');
  const manifest = readFileSync(join(root, 'mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
  const navigation = readFileSync(
    join(
      root,
      'mobile/android/app/src/main/java/de/ixacg/animestream/ui/navigation/AnimeStreamApp.kt',
    ),
    'utf8',
  );
  const roomSchema = JSON.parse(
    readFileSync(
      join(
        root,
        'mobile/android/app/schemas/de.ixacg.animestream.core.database.LibraryDatabase/1.json',
      ),
      'utf8',
    ),
  ) as { database: { version: number } };
  const notices = readFileSync(join(root, 'mobile/android/app/src/main/assets/THIRD_PARTY_NOTICES.md'), 'utf8');
  const apache = readFileSync(join(root, 'mobile/android/app/src/main/assets/licenses/Apache-2.0.txt'), 'utf8');

  assert.match(appGradle, /applicationId = "de\.ixacg\.animestream"/);
  assert.match(appGradle, /implementation\(libs\.media3\.exoplayer\.hls\)/);
  assert.match(appGradle, /implementation\(libs\.telephoto\.zoomable\.image\.coil\)/);
  assert.match(appGradle, /alias\(libs\.plugins\.room\)/);
  assert.match(appGradle, /room\s*\{\s*schemaDirectory\("\$projectDir\/schemas"\)/);
  assert.doesNotMatch(appGradle, /arg\("room\.schemaLocation"/);
  assert.match(versions, /telephoto = "0\.16\.0"/);
  assert.match(manifest, /android:name="\.MainActivity"/);
  assert.match(manifest, /android:scheme="animestream"/);
  assert.match(navigation, /animestream:\/\/detail\/\{animeId\}/);
  assert.match(navigation, /animestream:\/\/player\/\{animeId\}/);
  assert.match(navigation, /animestream:\/\/manga-detail\/\{mangaId\}/);
  assert.match(navigation, /animestream:\/\/manga-reader\/\{mangaId\}\/\{chapter\}/);
  assert.equal(roomSchema.database.version, 1);
  assert.match(notices, /assets\/licenses\/Apache-2\.0\.txt/);
  assert.match(apache, /Apache License\s+Version 2\.0, January 2004/);
  assert.equal(existsSync(join(root, 'mobile/package.json')), false);
  assert.equal(existsSync(join(root, 'mobile/App.tsx')), false);
  assert.doesNotMatch(appGradle, /react-native|expo|hermes|metro/i);
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
