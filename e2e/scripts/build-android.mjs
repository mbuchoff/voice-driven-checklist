import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { androidBuildPlan } from '../support/build.mjs';
import { run } from '../support/process.mjs';

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(e2eRoot, '..');
const expo = resolve(projectRoot, 'node_modules/.bin/expo');
const build = androidBuildPlan(projectRoot);
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
  build.gradle,
  build.args,
  { cwd: build.cwd, env: buildEnvironment },
);
await access(build.apk);
process.stdout.write(`${build.apk}\n`);
