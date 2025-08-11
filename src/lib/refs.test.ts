import { describe, it, expect } from 'vitest';
import { extractEdges } from './refs';
import type { Template } from './cfn';

function template(
  resources: { id: string; properties?: unknown; dependsOn?: string[] }[],
): Template {
  return {
    resources: resources.map((r) => ({
      id: r.id,
      type: 'AWS::Test::Resource',
      properties: r.properties,
      dependsOn: r.dependsOn ?? [],
    })),
    parameters: [],
    outputs: [],
  };
}

describe('extractEdges', () => {
  it('Refから辺を作る', () => {
    const edges = extractEdges(
      template([{ id: 'A', properties: { X: { Ref: 'B' } } }, { id: 'B' }]),
    );
    expect(edges).toEqual([{ from: 'A', to: 'B', kind: 'ref' }]);
  });

  it('Fn::GetAttの配列形式とドット形式から辺を作る', () => {
    const edges = extractEdges(
      template([
        { id: 'A', properties: { X: { 'Fn::GetAtt': ['B', 'Arn'] } } },
        { id: 'B', properties: { Y: { 'Fn::GetAtt': 'C.Arn' } } },
        { id: 'C' },
      ]),
    );
    expect(edges).toEqual([
      { from: 'A', to: 'B', kind: 'getatt' },
      { from: 'B', to: 'C', kind: 'getatt' },
    ]);
  });

  it('Fn::Subの変数から辺を作る', () => {
    const edges = extractEdges(
      template([
        { id: 'A', properties: { X: { 'Fn::Sub': 'arn:${B}/${C.Arn}' } } },
        { id: 'B' },
        { id: 'C' },
      ]),
    );
    expect(edges).toEqual([
      { from: 'A', to: 'B', kind: 'sub' },
      { from: 'A', to: 'C', kind: 'sub' },
    ]);
  });

  it('Fn::Subのローカル変数マップとエスケープを除外しつつ、マップ内の参照はたどる', () => {
    const edges = extractEdges(
      template([
        {
          id: 'A',
          properties: {
            X: { 'Fn::Sub': ['${local}-${!Escaped}-${B}', { local: { Ref: 'C' } }] },
          },
        },
        { id: 'B' },
        { id: 'C' },
      ]),
    );
    expect(edges).toEqual([
      { from: 'A', to: 'B', kind: 'sub' },
      { from: 'A', to: 'C', kind: 'ref' },
    ]);
  });

  it('DependsOnから辺を作る', () => {
    const edges = extractEdges(template([{ id: 'A', dependsOn: ['B'] }, { id: 'B' }]));
    expect(edges).toEqual([{ from: 'A', to: 'B', kind: 'dependson' }]);
  });

  it('Parameterや疑似パラメータへの参照は辺にしない', () => {
    const edges = extractEdges(
      template([
        {
          id: 'A',
          properties: {
            X: { Ref: 'StageName' },
            Y: { 'Fn::Sub': '${AWS::Region}-${AWS::AccountId}' },
          },
        },
      ]),
    );
    expect(edges).toEqual([]);
  });

  it('深い入れ子の参照も拾い、同じ組は1本にまとめる', () => {
    const edges = extractEdges(
      template([
        {
          id: 'A',
          properties: {
            List: [{ Nested: { Deep: { Ref: 'B' } } }, { Again: { 'Fn::GetAtt': ['B', 'Arn'] } }],
          },
        },
        { id: 'B' },
      ]),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: 'A', to: 'B', kind: 'ref' });
  });

  it('自己参照は辺にしない', () => {
    const edges = extractEdges(template([{ id: 'A', properties: { X: { Ref: 'A' } } }]));
    expect(edges).toEqual([]);
  });
});
