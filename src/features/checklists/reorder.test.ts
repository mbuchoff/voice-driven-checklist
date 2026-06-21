import { moveItem } from './reorder';

describe('moveItem', () => {
  it('moves the first item to the end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves the last item to the start', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('moves a middle item', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('clamps the target index', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 99)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, -99)).toEqual(['b', 'a', 'c']);
  });

  it('ignores invalid source indexes', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, -1, 1)).toBe(items);
    expect(moveItem(items, 3, 1)).toBe(items);
  });
});
