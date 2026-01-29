type FetchOptions = RequestInit & {
  timeout?: number;
};

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

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

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      if (isRetryableStatus(response.status) && attempt < maxRetries) {
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

export { RateLimiter };
