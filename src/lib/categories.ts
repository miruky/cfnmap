// リソースタイプからサービス分類を引く。色は構成図の塗り分けに、
// グリフは各ノードに置く抽象アイコン(SVGパス、16x16想定)に使う。

export interface Category {
  id: string;
  label: string;
  color: string;
  /** viewBox 0 0 16 16 で描く線画パス */
  glyph: string;
}

const CATEGORIES: Record<string, Category> = {
  compute: {
    id: 'compute',
    label: 'コンピューティング',
    color: '#c97a2c',
    glyph:
      'M4 4h8v8H4z M6.5 1.5v2.5 M9.5 1.5v2.5 M6.5 12v2.5 M9.5 12v2.5 M1.5 6.5h2.5 M1.5 9.5h2.5 M12 6.5h2.5 M12 9.5h2.5',
  },
  storage: {
    id: 'storage',
    label: 'ストレージ',
    color: '#2e8b57',
    glyph: 'M2 5l6-3 6 3v6l-6 3-6-3z M2 5l6 3 6-3 M8 8v6',
  },
  database: {
    id: 'database',
    label: 'データベース',
    color: '#3b66db',
    glyph:
      'M3 4c0-1.4 2.2-2.5 5-2.5s5 1.1 5 2.5-2.2 2.5-5 2.5S3 5.4 3 4z M3 4v8c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V4',
  },
  network: {
    id: 'network',
    label: 'ネットワーク',
    color: '#7d4fbe',
    glyph:
      'M8 2.5a2 2 0 100 .01z M3 12.5a2 2 0 100 .01z M13 12.5a2 2 0 100 .01z M7 4.2L4 11 M9 4.2l3 6.8 M5 12.5h6',
  },
  integration: {
    id: 'integration',
    label: 'アプリケーション統合',
    color: '#c2417c',
    glyph: 'M2 5.5h9 M11 5.5l-2.5-2.5 M14 10.5H5 M5 10.5L7.5 13',
  },
  security: {
    id: 'security',
    label: 'セキュリティ',
    color: '#b04040',
    glyph: 'M8 1.5l5.5 2v4c0 3.5-2.5 5.8-5.5 7-3-1.2-5.5-3.5-5.5-7v-4z M5.5 8l1.8 1.8L11 6',
  },
  management: {
    id: 'management',
    label: '管理・モニタリング',
    color: '#5f7385',
    glyph: 'M8 13.5A5.5 5.5 0 118 2.5a5.5 5.5 0 010 11z M8 8l3-3 M8 8h.01',
  },
  other: {
    id: 'other',
    label: 'その他',
    color: '#6b7280',
    glyph: 'M2.5 5l5.5-3 5.5 3v6l-5.5 3-5.5-3z M2.5 5l5.5 3 5.5-3 M8 8v6',
  },
};

const RULES: { pattern: RegExp; category: keyof typeof CATEGORIES }[] = [
  {
    pattern: /^AWS::(Lambda|ECS|EKS|Batch|AppRunner|EC2::Instance|EC2::LaunchTemplate|AutoScaling)/,
    category: 'compute',
  },
  { pattern: /^AWS::(S3|EFS|FSx|Backup)/, category: 'storage' },
  {
    pattern: /^AWS::(DynamoDB|RDS|ElastiCache|Redshift|Neptune|DocDB|Timestream)/,
    category: 'database',
  },
  {
    pattern: /^AWS::(EC2::|ElasticLoadBalancing|CloudFront|Route53|GlobalAccelerator|VpcLattice)/,
    category: 'network',
  },
  {
    pattern:
      /^AWS::(SNS|SQS|Events|EventBridge|StepFunctions|ApiGateway|ApiGatewayV2|AppSync|MQ|Scheduler)/,
    category: 'integration',
  },
  {
    pattern: /^AWS::(IAM|KMS|SecretsManager|Cognito|WAFv2|WAF|ACMPCA|CertificateManager|Shield)/,
    category: 'security',
  },
  {
    pattern: /^AWS::(CloudWatch|Logs|SSM|CloudTrail|Config|XRay|ApplicationInsights)/,
    category: 'management',
  },
];

/** リソースタイプ(例: AWS::Lambda::Function)から分類を返す。 */
export function categoryOf(type: string): Category {
  for (const { pattern, category } of RULES) {
    if (pattern.test(type)) return CATEGORIES[category] as Category;
  }
  return CATEGORIES.other as Category;
}

/** AWS::Lambda::Function → Lambda::Function のような短い表記にする。 */
export function shortType(type: string): string {
  return type.replace(/^AWS::/, '');
}
