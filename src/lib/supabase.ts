import { supabase } from '@/integrations/supabase/client';

// Re-export the supabase client
export { supabase };

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
};

// Get edge function URL
export const getEdgeFunctionUrl = (functionName: string): string => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error('Backend runtime not configured. Please connect Lovable Cloud first.');
  }
  return `${url}/functions/v1/${functionName}`;
};

// Enterprise-grade edge function invocation
export interface EdgeFunctionResult<T = unknown> {
  data: T | null;
  error: EdgeFunctionError | null;
}

export interface EdgeFunctionError {
  message: string;
  code?: string;
  status?: number;
}

export interface InvokeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  options?: InvokeOptions
): Promise<EdgeFunctionResult<T>> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: {
        message: 'Backend runtime not configured. Please connect Lovable Cloud to enable this feature.',
        code: 'BACKEND_NOT_CONFIGURED',
      },
    };
  }

  // Setup timeout with AbortController
  const timeoutMs = options?.timeoutMs ?? 90000; // 90 second default
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Combine with any provided signal
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    clearTimeout(timeoutId);

    if (error) {
      return {
        data: null,
        error: {
          message: error.message || 'Edge function error',
          code: 'EDGE_FUNCTION_ERROR',
          status: (error as any).status,
        },
      };
    }

    return { data: data as T, error: null };
  } catch (err) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error(`[invokeEdgeFunction] Timeout for ${functionName} after ${timeoutMs}ms`);
      return {
        data: null,
        error: {
          message: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please try again.`,
          code: 'TIMEOUT_ERROR',
        },
      };
    }

    console.error(`[invokeEdgeFunction] Error calling ${functionName}:`, err);
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Network error',
        code: 'NETWORK_ERROR',
      },
    };
  }
}
