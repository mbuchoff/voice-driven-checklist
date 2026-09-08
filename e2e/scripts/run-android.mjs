import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForExit } from '../support/process.mjs';
import { androidBuildPlan } from '../support/build.mjs';
import { assertIsolatedApk } from '../support/android.mjs';

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(e2eRoot, '..');
const appium = resolve(e2eRoot, 'node_modules/.bin/appium');
const apk = resolve(
  process.env.E2E_APK ?? androidBuildPlan(projectRoot).apk,
);
const host = process.env.APPIUM_HOST ?? '127.0.0.1';
const port = Number(process.env.APPIUM_PORT ?? 4723);
const runName = new Date().toISOString().replaceAll(':', '-');
const artifactDirectory = resolve(
  process.env.E2E_ARTIFACT_DIR ?? resolve(e2eRoot, 'artifacts', runName),
);

await access(apk);
assertIsolatedApk(apk);
await mkdir(artifactDirectory, { recursive: true });

const serverEnvironment = { ...process.env };
delete serverEnvironment.APPIUM_HOME;
const server = spawn(
  appium,
  [
    '--address',
    host,
    '--port',
    String(port),
  ],
  {
    cwd: e2eRoot,
    env: serverEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = createWriteStream(resolve(artifactDirectory, 'appium.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Appium exited before becoming ready (${server.exitCode}).`);
    }
    try {
      const response = await fetch(`http://${host}:${port}/status`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('Appium did not become ready within 30 seconds.');
}

let testExitCode = 1;
try {
  await waitForServer();
  const test = spawn(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      'tests/your-routines.test.mjs',
    ],
    {
      cwd: e2eRoot,
      env: {
        ...process.env,
        APPIUM_HOST: host,
        APPIUM_PORT: String(port),
        E2E_APK: apk,
        E2E_ARTIFACT_DIR: artifactDirectory,
      },
      stdio: 'inherit',
    },
  );
  await waitForExit(test);
  testExitCode = test.exitCode ?? 1;
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    waitForExit(server),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
  serverLog.end();
}

process.exitCode = testExitCode;
