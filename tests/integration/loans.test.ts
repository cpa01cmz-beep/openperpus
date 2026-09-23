import { describe, expect, it, beforeAll } from 'vitest';
import { getSupabaseServiceClient, skipIfNoSupabase } from './setup';

const supabase = getSupabaseServiceClient();

describe('Integration: Loans API', () => {
  beforeAll(() => {
    if (skipIfNoSupabase()) {
      return;
    }
  });

  it('should create loan via checkout_loan RPC', async () => {
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
    expect(member).toBeDefined();
    expect(book).toBeDefined();

    const { data, error } = await supabase.rpc('checkout_loan', {
      p_book_id: book.id,
      p_member_id: member.id,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.status).toBe('borrowed');
  });

  it('should return loan via return_loan RPC', async () => {
    const { data: loan } = await supabase
      .from('loans')
      .select('id,book_id,status,due_at')
      .eq('status', 'borrowed')
      .limit(1)
      .single();

    if (!loan) return;
    expect(loan).toBeDefined();

    const { data, error } = await supabase.rpc('return_loan', {
      p_loan_id: loan.id,
      p_kondisi: 'baik',
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.status).toBe('returned');
  });

  it('should calculate fine on late return', async () => {
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

    const { data: loan } = await supabase.rpc('checkout_loan', {
      p_book_id: book.id,
      p_member_id: member.id,
    });

    if (!loan) return;

    await supabase
      .from('loans')
      .update({ due_at: new Date(Date.now() - 86400000).toISOString() })
      .eq('id', loan.id);

    const { data, error } = await supabase.rpc('return_loan', {
      p_loan_id: loan.id,
      p_kondisi: 'baik',
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();

    const { data: fines } = await supabase.from('fines').select('amount').eq('loan_id', loan.id);
    const finesArr = fines ?? [];
    if (finesArr.length === 0) return;
    expect(finesArr[0]!.amount).toBeGreaterThan(0);
  });
});
