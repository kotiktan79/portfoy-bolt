interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

class CacheService {
  private cache = new Map<string, CacheItem<any>>();
  private readonly DEFAULT_EXPIRY = 60 * 1000;

  set<T>(key: string, data: T, expiresIn: number = this.DEFAULT_EXPIRY): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    const now = Date.now();
    const age = now - item.timestamp;

    if (age > item.expiresIn) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((item, key) => {
      const age = now - item.timestamp;
      if (age > item.expiresIn) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

export const cacheService = new CacheService();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCacheCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    cacheService.cleanup();
  }, 60 * 1000);
}

export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

startCacheCleanup();
