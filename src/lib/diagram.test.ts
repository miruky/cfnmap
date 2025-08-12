import { describe, it, expect } from 'vitest';
import { buildDiagram } from './diagram';
import { parseTemplate } from './cfn';
import { categoryOf, shortType } from './categories';
import { EXAMPLES } from './examples';

function diagramOf(source: string) {
  const { template, errors } = parseTemplate(source);
  expect(errors).toEqual([]);
  if (!template) throw new Error('parse failed');
  return buildDiagram(template);
}

describe('categoryOf / shortType', () => {
  it('リソースタイプを分類する', () => {
    expect(categoryOf('AWS::Lambda::Function').id).toBe('compute');
    expect(categoryOf('AWS::S3::Bucket').id).toBe('storage');
    expect(categoryOf('AWS::DynamoDB::Table').id).toBe('database');
    expect(categoryOf('AWS::EC2::VPC').id).toBe('network');
    expect(categoryOf('AWS::ApiGatewayV2::Api').id).toBe('integration');
    expect(categoryOf('AWS::IAM::Role').id).toBe('security');
    expect(categoryOf('AWS::Logs::LogGroup').id).toBe('management');
    expect(categoryOf('Custom::Thing').id).toBe('other');
  });

  it('AWS接頭辞を省いた短い表記を返す', () => {
    expect(shortType('AWS::Lambda::Function')).toBe('Lambda::Function');
    expect(shortType('Custom::Thing')).toBe('Custom::Thing');
  });
});

describe('buildDiagram', () => {
  const simple = JSON.stringify({
    Resources: {
      Fn: {
        Type: 'AWS::Lambda::Function',
        Properties: { Role: { 'Fn::GetAtt': ['Role', 'Arn'] } },
      },
      Role: { Type: 'AWS::IAM::Role' },
    },
  });

  it('全リソースのノードを含むSVGを生成する', () => {
    const { svg } = diagramOf(simple);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('data-id="Fn"');
    expect(svg).toContain('data-id="Role"');
    expect(svg).toContain('Lambda::Function');
  });

  it('参照の辺を描く', () => {
    const { svg, edges } = diagramOf(simple);
    expect(edges).toEqual([{ from: 'Fn', to: 'Role', kind: 'getatt' }]);
    expect(svg).toContain('class="edge getatt"');
    expect(svg).toContain('marker-end="url(#cfn-arrow)"');
  });

  it('DependsOnは破線クラスになる', () => {
    const { svg } = diagramOf(
      JSON.stringify({
        Resources: {
          A: { Type: 'AWS::S3::Bucket', DependsOn: 'B' },
          B: { Type: 'AWS::S3::Bucket' },
        },
      }),
    );
    expect(svg).toContain('class="edge dependson"');
  });

  it('XML特殊文字をエスケープする', () => {
    const { svg } = diagramOf(
      JSON.stringify({
        Description: 'a <test> & "quote"',
        Resources: { X: { Type: 'AWS::S3::Bucket' } },
      }),
    );
    expect(svg).toContain('a &lt;test&gt; &amp; &quot;quote&quot;');
    expect(svg).not.toContain('<test>');
  });

  it('凡例に登場した分類と辺種別を載せる', () => {
    const { svg } = diagramOf(simple);
    expect(svg).toContain('コンピューティング');
    expect(svg).toContain('セキュリティ');
    expect(svg).not.toContain('データベース');
    expect(svg).toContain('DependsOn');
  });

  it('長い論理IDを省略する', () => {
    const longId = 'VeryLongLogicalResourceIdentifierForTest';
    const { svg } = diagramOf(
      JSON.stringify({ Resources: { [longId]: { Type: 'AWS::S3::Bucket' } } }),
    );
    expect(svg).toContain('…');
    expect(svg).toContain(`data-id="${longId}"`);
  });
});

describe('サンプルテンプレート', () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s が解析と描画を通る', (_id, example) => {
    const { template, errors } = parseTemplate(example.source);
    expect(errors).toEqual([]);
    if (!template) throw new Error('parse failed');
    const { svg, edges } = buildDiagram(template);
    expect(svg).toContain('<svg');
    expect(edges.length).toBeGreaterThan(0);
  });

  it('サーバーレスAPIの参照関係を正しく抽出する', () => {
    const example = EXAMPLES.find((e) => e.id === 'serverless-api');
    if (!example) throw new Error('preset missing');
    const { edges } = diagramOf(example.source);
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).toContain('ApiFunction->ApiFunctionRole');
    expect(pairs).toContain('ApiFunction->OrdersTable');
    expect(pairs).toContain('ApiFunctionRole->OrdersTable');
    expect(pairs).toContain('FunctionLogGroup->ApiFunction');
    expect(pairs).toContain('HttpApi->ApiFunction');
  });
});
