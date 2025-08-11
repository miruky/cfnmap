// 階層レイアウト。依存の深さで列を決め、隣接列の重心で行順を整えてから座標を割り当てる。
// 参照する側が左、参照される側(依存先)が右に並ぶ。

export const NODE_W = 200;
export const NODE_H = 64;
export const GAP_X = 80;
export const GAP_Y = 28;
export const PADDING = 28;

export interface Placed {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface Layout {
  nodes: Map<string, Placed>;
  width: number;
  height: number;
  /** 循環参照を検出した場合 true(該当ノードは深さ0へ畳む) */
  hasCycle: boolean;
}

interface EdgeLike {
  from: string;
  to: string;
}

/** 依存の深さ(依存先を持たないノードが0)を求める。循環は深さ0で打ち切る。 */
function depths(
  ids: string[],
  edges: EdgeLike[],
): { depth: Map<string, number>; hasCycle: boolean } {
  const out = new Map<string, string[]>();
  for (const id of ids) out.set(id, []);
  for (const e of edges) out.get(e.from)?.push(e.to);

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  let hasCycle = false;

  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) {
      hasCycle = true;
      return 0;
    }
    visiting.add(id);
    let d = 0;
    for (const dep of out.get(id) ?? []) d = Math.max(d, visit(dep) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of ids) visit(id);
  return { depth, hasCycle };
}

/** ノード群と辺から各ノードの座標とキャンバスサイズを計算する。 */
export function layoutGraph(ids: string[], edges: EdgeLike[]): Layout {
  const { depth, hasCycle } = depths(ids, edges);
  const maxDepth = Math.max(0, ...depth.values());

  // 深いもの(依存先)ほど右の列へ
  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const id of ids) {
    const col = maxDepth - (depth.get(id) ?? 0);
    (columns[col] as string[]).push(id);
  }

  // 隣接列の接続先の平均行(重心)に近い順へ並べ替え、辺の交差を減らす
  const neighbors = new Map<string, string[]>();
  for (const e of edges) {
    neighbors.set(e.from, [...(neighbors.get(e.from) ?? []), e.to]);
    neighbors.set(e.to, [...(neighbors.get(e.to) ?? []), e.from]);
  }
  const rowOf = new Map<string, number>();
  columns.forEach((col) => col.forEach((id, row) => rowOf.set(id, row)));
  for (let pass = 0; pass < 2; pass += 1) {
    const order = pass === 0 ? columns : [...columns].reverse();
    for (const col of order) {
      const score = (id: string): number => {
        const linked = (neighbors.get(id) ?? []).map((n) => rowOf.get(n) ?? 0);
        return linked.length === 0
          ? (rowOf.get(id) ?? 0)
          : linked.reduce((a, b) => a + b, 0) / linked.length;
      };
      col.sort((a, b) => score(a) - score(b));
      col.forEach((id, row) => rowOf.set(id, row));
    }
  }

  const maxRows = Math.max(1, ...columns.map((c) => c.length));
  const height = PADDING * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y;
  const width = PADDING * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X;

  const nodes = new Map<string, Placed>();
  columns.forEach((col, c) => {
    const colHeight = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const top = PADDING + (height - PADDING * 2 - colHeight) / 2;
    col.forEach((id, row) => {
      nodes.set(id, {
        id,
        col: c,
        row,
        x: PADDING + c * (NODE_W + GAP_X),
        y: top + row * (NODE_H + GAP_Y),
      });
    });
  });

  return { nodes, width, height, hasCycle };
}
