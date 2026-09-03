import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../support/process.mjs';

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(e2eRoot, '..');
const expo = resolve(projectRoot, 'node_modules/.bin/expo');
const gradle = resolve(projectRoot, 'android/gradlew');
const apk = resolve(
  projectRoot,
  'android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk',
);
const buildEnvironment = {
  ...process.env,
  VOICE_CHECKLIST_E2E: '1',
};

await run(
  expo,
  ['prebuild', '--platform', 'android', '--clean', '--no-install'],
  { cwd: projectRoot, env: buildEnvironment },
);
await run(
  gradle,
  [
    'assembleDebugOptimized',
    '--no-daemon',
    '-PreactNativeArchitectures=arm64-v8a',
  ],
  { cwd: resolve(projectRoot, 'android'), env: buildEnvironment },
);
await access(apk);
process.stdout.write(`${apk}\n`);
