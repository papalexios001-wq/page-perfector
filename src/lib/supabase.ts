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
    throw new Error('Supabase URL not configured. Please connect Lovable Cloud first.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
};
