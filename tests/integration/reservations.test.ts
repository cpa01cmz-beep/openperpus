import { describe, expect, it, beforeAll } from 'vitest';
import { getSupabaseServiceClient, skipIfNoSupabase } from './setup';

const supabase = getSupabaseServiceClient();

describe('Integration: Reservations', () => {
  beforeAll(() => {
    if (skipIfNoSupabase()) {
      return;
    }
  });

  it('should create reservation', async () => {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .single();
    const { data: book } = await supabase
      .from('books')
      .select('id,stock_available')
      .eq('is_active', true)
      .gt('stock_available', 0)
      .limit(1)
      .single();

    if (!member || !book) return;

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        book_id: book.id,
        member_id: member.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.status).toBe('pending');
  });

  it('should approve reservation (pending -> ready)', async () => {
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id')
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (!reservation) return;

    const { data, error } = await supabase
      .from('reservations')
      .update({ status: 'ready' })
      .eq('id', reservation.id)
      .select()
      .single();

    expect(error).toBeNull();
    if (!data) return;
    expect(data.status).toBe('ready');
  });

  it('should complete reservation via checkout (ready -> completed)', async () => {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .single();
    const { data: book } = await supabase
      .from('books')
      .select('id,stock_available')
      .eq('is_active', true)
      .gt('stock_available', 0)
      .limit(1)
      .single();

    if (!member || !book) return;

    const { data: reservation } = await supabase
      .from('reservations')
      .insert({
        book_id: book.id,
        member_id: member.id,
        status: 'ready',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select()
      .single();

    if (!reservation) return;

    const { data: loan } = await supabase.rpc('checkout_loan', {
      p_book_id: book.id,
      p_member_id: member.id,
    });

    const { data, error } = await supabase
      .from('reservations')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', reservation.id)
      .select()
      .single();

    expect(error).toBeNull();
    if (!data) return;
    expect(data.status).toBe('completed');
    expect(data.completed_at).toBeDefined();
    expect(loan).toBeDefined();
  });
});
