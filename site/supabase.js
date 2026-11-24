import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  'https://akqgreudoxhzxsxvvath.supabase.co',
  'sb_publishable_MqkhkxZ9ptqBhT3kM0YhzQ_PZSMNZOu',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
