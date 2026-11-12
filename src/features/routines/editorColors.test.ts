import { mixColors } from './editorColors';

describe('mixColors', () => {
  it('blends two colors like CSS color-mix in sRGB', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#ff0000', '#0000ff', 0.65)).toBe('#a60059');
    expect(mixColors('#123456', '#abcdef', 1)).toBe('#123456');
  });
});
