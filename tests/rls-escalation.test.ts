import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('T-S3 RLS hardening migration', () => {
  it('0003_hardening.sql strips role escalation + log spoofing + member status', () => {
    const p = join(process.cwd(), 'supabase/migrations/0003_hardening.sql');
    expect(existsSync(p), 'T-S3 RED: supabase/migrations/0003_hardening.sql absent — profiles role escalation + activity_logs spoof + members status holes from 0002_rls.sql unpatched').toBe(true);
    const sql = readFileSync(p, 'utf8').toLowerCase();
    expect(sql.includes('trigger') && sql.includes('profiles'), 'T-S3 RED: hardening must contain a profiles role-strip trigger').toBe(true);
    expect(sql.includes('activity_logs') && sql.includes('auth.uid'), 'T-S3 RED: hardening must contain an activity_logs actor check (auth.uid)').toBe(true);
    expect(sql.includes('members') && sql.includes('is_staff'), 'T-S3 RED: hardening must contain members staff-only status guard').toBe(true);
  });
});
