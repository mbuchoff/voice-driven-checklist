const { readFileSync } = require('node:fs');
const { describe, expect, it } = require('@jest/globals');

const workflow = readFileSync(
  require.resolve('./android-release.yml'),
  'utf8',
);

describe('Android release workflow', () => {
  it('uses Node.js 24 action runtimes', () => {
    expect(workflow).toContain('uses: actions/checkout@v6');
    expect(workflow).toContain('uses: actions/setup-node@v6');
    expect(workflow).toContain('uses: actions/setup-java@v5');
    expect(workflow).toContain('uses: actions/upload-artifact@v6');
  });

  it('uploads completed releases to the Play internal track', () => {
    expect(workflow).toMatch(/^          tracks: internal$/m);
    expect(workflow).toMatch(/^          status: completed$/m);
  });
});
