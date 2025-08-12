import { describe, expect, it } from 'vitest';
import { decodeSource, encodeSource } from './share';

describe('encodeSource / decodeSource', () => {
  it('YAMLや日本語を含む本文を往復しても等しい', () => {
    const source = 'Resources:\n  バケット:\n    Type: AWS::S3::Bucket # メモ\n';
    expect(decodeSource(encodeSource(source))).toBe(source);
  });

  it('URLフラグメントに安全な文字だけを使う', () => {
    expect(encodeSource('{"a":1,"b":"x/y+z"}')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('空文字や壊れた入力ではnullを返す', () => {
    expect(decodeSource('')).toBeNull();
    expect(decodeSource('@@invalid@@')).toBeNull();
  });
});
