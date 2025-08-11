// リソース間の参照抽出。Properties内の Ref / Fn::GetAtt / Fn::Sub と DependsOn を走査し、
// 「参照する側 → される側」の辺を作る。Parametersや疑似パラメータへの参照は辺にしない。

import type { Template } from './cfn';

export type EdgeKind = 'ref' | 'getatt' | 'sub' | 'dependson';

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
}

// Fn::Sub の ${Name} / ${Name.Attr}。${!Literal} はエスケープなので除く。
const SUB_VARIABLE = /\$\{([^!}][^}]*)\}/g;

function collectTargets(value: unknown, add: (target: string, kind: EdgeKind) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTargets(item, add);
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  const obj = value as Record<string, unknown>;
  if (typeof obj.Ref === 'string') {
    add(obj.Ref, 'ref');
  }
  const getAtt = obj['Fn::GetAtt'];
  if (typeof getAtt === 'string') {
    add(getAtt.split('.')[0] as string, 'getatt');
  } else if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') {
    add(getAtt[0], 'getatt');
  }
  const sub = obj['Fn::Sub'];
  const subTemplate = typeof sub === 'string' ? sub : Array.isArray(sub) ? sub[0] : undefined;
  const subMap = Array.isArray(sub) && typeof sub[1] === 'object' ? (sub[1] as object) : undefined;
  if (typeof subTemplate === 'string') {
    for (const m of subTemplate.matchAll(SUB_VARIABLE)) {
      const name = (m[1] as string).split('.')[0] as string;
      // ローカル変数マップで定義された名前はリソース参照ではない
      if (subMap && Object.keys(subMap).includes(name)) continue;
      add(name, 'sub');
    }
  }
  for (const [key, child] of Object.entries(obj)) {
    if (key === 'Fn::Sub') continue; // 文字列テンプレートは解析済み。変数マップ内はたどる
    collectTargets(child, add);
  }
  if (subMap) collectTargets(subMap, add);
}

/** テンプレート内のリソース間参照をすべて抽出する。重複する辺は1本にまとめる。 */
export function extractEdges(template: Template): Edge[] {
  const ids = new Set(template.resources.map((r) => r.id));
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const resource of template.resources) {
    const add = (target: string, kind: EdgeKind) => {
      // 自己参照・リソース以外(Parameter、AWS::Region 等の疑似パラメータ)は対象外
      if (!ids.has(target) || target === resource.id) return;
      const key = `${resource.id}->${target}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from: resource.id, to: target, kind });
    };
    collectTargets(resource.properties, add);
    for (const dep of resource.dependsOn) add(dep, 'dependson');
  }
  return edges;
}
