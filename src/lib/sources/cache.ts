interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5分

/**
 * キャッシュ付き非同期関数呼び出し。
 * TTL 内であればキャッシュを返し、期限切れなら fn() を実行して結果を保存する。
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
  const data = await fn();
  // 空配列はキャッシュしない（ソースの一時的な0件を5分間固定しないため）
  if (!Array.isArray(data) || data.length > 0) {
    store.set(key, { data, expiry: Date.now() + ttl });
  }
  return data;
}

/** キャッシュにヒットするかどうかを判定 */
export function isCached(key: string): boolean {
  const entry = store.get(key);
  return !!entry && Date.now() < entry.expiry;
}
