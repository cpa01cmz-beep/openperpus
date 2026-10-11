import { vi, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Optional testcontainer support - only activates if @supabase/test-container or testcontainers is installed
let testContainer: {
  stop: () => Promise<void>;
  getUrl: () => string;
  getAnonKey: () => string;
  getServiceKey: () => string;
} | null = null;

async function maybeStartTestContainer() {
  try {
    // Try to load testcontainers dynamically
    const { GenericContainer } = await import('testcontainers');
    const container = await new GenericContainer('supabase/postgres:15.1.0.117')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: 'postgres',
      })
      .start();

    const url = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/postgres`;

    // Return a minimal testcontainer-like interface
    return {
      stop: async () => container.stop(),
      getUrl: () => url,
      getAnonKey: () => 'test-anon-key',
      getServiceKey: () => 'test-service-key',
    };
  } catch {
    // testcontainers not available - use env vars
    return null;
  }
}

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn(
    '[tests/integration] TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY not set — integration tests will be skipped'
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

// Testcontainer lifecycle hooks
beforeAll(async () => {
  testContainer = await maybeStartTestContainer();
  if (testContainer) {
    console.log('[tests/integration] Testcontainer started');
    // Override env for tests using testcontainer
    process.env.TEST_SUPABASE_URL = testContainer.getUrl();
    process.env.TEST_SUPABASE_ANON_KEY = testContainer.getAnonKey();
    process.env.TEST_SUPABASE_SERVICE_KEY = testContainer.getServiceKey();
  }
});

afterAll(async () => {
  if (testContainer) {
    await testContainer.stop();
    console.log('[tests/integration] Testcontainer stopped');
  }
});

// Skip helper — true berarti suite di-skip. Ketiga file suite memakai service
// client, jadi URL + SERVICE_KEY (TEST_SUPABASE_SERVICE_KEY) wajib ada;
// kalau tidak, describe.skipIf men-skip suite alih-alih melempar saat
// koleksi (issue #23).
export const skipIfNoSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log(
      '[tests/integration] Skipping — Supabase credentials (TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_KEY) not configured'
    );
    return true;
  }
  return false;
};
