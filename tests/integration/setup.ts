import { vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[tests/integration] TEST_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL not set — integration tests will be skipped'
  );
}

export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY required for integration tests');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export function getSupabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY required for integration tests'
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => getSupabaseServiceClient(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => getSupabaseClient(),
}));

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => getSupabaseClient(),
}));

vi.setConfig({ testTimeout: 60000 });

// Skip helper — use in describe.skipIf or test.skipIf
export const skipIfNoSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('[tests/integration] Skipping — Supabase credentials not configured');
    return true;
  }
  return false;
};
