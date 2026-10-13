import 'server-only';
import { AwsClient } from 'aws4fetch';
import { getEnv } from '@/lib/env';

// Cloudflare R2 through its S3-compatible API (architecture §8.1). One private bucket; the app
// only signs short-lived URLs, and browsers upload and download directly. The files module is
// the only caller.

export interface StoredObject {
  sizeBytes: number;
  contentType: string;
}

/** A test stand-in for an uploaded object: its size, type and first bytes. */
export interface TestObject extends StoredObject {
  firstBytes?: Uint8Array;
}

/** R2 refused or couldn't be reached. Never contains keys or signed URLs. */
export class StorageError extends Error {}

const globalForR2 = globalThis as typeof globalThis & {
  __r2?: { client: AwsClient; endpoint: string };
  __testObjects?: Map<string, TestObject>;
};

const isTest = () => getEnv().NODE_ENV === 'test';

/**
 * Objects "uploaded" while NODE_ENV is test. Tests never reach R2: they put objects here to
 * stand in for a browser upload, and signed URLs point at a fake host.
 */
export function testObjects(): Map<string, TestObject> {
  globalForR2.__testObjects ??= new Map();
  return globalForR2.__testObjects;
}

function r2() {
  if (!globalForR2.__r2) {
    const env = getEnv();
    globalForR2.__r2 = {
      client: new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      }),
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`,
    };
  }
  return globalForR2.__r2;
}

function objectUrl(key: string, expiresInSeconds?: number): URL {
  const base = isTest() ? 'https://r2.test/bucket' : r2().endpoint;
  const url = new URL(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`);
  if (expiresInSeconds !== undefined) {
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  }
  return url;
}

/**
 * A URL the browser can PUT one file to. The type and exact size are part of the signature, so
 * the upload must send exactly these `Content-Type` and `Content-Length` headers.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  sizeBytes: number,
  expiresInSeconds: number,
): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) };
  const url = objectUrl(key, expiresInSeconds);
  if (isTest()) return { url: url.toString(), headers };
  const signed = await r2().client.sign(url.toString(), {
    method: 'PUT',
    headers,
    aws: { signQuery: true, allHeaders: true },
  });
  return { url: signed.url, headers };
}

/** A URL to view or download one file, valid for `expiresInSeconds`. */
export async function presignDownload(key: string, expiresInSeconds: number): Promise<string> {
  const url = objectUrl(key, expiresInSeconds);
  if (isTest()) return url.toString();
  const signed = await r2().client.sign(url.toString(), {
    method: 'GET',
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Size and type of a stored file, or `null` if there's no such file. */
export async function headObject(key: string): Promise<StoredObject | null> {
  if (isTest()) return testObjects().get(key) ?? null;
  const response = await r2().client.fetch(objectUrl(key).toString(), { method: 'HEAD' });
  if (response.status === 404) return null;
  if (!response.ok) throw new StorageError(`Storage check failed (${response.status})`);
  return {
    sizeBytes: Number(response.headers.get('content-length') ?? 0),
    contentType: response.headers.get('content-type') ?? '',
  };
}

/** The first `length` bytes of a stored file (fewer if it's shorter), or `null` if it's gone. */
export async function readObjectStart(key: string, length: number): Promise<Uint8Array | null> {
  if (isTest()) {
    const object = testObjects().get(key);
    return object ? (object.firstBytes ?? new Uint8Array()).slice(0, length) : null;
  }
  const response = await r2().client.fetch(objectUrl(key).toString(), {
    method: 'GET',
    headers: { Range: `bytes=0-${length - 1}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new StorageError(`Storage read failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer()).slice(0, length);
}

/** Delete a file. Deleting one that's already gone is fine. */
export async function deleteObject(key: string): Promise<void> {
  if (isTest()) {
    testObjects().delete(key);
    return;
  }
  const response = await r2().client.fetch(objectUrl(key).toString(), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new StorageError(`Storage delete failed (${response.status})`);
  }
}
