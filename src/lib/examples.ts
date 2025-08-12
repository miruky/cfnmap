// サンプルテンプレート。YAML短縮タグとJSONの両形式、典型的な構成を一通り示す。

export interface Example {
  id: string;
  label: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'serverless-api',
    label: 'サーバーレスAPI(YAML)',
    source: `AWSTemplateFormatVersion: '2010-09-09'
Description: DynamoDBを読み書きするREST API
Parameters:
  StageName:
    Type: String
    Default: prod
Resources:
  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: orderId
          AttributeType: S
      KeySchema:
        - AttributeName: orderId
          KeyType: HASH
  ApiFunctionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: orders-table-access
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                Resource: !GetAtt OrdersTable.Arn
  ApiFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs22.x
      Handler: index.handler
      Role: !GetAtt ApiFunctionRole.Arn
      Environment:
        Variables:
          TABLE_NAME: !Ref OrdersTable
      Code:
        ZipFile: 'exports.handler = async () => ({ statusCode: 200 })'
  FunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/\${ApiFunction}
      RetentionInDays: 30
  HttpApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: orders-api
      ProtocolType: HTTP
      Target: !GetAtt ApiFunction.Arn
  ApiInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ApiFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${HttpApi}/*
Outputs:
  ApiEndpoint:
    Value: !GetAtt HttpApi.ApiEndpoint
`,
  },
  {
    id: 'static-site',
    label: '静的サイト配信(JSON)',
    source: JSON.stringify(
      {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: 'CloudFrontで配信する静的サイト',
        Resources: {
          SiteBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                RestrictPublicBuckets: true,
              },
            },
          },
          OriginAccessControl: {
            Type: 'AWS::CloudFront::OriginAccessControl',
            Properties: {
              OriginAccessControlConfig: {
                Name: 'site-oac',
                OriginAccessControlOriginType: 's3',
                SigningBehavior: 'always',
                SigningProtocol: 'sigv4',
              },
            },
          },
          Distribution: {
            Type: 'AWS::CloudFront::Distribution',
            Properties: {
              DistributionConfig: {
                Enabled: true,
                DefaultRootObject: 'index.html',
                Origins: [
                  {
                    Id: 's3-origin',
                    DomainName: { 'Fn::GetAtt': ['SiteBucket', 'RegionalDomainName'] },
                    OriginAccessControlId: { 'Fn::GetAtt': ['OriginAccessControl', 'Id'] },
                    S3OriginConfig: { OriginAccessIdentity: '' },
                  },
                ],
                DefaultCacheBehavior: {
                  TargetOriginId: 's3-origin',
                  ViewerProtocolPolicy: 'redirect-to-https',
                  CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
                },
              },
            },
          },
          BucketPolicy: {
            Type: 'AWS::S3::BucketPolicy',
            Properties: {
              Bucket: { Ref: 'SiteBucket' },
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: { Service: 'cloudfront.amazonaws.com' },
                    Action: 's3:GetObject',
                    Resource: { 'Fn::Sub': '${SiteBucket.Arn}/*' },
                    Condition: {
                      StringEquals: {
                        'AWS:SourceArn': {
                          'Fn::Sub':
                            'arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}',
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'vpc-network',
    label: 'VPCと公開サブネット(YAML)',
    source: `AWSTemplateFormatVersion: '2010-09-09'
Description: 2AZの公開サブネットを持つVPC
Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
  InternetGateway:
    Type: AWS::EC2::InternetGateway
  VpcGatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref Vpc
      InternetGatewayId: !Ref InternetGateway
  PublicSubnetA:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: 10.0.0.0/24
      AvailabilityZone: !Select [0, !GetAZs '']
  PublicSubnetB:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [1, !GetAZs '']
  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc
  DefaultRoute:
    Type: AWS::EC2::Route
    DependsOn: VpcGatewayAttachment
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway
  SubnetARouteAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnetA
      RouteTableId: !Ref PublicRouteTable
  SubnetBRouteAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnetB
      RouteTableId: !Ref PublicRouteTable
  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: HTTPSのみ許可
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
`,
  },
];
