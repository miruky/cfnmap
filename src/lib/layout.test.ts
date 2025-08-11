import { describe, it, expect } from 'vitest';
import { layoutGraph, NODE_H, GAP_Y } from './layout';

describe('layoutGraph', () => {
  it('依存先ほど右の列に置く', () => {
    const layout = layoutGraph(
      ['api', 'fn', 'table'],
      [
        { from: 'api', to: 'fn' },
        { from: 'fn', to: 'table' },
      ],
    );
    const api = layout.nodes.get('api');
    const fn = layout.nodes.get('fn');
    const table = layout.nodes.get('table');
    expect(api?.col).toBe(0);
    expect(fn?.col).toBe(1);
    expect(table?.col).toBe(2);
    expect((api?.x ?? 0) < (fn?.x ?? 0) && (fn?.x ?? 0) < (table?.x ?? 0)).toBe(true);
  });

  it('同列のノードは縦に重ならない', () => {
    const layout = layoutGraph(
      ['a', 'b', 'c', 'shared'],
      [
        { from: 'a', to: 'shared' },
        { from: 'b', to: 'shared' },
        { from: 'c', to: 'shared' },
      ],
    );
    const ys = ['a', 'b', 'c'].map((id) => layout.nodes.get(id)?.y ?? 0).sort((p, q) => p - q);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(NODE_H + GAP_Y);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(NODE_H + GAP_Y);
  });

  it('独立したノードだけなら1列に積む', () => {
    const layout = layoutGraph(['x', 'y'], []);
    expect(layout.nodes.get('x')?.col).toBe(0);
    expect(layout.nodes.get('y')?.col).toBe(0);
    expect(layout.hasCycle).toBe(false);
  });

  it('循環参照があっても破綻せずフラグを立てる', () => {
    const layout = layoutGraph(
      ['a', 'b'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(layout.hasCycle).toBe(true);
    expect(layout.nodes.size).toBe(2);
  });

  it('キャンバスサイズは全ノードを収める', () => {
    const layout = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    );
    for (const placed of layout.nodes.values()) {
      expect(placed.x).toBeGreaterThanOrEqual(0);
      expect(placed.y).toBeGreaterThanOrEqual(0);
      expect(placed.y + NODE_H).toBeLessThanOrEqual(layout.height);
    }
  });
});
