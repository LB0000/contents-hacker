interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5分

/**
 * キャッシュ付き非同期関数呼び出し。
 * TTL 内であればキャッシュを返し、期限切れなら fn() を実行して結果を保存する。
 * 同一キーの同時リクエストは1つの fn() を共有する。
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl = DEFAULT_TTL
): Promise<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiry) {
    return entry.data;
  }

  // 既存の実行中Promiseがあればそれを返す
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const promise = fn().then((data) => {
    // 空配列はキャッシュしない（ソースの一時的な0件を5分間固定しないため）
    if (!Array.isArray(data) || data.length > 0) {
      store.set(key, { data, expiry: Date.now() + ttl });
    }
    return data;
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** キャッシュにヒットするかどうかを判定 */
export function isCached(key: string): boolean {
  const entry = store.get(key);
  return !!entry && Date.now() < entry.expiry;
}
