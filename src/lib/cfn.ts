// CloudFormationテンプレートの解析。JSONとYAML(!Ref などの短縮タグ)を受け付け、
// リソースの一覧へ正規化する。CDKは cdk synth が出力するテンプレートをそのまま貼れる。

import { parse as parseYaml, ScalarTag, CollectionTag } from 'yaml';

export interface ResourceNode {
  id: string;
  type: string;
  properties: unknown;
  dependsOn: string[];
  condition?: string;
}

export interface Template {
  description?: string;
  resources: ResourceNode[];
  parameters: string[];
  outputs: string[];
}

export interface ParseResult {
  template?: Template;
  errors: string[];
}

// CFNの短縮タグを長形式の組み込み関数オブジェクトへ変換する。
// !GetAtt A.B はドット区切り文字列でも配列でも書けるため両方受ける。
const SHORT_TAGS = [
  'Ref',
  'Condition',
  'GetAtt',
  'Sub',
  'Join',
  'Select',
  'Split',
  'FindInMap',
  'Base64',
  'Cidr',
  'ImportValue',
  'GetAZs',
  'Transform',
  'And',
  'Equals',
  'If',
  'Not',
  'Or',
];

function longForm(tag: string, value: unknown): Record<string, unknown> {
  if (tag === 'Ref' || tag === 'Condition') return { [tag]: value };
  if (tag === 'GetAtt' && typeof value === 'string') {
    const dot = value.indexOf('.');
    return { 'Fn::GetAtt': dot === -1 ? [value] : [value.slice(0, dot), value.slice(dot + 1)] };
  }
  return { [`Fn::${tag}`]: value };
}

function cfnTags(): (ScalarTag | CollectionTag)[] {
  const tags: (ScalarTag | CollectionTag)[] = [];
  for (const name of SHORT_TAGS) {
    tags.push({
      tag: `!${name}`,
      resolve: (value: string) => longForm(name, value),
    } as ScalarTag);
    for (const collection of ['seq', 'map'] as const) {
      tags.push({
        tag: `!${name}`,
        collection,
        resolve: (value: unknown) => longForm(name, (value as { toJSON(): unknown }).toJSON()),
      } as CollectionTag);
    }
  }
  return tags;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSource(source: string): { root?: unknown; error?: string } {
  const trimmed = source.trim();
  if (trimmed === '') return { error: 'テンプレートが空' };
  if (trimmed.startsWith('{')) {
    try {
      return { root: JSON.parse(trimmed) };
    } catch (e) {
      return { error: `JSONとして解析できない: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  try {
    return { root: parseYaml(trimmed, { customTags: cfnTags() }) };
  } catch (e) {
    return { error: `YAMLとして解析できない: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** テンプレート文字列を解析して正規化する。エラーがあれば template は返さない。 */
export function parseTemplate(source: string): ParseResult {
  const { root, error } = parseSource(source);
  if (error !== undefined) return { errors: [error] };
  if (!isPlainObject(root)) return { errors: ['テンプレートのルートはオブジェクトで書く'] };

  const errors: string[] = [];
  const resourcesRaw = root.Resources;
  if (!isPlainObject(resourcesRaw) || Object.keys(resourcesRaw).length === 0) {
    return { errors: ['Resources セクションが必要(空でないオブジェクト)'] };
  }

  const resources: ResourceNode[] = [];
  for (const [id, raw] of Object.entries(resourcesRaw)) {
    if (!isPlainObject(raw)) {
      errors.push(`${id}: リソース定義はオブジェクトで書く`);
      continue;
    }
    if (typeof raw.Type !== 'string' || raw.Type === '') {
      errors.push(`${id}: Type が必要`);
      continue;
    }
    const dependsOn =
      raw.DependsOn === undefined
        ? []
        : Array.isArray(raw.DependsOn)
          ? raw.DependsOn.filter((d): d is string => typeof d === 'string')
          : typeof raw.DependsOn === 'string'
            ? [raw.DependsOn]
            : [];
    resources.push({
      id,
      type: raw.Type,
      properties: raw.Properties,
      dependsOn,
      condition: typeof raw.Condition === 'string' ? raw.Condition : undefined,
    });
  }
  if (errors.length > 0) return { errors };

  return {
    template: {
      description: typeof root.Description === 'string' ? root.Description : undefined,
      resources,
      parameters: isPlainObject(root.Parameters) ? Object.keys(root.Parameters) : [],
      outputs: isPlainObject(root.Outputs) ? Object.keys(root.Outputs) : [],
    },
    errors,
  };
}
