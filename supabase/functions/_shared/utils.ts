/**
 * Enterprise-grade shared utilities for edge functions
 * Includes: Retry logic, Idempotency, Caching, Structured Logging, Rate Limiting
 */

// ============= STRUCTURED LOGGING =============

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  function: string;
  requestId: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
}

export class Logger {
  private functionName: string;
  private requestId: string;
  private startTime: number;

  constructor(functionName: string, requestId?: string) {
    this.functionName = functionName;
    this.requestId = requestId || crypto.randomUUID();
    this.startTime = Date.now();
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      function: this.functionName,
      requestId: this.requestId,
      message,
      data,
      duration: Date.now() - this.startTime,
    };
    
    const logStr = JSON.stringify(entry);
    
    switch (level) {
      case 'error':
        console.error(logStr);
        break;
      case 'warn':
        console.warn(logStr);
        break;
      default:
        console.log(logStr);
    }
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data);
  }

  getRequestId() {
    return this.requestId;
  }
}

// ============= RETRY WITH EXPONENTIAL BACKOFF =============

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'retryableErrors'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if we should retry
      const isRetryable = 
        opts.retryableErrors?.some(e => lastError!.message.includes(e)) ||
        (lastError as any).status && opts.retryableStatuses.includes((lastError as any).status);

      if (attempt > opts.maxRetries || !isRetryable) {
        throw lastError;
      }

      // Calculate delay with jitter
      const baseDelay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
      const delayMs = Math.min(baseDelay + jitter, opts.maxDelayMs);

      opts.onRetry?.(attempt, lastError, delayMs);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// Retry wrapper for fetch with status code handling
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, init);
    
    // Throw for retryable status codes
    if (!response.ok && (options?.retryableStatuses || DEFAULT_RETRY_OPTIONS.retryableStatuses).includes(response.status)) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      throw error;
    }
    
    return response;
  }, options);
}

// ============= IDEMPOTENCY =============

interface IdempotencyEntry {
  key: string;
  result: unknown;
  createdAt: number;
  expiresAt: number;
}

// In-memory idempotency cache (per edge function instance)
const idempotencyCache = new Map<string, IdempotencyEntry>();

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function generateIdempotencyKey(...parts: (string | number | undefined)[]): string {
  const content = parts.filter(Boolean).join(':');
  return `idem:${content}`;
}

export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = IDEMPOTENCY_TTL_MS
): Promise<{ result: T; cached: boolean }> {
  // Check cache first
  const cached = idempotencyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { result: cached.result as T, cached: true };
  }

  // Execute function
  const result = await fn();

  // Cache result
  idempotencyCache.set(key, {
    key,
    result,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });

  // Cleanup expired entries (simple LRU-like cleanup)
  if (idempotencyCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) {
      if (v.expiresAt < now) {
        idempotencyCache.delete(k);
      }
    }
  }

  return { result, cached: false };
}

// ============= IN-MEMORY CACHING =============

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  
  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  
  // Cleanup if cache gets too large
  if (memoryCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of memoryCache) {
      if (v.expiresAt < now) {
        memoryCache.delete(k);
      }
    }
  }
}

export function cacheDelete(key: string): boolean {
  return memoryCache.delete(key);
}

// ============= RATE LIMITING =============

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  if (entry.count >= maxRequests) {
    const resetAt = entry.windowStart + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.windowStart + windowMs,
  };
}

// ============= CORS HEADERS =============

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

// ============= ERROR HANDLING =============

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    status: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export function createErrorResponse(
  error: Error | AppError,
  requestId?: string
): Response {
  const isAppError = error instanceof AppError;
  const status = isAppError ? error.status : 500;
  const body = isAppError
    ? error.toJSON()
    : {
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };

  return new Response(JSON.stringify({ ...body, requestId }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============= REQUEST VALIDATION =============

export function validateRequired(
  data: Record<string, unknown>,
  fields: string[]
): void {
  const missing = fields.filter(f => !data[f]);
  if (missing.length > 0) {
    throw new AppError(
      `Missing required fields: ${missing.join(', ')}`,
      'VALIDATION_ERROR',
      400
    );
  }
}
