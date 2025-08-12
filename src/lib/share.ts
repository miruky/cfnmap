// テンプレート本文をURLフラグメントへ可逆に詰める。共有リンクから同じ図を再現できる。
// 日本語やYAMLの記号を含むためUTF-8で符号化し、URLに安全なbase64urlを用いる。

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSource(source: string): string {
  return base64UrlEncode(source);
}

// 壊れた・改竄された入力ではnullを返し、呼び出し側で既定へフォールバックできるようにする
export function decodeSource(encoded: string): string | null {
  if (encoded === '') return null;
  try {
    return base64UrlDecode(encoded);
  } catch {
    return null;
  }
}
