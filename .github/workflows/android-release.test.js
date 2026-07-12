const { readFileSync } = require('node:fs');
const { describe, expect, it } = require('@jest/globals');

const workflow = readFileSync(
  require.resolve('./android-release.yml'),
  'utf8',
);

describe('Android release workflow', () => {
  it('allows release validation from the WIP branch', () => {
    expect(workflow).toContain('branches: [main, wip/android-play-ci]');
  });

  it('keeps pending releases in the concurrency queue', () => {
    const concurrency = workflow.match(/^concurrency:\n((?: {2}.+\n?)*)/m)?.[1];

    expect(concurrency).toContain('  queue: max');
  });

  it('limits the workflow token to repository reads', () => {
    const permissions = workflow.match(/^permissions:\n((?: {2}.+\n?)*)/m)?.[1];

    expect(permissions).toBe('  contents: read\n');
  });

  it('pins third-party actions to immutable commits', () => {
    const thirdPartyActionRefs = Array.from(
      workflow.matchAll(/uses: (?!actions\/)[^@\s]+@([^\s]+)/g),
      (match) => match[1],
    );

    expect(thirdPartyActionRefs).not.toHaveLength(0);
    thirdPartyActionRefs.forEach((ref) => {
      expect(ref).toMatch(/^[a-f\d]{40}$/);
    });
  });
});
