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
        environment: { name: string };
        steps: Array<{ name?: string; env?: Record<string, string> }>;
      };
      release: {
        if: string;
        steps: Array<{
          name?: string;
          uses?: string;
          run?: string;
          with?: Record<string, string | boolean>;
        }>;
      };
    };
  };
  const qualityStep = parsedWorkflow.jobs.build.steps.find(
    (step) => step.name === 'Format, lint, test and assemble',
  );
  const releasePreflight = parsedWorkflow.jobs.release.steps.find(
    (step) => step.name === 'Validate release assets',
  );
  const downloadStep = parsedWorkflow.jobs.release.steps.find(
    (step) => step.name === 'Download APK artifact',
  );
  const releaseStep = parsedWorkflow.jobs.release.steps.find(
    (step) => step.name === 'Create GitHub Release',
  );

  assert.match(workflow, /name: Build Android APK/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /publish_release:/);
  assert.match(workflow, /type: boolean/);
  assert.match(
    parsedWorkflow.jobs.build.environment.name,
    /github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(parsedWorkflow.jobs.build.environment.name, /Production/);
  assert.match(parsedWorkflow.jobs.build.environment.name, /CI/);
  assert.doesNotMatch(parsedWorkflow.jobs.build.environment.name, /workflow_dispatch/);
  assert.match(workflow, /working-directory: mobile\/android/);
  assert.match(workflow, /ktlintCheck lintRelease testDebugUnitTest assembleRelease/);
  assert.match(workflow, /versionCode='\$\{GITHUB_RUN_NUMBER\}'/);
  assert.match(workflow, /de\.ixacg\.animestream\.MainActivity/);
  assert.match(workflow, /output-metadata\.json/);
  assert.match(
    workflow,
    /expected_variants = \["arm64-v8a", "armeabi-v7a", "x86_64", "x86", "universal"\]/,
  );
  assert.match(workflow, /target_abis=\(arm64-v8a armeabi-v7a x86_64 x86\)/);
  assert.match(workflow, /Expected APK variants/);
  assert.match(workflow, /native-code: '\$\{variant\}'/);
  assert.match(workflow, /Universal APK contains an unexpected ABI/);
  assert.match(
    workflow,
    /sed -n 's\/\^\.\*certificate SHA-256 digest: \/\/p'/,
  );
  assert.match(workflow, /unique_hash_count/);
  assert.match(workflow, /test "\$artifact_count" -eq 5/);
  assert.match(workflow, /SHA256SUMS/);
  assert.match(workflow, /most modern Android phones \(recommended\)/);
  assert.match(workflow, /contains all four supported ABIs/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /tag_name: build-\$\{\{ github\.run_number \}\}/);
  assert.match(workflow, /ANIMESTREAM_API_BASE_URL: https:\/\/www\.ixacg\.de/);
  assert.match(workflow, /Android signing secrets are only partially configured/);
  assert.match(workflow, /keytool -list/);
  assert.match(workflow, /ANDROID_RELEASE_CERT_SHA256/);
  assert.match(workflow, /Release APK certificate does not match/);
  assert.match(workflow, /Builds 39 and earlier used an Expo debug certificate/);
  assert.match(workflow, /needs\.build\.outputs\.signing_mode == 'release'/);
  assert.deepEqual(qualityStep?.env, {
    ANDROID_KEYSTORE_PASSWORD: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
    ANDROID_KEY_ALIAS: '${{ secrets.ANDROID_KEY_ALIAS }}',
    ANDROID_KEY_PASSWORD: '${{ secrets.ANDROID_KEY_PASSWORD }}',
  });
  assert.match(parsedWorkflow.jobs.release.if, /github\.ref == 'refs\/heads\/main'/);
  assert.match(parsedWorkflow.jobs.release.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(parsedWorkflow.jobs.release.if, /inputs\.publish_release/);
  assert.match(parsedWorkflow.jobs.release.if, /needs\.build\.outputs\.signing_mode == 'release'/);
  assert.equal(downloadStep?.with?.name, 'AnimeStream-apk-${{ github.run_number }}');
  assert.equal(downloadStep?.with?.path, 'mobile/artifacts');
  assert.match(releasePreflight?.run ?? '', /variants=\(arm64-v8a armeabi-v7a x86_64 x86 universal\)/);
  assert.match(releasePreflight?.run ?? '', /sha256sum -c SHA256SUMS/);
  assert.match(releasePreflight?.run ?? '', /test "\$artifact_count" -eq 5/);
  assert.equal(releaseStep?.uses, 'softprops/action-gh-release@v3');
  assert.match(String(releaseStep?.with?.files), /mobile\/artifacts\/AnimeStream-\*\.apk/);
  assert.match(String(releaseStep?.with?.files), /mobile\/artifacts\/SHA256SUMS/);
  assert.equal(releaseStep?.with?.fail_on_unmatched_files, true);
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
  assert.match(
    appGradle,
    /splits\s*\{\s*abi\s*\{\s*isEnable = true\s*reset\(\)\s*include\(\s*"arm64-v8a",\s*"armeabi-v7a",\s*"x86_64",\s*"x86",\s*\)\s*isUniversalApk = true/,
  );
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

test('trusted workflows retain only the latest five repository Actions runs', () => {
  const workflows = [
    {
      path: '.github/workflows/build-android.yml',
      needs: ['build', 'release'],
    },
    {
      path: '.github/workflows/docker-publish.yml',
      needs: 'publish',
    },
  ] as const;
  const cleanupScripts: string[] = [];

  for (const workflow of workflows) {
    const source = readFileSync(join(root, workflow.path), 'utf8');
    const parsed = parse(source) as {
      jobs: {
        cleanup: {
          name: string;
          needs: string | string[];
          if: string;
          permissions: Record<string, string>;
          concurrency: {
            group: string;
            'cancel-in-progress': boolean;
          };
          steps: Array<{
            name?: string;
            uses?: string;
            with?: { script?: string };
          }>;
        };
      };
    };
    const cleanup = parsed.jobs.cleanup;
    const cleanupStep = cleanup.steps.find(
      (step) => step.name === 'Delete older completed runs',
    );
    const script = cleanupStep?.with?.script ?? '';

    assert.equal(cleanup.name, 'Retain latest five Actions runs');
    assert.deepEqual(cleanup.needs, workflow.needs);
    assert.match(cleanup.if, /always\(\)/);
    assert.match(cleanup.if, /github\.event_name != 'pull_request'/);
    assert.deepEqual(cleanup.permissions, { actions: 'write' });
    assert.equal(cleanup.concurrency.group, 'repository-actions-retention');
    assert.equal(cleanup.concurrency['cancel-in-progress'], false);
    assert.equal(cleanupStep?.uses, 'actions/github-script@v9');
    assert.match(script, /const retainedRunCount = 5/);
    assert.match(script, /github\.paginate\(/);
    assert.match(script, /actions\.listWorkflowRunsForRepo/);
    assert.match(script, /per_page: 100/);
    assert.doesNotMatch(script, /response\.data\.workflow_runs/);
    assert.match(script, /runs\.sort\(/);
    assert.match(script, /created_at/);
    assert.match(script, /right\.id - left\.id/);
    assert.match(script, /slice\(0, retainedRunCount\)/);
    assert.match(script, /run\.status === 'completed'/);
    assert.match(script, /context\.runId/);
    assert.match(script, /actions\.deleteWorkflowRun/);
    assert.match(script, /run_id: run\.id/);
    assert.match(script, /error\?\.status === 404/);
    assert.match(script, /throw error/);
    assert.doesNotMatch(script, /workflow_id:/);
    assert.doesNotMatch(script, /actions\.listWorkflowRuns\s*\(/);
    cleanupScripts.push(script);
  }

  assert.equal(cleanupScripts[0], cleanupScripts[1]);
});

test('deployment files keep secrets outside the image', () => {
  const dockerIgnore = readFileSync(join(root, '.dockerignore'), 'utf8');
  const gitIgnore = readFileSync(join(root, '.gitignore'), 'utf8');

  assert.match(dockerIgnore, /^\.env$/m);
  assert.match(dockerIgnore, /^\.env\.\*$/m);
  assert.match(gitIgnore, /^\.env\*$/m);
  assert.match(gitIgnore, /^!\.env\.example$/m);
});
