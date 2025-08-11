import { describe, it, expect } from 'vitest';
import { parseTemplate } from './cfn';

describe('parseTemplate (JSON)', () => {
  it('リソースを正規化する', () => {
    const { template, errors } = parseTemplate(
      JSON.stringify({
        Description: 'test stack',
        Parameters: { Stage: { Type: 'String' } },
        Resources: {
          Bucket: { Type: 'AWS::S3::Bucket', Properties: { BucketName: 'b' } },
        },
        Outputs: { Name: { Value: 'x' } },
      }),
    );
    expect(errors).toEqual([]);
    expect(template?.description).toBe('test stack');
    expect(template?.parameters).toEqual(['Stage']);
    expect(template?.outputs).toEqual(['Name']);
    expect(template?.resources).toEqual([
      {
        id: 'Bucket',
        type: 'AWS::S3::Bucket',
        properties: { BucketName: 'b' },
        dependsOn: [],
        condition: undefined,
      },
    ]);
  });

  it('DependsOnの文字列と配列を受け付ける', () => {
    const { template } = parseTemplate(
      JSON.stringify({
        Resources: {
          A: { Type: 'T', DependsOn: 'B' },
          B: { Type: 'T', DependsOn: ['A', 'C'] },
          C: { Type: 'T' },
        },
      }),
    );
    expect(template?.resources[0]?.dependsOn).toEqual(['B']);
    expect(template?.resources[1]?.dependsOn).toEqual(['A', 'C']);
  });

  it('壊れたJSONを報告する', () => {
    const { errors } = parseTemplate('{ "Resources": ');
    expect(errors[0]).toContain('JSONとして解析できない');
  });

  it('Resourcesの欠落を報告する', () => {
    expect(parseTemplate('{}').errors[0]).toContain('Resources');
    expect(parseTemplate(JSON.stringify({ Resources: {} })).errors[0]).toContain('Resources');
  });

  it('Typeのないリソースを報告する', () => {
    const { errors } = parseTemplate(JSON.stringify({ Resources: { X: { Properties: {} } } }));
    expect(errors[0]).toContain('X');
    expect(errors[0]).toContain('Type');
  });
});

describe('parseTemplate (YAML)', () => {
  it('短縮タグを長形式へ変換する', () => {
    const { template, errors } = parseTemplate(`
Resources:
  Fn:
    Type: AWS::Lambda::Function
    Properties:
      Role: !GetAtt FnRole.Arn
      Handler: !Ref Handler
      Layers: !Sub 'arn:aws:lambda:\${AWS::Region}:layer'
  FnRole:
    Type: AWS::IAM::Role
`);
    expect(errors).toEqual([]);
    const props = template?.resources[0]?.properties as Record<string, unknown>;
    expect(props.Role).toEqual({ 'Fn::GetAtt': ['FnRole', 'Arn'] });
    expect(props.Handler).toEqual({ Ref: 'Handler' });
    expect(props.Layers).toEqual({ 'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:layer' });
  });

  it('!GetAtt の配列形式と !Select のシーケンスを扱う', () => {
    const { template, errors } = parseTemplate(`
Resources:
  Subnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !GetAtt [Vpc, VpcId]
      AvailabilityZone: !Select [0, !GetAZs '']
  Vpc:
    Type: AWS::EC2::VPC
`);
    expect(errors).toEqual([]);
    const props = template?.resources[0]?.properties as Record<string, unknown>;
    expect(props.VpcId).toEqual({ 'Fn::GetAtt': ['Vpc', 'VpcId'] });
    expect(props.AvailabilityZone).toEqual({ 'Fn::Select': [0, { 'Fn::GetAZs': '' }] });
  });

  it('壊れたYAMLを報告する', () => {
    const { errors } = parseTemplate('Resources:\n  - :\n bad');
    expect(errors[0]).toContain('YAMLとして解析できない');
  });

  it('空入力を報告する', () => {
    expect(parseTemplate('  \n ').errors[0]).toContain('空');
  });
});
