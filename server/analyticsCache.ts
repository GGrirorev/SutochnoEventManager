interface CacheEntry {
  data: any;
  timestamp: number;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

class AnalyticsCache {
  private cache: Map<string, CacheEntry> = new Map();

  generateKey(label: string, platform: string, startDate: string, endDate: string): string {
    return `${label}:${platform}:${startDate}:${endDate}`;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; ttlHours: number } {
    return {
      size: this.cache.size,
      ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
    };
  }
}

export const analyticsCache = new AnalyticsCache();
