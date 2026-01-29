type FetchOptions = RequestInit & {
  timeout?: number;
};

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;
const MAX_LOG_ENTRIES = 1000;

export type HttpLogEntry = {
  id: number;
  timestamp: Date;
  url: string;
  method: string;
  status: 'success' | 'timeout' | 'error' | 'retry';
  statusCode?: number;
  duration: number;
  errorMessage?: string;
  retryCount?: number;
};

class HttpStats {
  private logs: HttpLogEntry[] = [];
  private idCounter = 0;
  private successCount = 0;
  private timeoutCount = 0;
  private errorCount = 0;
  private retryCount = 0;
  private totalDuration = 0;

  log(entry: Omit<HttpLogEntry, 'id'>): void {
    this.idCounter++;
    const logEntry: HttpLogEntry = { id: this.idCounter, ...entry };
    
    this.logs.push(logEntry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    switch (entry.status) {
      case 'success':
        this.successCount++;
        break;
      case 'timeout':
        this.timeoutCount++;
        break;
      case 'error':
        this.errorCount++;
        break;
      case 'retry':
        this.retryCount++;
        break;
    }
    this.totalDuration += entry.duration;
  }

  getStats() {
    const total = this.successCount + this.timeoutCount + this.errorCount;
    return {
      total,
      success: this.successCount,
      timeout: this.timeoutCount,
      error: this.errorCount,
      retry: this.retryCount,
      avgDuration: total > 0 ? Math.round(this.totalDuration / total) : 0,
      successRate: total > 0 ? Math.round((this.successCount / total) * 100) : 0,
    };
  }

  getLogs(limit = 100, offset = 0): { logs: HttpLogEntry[]; total: number } {
    const reversed = [...this.logs].reverse();
    return {
      logs: reversed.slice(offset, offset + limit),
      total: this.logs.length,
    };
  }

  clear(): void {
    this.logs = [];
    this.successCount = 0;
    this.timeoutCount = 0;
    this.errorCount = 0;
    this.retryCount = 0;
    this.totalDuration = 0;
    this.idCounter = 0;
  }
}

export const httpStats = new HttpStats();

class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private maxConcurrent: number;
  private minInterval: number;
  private lastRequestTime = 0;

  constructor(maxConcurrent = 10, minIntervalMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minIntervalMs;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (this.activeRequests < this.maxConcurrent && timeSinceLastRequest >= this.minInterval) {
          this.activeRequests++;
          this.lastRequestTime = now;
          resolve();
        } else {
          this.queue.push(tryAcquire);
          const waitTime = Math.max(this.minInterval - timeSinceLastRequest, 50);
          setTimeout(() => {
            const idx = this.queue.indexOf(tryAcquire);
            if (idx !== -1) {
              this.queue.splice(idx, 1);
              tryAcquire();
            }
          }, waitTime);
        }
      };
      tryAcquire();
    });
  }

  release(): void {
    this.activeRequests--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) setTimeout(next, 0);
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
  }

  getActiveRequests(): number {
    return this.activeRequests;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

const globalRateLimiter = new RateLimiter(10, 100);

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: any): boolean {
  if (error.name === 'AbortError') return false;
  if (error.code === 'ECONNREFUSED') return true;
  if (error.code === 'ECONNRESET') return true;
  if (error.code === 'ETIMEDOUT') return true;
  if (error.code === 'ENOTFOUND') return false;
  return true;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.substring(0, 50);
  }
}

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const startTime = Date.now();
  const method = options.method || 'GET';
  const domain = extractDomain(url);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    const duration = Date.now() - startTime;
    httpStats.log({
      timestamp: new Date(),
      url: domain,
      method,
      status: 'success',
      statusCode: response.status,
      duration,
    });
    
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const isTimeout = error.name === 'AbortError';
    
    httpStats.log({
      timestamp: new Date(),
      url: domain,
      method,
      status: isTimeout ? 'timeout' : 'error',
      duration,
      errorMessage: error.message,
    });
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  let backoff = INITIAL_BACKOFF;
  const domain = extractDomain(url);
  const method = options.method || 'GET';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetchWithTimeout(url, options);
      
      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        httpStats.log({
          timestamp: new Date(),
          url: domain,
          method,
          status: 'retry',
          statusCode: response.status,
          duration: Date.now() - startTime,
          retryCount: attempt + 1,
        });
        
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
        await sleep(waitTime);
        backoff *= 2;
        continue;
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }
      
      httpStats.log({
        timestamp: new Date(),
        url: domain,
        method,
        status: 'retry',
        duration: 0,
        errorMessage: error.message,
        retryCount: attempt + 1,
      });
      
      await sleep(backoff);
      backoff *= 2;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function fetchWithRateLimit(
  url: string,
  options: FetchOptions = {},
  rateLimiter = globalRateLimiter
): Promise<Response> {
  await rateLimiter.acquire();
  try {
    return await fetchWithRetry(url, options);
  } finally {
    rateLimiter.release();
  }
}

export function createRateLimiter(maxConcurrent: number, minIntervalMs = 100): RateLimiter {
  return new RateLimiter(maxConcurrent, minIntervalMs);
}

export function getGlobalRateLimiterStatus() {
  return {
    activeRequests: globalRateLimiter.getActiveRequests(),
    queueLength: globalRateLimiter.getQueueLength(),
  };
}

export { RateLimiter };
