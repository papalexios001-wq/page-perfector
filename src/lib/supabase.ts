import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Create client only if credentials are available
export const supabase: SupabaseClient | null = 
  supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// Get edge function URL - works even without full Supabase client
export const getEdgeFunctionUrl = (functionName: string): string => {
  if (!supabaseUrl) {
    throw new Error('Backend runtime not configured. Please connect Lovable Cloud first.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

// Enterprise-grade edge function invocation using supabase.functions.invoke
export interface EdgeFunctionResult<T = unknown> {
  data: T | null;
  error: EdgeFunctionError | null;
}

export interface EdgeFunctionError {
  message: string;
  code?: string;
  status?: number;
}

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<EdgeFunctionResult<T>> {
  if (!supabase) {
    return {
      data: null,
      error: {
        message: 'Backend runtime not configured. Please connect Lovable Cloud to enable this feature.',
        code: 'BACKEND_NOT_CONFIGURED',
      },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

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
