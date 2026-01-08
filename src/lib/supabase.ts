import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Edge function URLs
export const getEdgeFunctionUrl = (functionName: string): string => {
  return `${supabaseUrl}/functions/v1/${functionName}`;
};
