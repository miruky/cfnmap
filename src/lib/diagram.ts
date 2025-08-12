// 構成図SVGの生成。出力はスタンドアロンなSVG文字列で、ダウンロードしてもそのまま使える。
// 配色は埋め込みstyleの prefers-color-scheme でライト・ダーク両対応にする。

import type { Template } from './cfn';
import { extractEdges, type Edge } from './refs';
import { layoutGraph, type Layout, NODE_W, NODE_H, PADDING } from './layout';
import { categoryOf, shortType, type Category } from './categories';

export interface Diagram {
  svg: string;
  edges: Edge[];
  layout: Layout;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const STYLE = `
  .edge { fill: none; stroke: #97a1ad; stroke-width: 1.5; }
  .edge.dependson { stroke-dasharray: 5 4; }
  .arrow { fill: #97a1ad; }
  .card { fill-opacity: 0.06; stroke-width: 1.5; }
  .n-id { font: 700 13px 'Hiragino Sans', 'Noto Sans JP', sans-serif; fill: #2c313a; }
  .n-type { font: 400 10.5px ui-monospace, Menlo, monospace; fill: #69727e; }
  .glyph { fill: none; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .legend { font: 400 11px 'Hiragino Sans', 'Noto Sans JP', sans-serif; fill: #69727e; }
  .node { cursor: pointer; }
  .node:hover .card { fill-opacity: 0.14; }
  @media (prefers-color-scheme: dark) {
    .n-id { fill: #e2e6ec; }
    .n-type, .legend { fill: #9aa3b0; }
    .edge { stroke: #5d6671; }
    .arrow { fill: #5d6671; }
  }
`;

function edgePath(layout: Layout, edge: Edge): string {
  const from = layout.nodes.get(edge.from);
  const to = layout.nodes.get(edge.to);
  if (!from || !to) return '';
  if (from.col === to.col) {
    // 同列同士は右側へ膨らむ弧で結ぶ
    const x = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const y2 = to.y + NODE_H / 2;
    return `M${x} ${y1} C${x + 46} ${y1}, ${x + 46} ${y2}, ${x + 4} ${y2}`;
  }
  const leftToRight = from.col < to.col;
  const x1 = leftToRight ? from.x + NODE_W : from.x;
  const x2 = leftToRight ? to.x - 4 : to.x + NODE_W + 4;
  const y1 = from.y + NODE_H / 2;
  const y2 = to.y + NODE_H / 2;
  const bend = (x2 - x1) / 2;
  return `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function nodeSvg(layout: Layout, id: string, type: string): string {
  const placed = layout.nodes.get(id);
  if (!placed) return '';
  const cat = categoryOf(type);
  const tx = placed.x + 44;
  return `<g class="node" data-id="${esc(id)}" tabindex="0" role="listitem" aria-label="${esc(id)} (${esc(type)})">
    <rect class="card" x="${placed.x}" y="${placed.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${cat.color}" stroke="${cat.color}"/>
    <path class="glyph" d="${cat.glyph}" stroke="${cat.color}" transform="translate(${placed.x + 14}, ${placed.y + NODE_H / 2 - 9}) scale(1.15)"/>
    <text class="n-id" x="${tx}" y="${placed.y + 27}">${esc(clip(id, 19))}</text>
    <text class="n-type" x="${tx}" y="${placed.y + 45}">${esc(clip(shortType(type), 24))}</text>
    <title>${esc(id)}\n${esc(type)}</title>
  </g>`;
}

function legendSvg(categories: Category[], y: number): string {
  const items: string[] = [];
  let x = PADDING;
  for (const cat of categories) {
    items.push(
      `<rect x="${x}" y="${y - 9}" width="12" height="12" rx="3" fill="${cat.color}" fill-opacity="0.5"/>` +
        `<text class="legend" x="${x + 18}" y="${y + 1.5}">${esc(cat.label)}</text>`,
    );
    x += 24 + cat.label.length * 11.5 + 22;
  }
  items.push(
    `<path class="edge" d="M${x} ${y - 3} h26"/>` +
      `<text class="legend" x="${x + 32}" y="${y + 1.5}">参照</text>`,
  );
  x += 70;
  items.push(
    `<path class="edge dependson" d="M${x} ${y - 3} h26"/>` +
      `<text class="legend" x="${x + 32}" y="${y + 1.5}">DependsOn</text>`,
  );
  return items.join('\n  ');
}

/** テンプレートから構成図SVGを組み立てる。 */
export function buildDiagram(template: Template): Diagram {
  const edges = extractEdges(template);
  const layout = layoutGraph(
    template.resources.map((r) => r.id),
    edges,
  );

  const categories = new Map<string, Category>();
  for (const r of template.resources) {
    const cat = categoryOf(r.type);
    categories.set(cat.id, cat);
  }

  const legendY = layout.height + 8;
  const height = layout.height + 36;
  const title = template.description ?? 'CloudFormationテンプレートの構成図';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(layout.width, 560)} ${height}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <style>${STYLE}</style>
  <defs>
    <marker id="cfn-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path class="arrow" d="M0 0L8 4L0 8z"/>
    </marker>
  </defs>
  ${edges.map((e) => `<path class="edge ${e.kind}" d="${edgePath(layout, e)}" marker-end="url(#cfn-arrow)"/>`).join('\n  ')}
  <g role="list">
  ${template.resources.map((r) => nodeSvg(layout, r.id, r.type)).join('\n  ')}
  </g>
  ${legendSvg([...categories.values()], legendY)}
</svg>`;

  return { svg, edges, layout };
}
