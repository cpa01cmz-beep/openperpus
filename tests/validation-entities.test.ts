import { describe, expect, it } from 'vitest';

// Keandalan & Pengujian — validation-entities: safeParse/parse for
// member/loan/reservation/fine schemas (no schema edits, tests only).
// RED-first: schemas already exist in src/lib/validation.ts:57-192.

import { memberSchema, loanSchema, reservationSchema, fineSchema } from '@/lib/validation';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('validation-entities member', () => {
  it('member valid safeParse success', () => {
    const r = memberSchema.safeParse({ user_id: UUID, member_code: 'M-001' });
    expect(r.success).toBe(true);
  });

  it('member user_id bukan UUID → gagal', () => {
    const r = memberSchema.safeParse({ user_id: 'bad', member_code: 'M-001' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('user_id');
  });

  it('member member_code kosong → gagal', () => {
    const r = memberSchema.safeParse({ user_id: UUID, member_code: '  ' });
    expect(r.success).toBe(false);
  });

  it('member status invalid → gagal + partial lolos tanpa status', () => {
    expect(
      memberSchema.safeParse({ user_id: UUID, member_code: 'M-1', status: 'gold' }).success
    ).toBe(false);
    expect(memberSchema.safeParse({ status: 'suspended' }, true).success).toBe(true);
  });

  it('member phone/address batas panjang + join_date ISO', () => {
    expect(memberSchema.safeParse({ phone: 'x'.repeat(31) }, true).success).toBe(false);
    expect(memberSchema.safeParse({ address: 'x'.repeat(501) }, true).success).toBe(false);
    expect(memberSchema.safeParse({ join_date: 'bukan-tanggal' }, true).success).toBe(false);
    expect(memberSchema.safeParse({ join_date: '2026-01-01' }, true).success).toBe(true);
  });

  it('member parse melempar saat invalid, mengembalikan data saat valid', () => {
    expect(() => memberSchema.parse({ user_id: 'bad', member_code: 'M-1' })).toThrow();
    const d = memberSchema.parse({ user_id: UUID, member_code: 'M-1' });
    expect(d.member_code).toBe('M-1');
  });

  it('member non-objek → gagal', () => {
    expect(memberSchema.safeParse(null).success).toBe(false);
    expect(memberSchema.safeParse('M-1').success).toBe(false);
  });
});

describe('validation-entities loan', () => {
  it('loan valid safeParse success', () => {
    const r = loanSchema.safeParse({ book_id: UUID, member_id: UUID2 });
    expect(r.success).toBe(true);
  });

  it('loan book_id/member_id bukan UUID → gagal', () => {
    expect(loanSchema.safeParse({ book_id: 'bad', member_id: UUID2 }).success).toBe(false);
    expect(loanSchema.safeParse({ book_id: UUID, member_id: 'bad' }).success).toBe(false);
  });

  it('loan tanggal invalid → gagal', () => {
    expect(loanSchema.safeParse({ borrowed_at: 'kapan' }, true).success).toBe(false);
    expect(loanSchema.safeParse({ due_at: 'kapan' }, true).success).toBe(false);
    expect(loanSchema.safeParse({ returned_at: 'kapan' }, true).success).toBe(false);
    expect(
      loanSchema.safeParse({ borrowed_at: '2026-01-01', due_at: '2026-01-15' }, true).success
    ).toBe(true);
  });

  it('loan status + fine_amount + notes batas', () => {
    expect(loanSchema.safeParse({ status: 'hilang' }, true).success).toBe(false);
    expect(loanSchema.safeParse({ status: 'borrowed' }, true).success).toBe(true);
    expect(loanSchema.safeParse({ fine_amount: -1 }, true).success).toBe(false);
    expect(loanSchema.safeParse({ notes: 'x'.repeat(2001) }, true).success).toBe(false);
  });

  it('loan parse melempar saat invalid', () => {
    expect(() => loanSchema.parse({ book_id: 'bad', member_id: UUID2 })).toThrow();
  });
});

describe('validation-entities reservation', () => {
  it('reservation valid safeParse success', () => {
    expect(reservationSchema.safeParse({ book_id: UUID, member_id: UUID2 }).success).toBe(true);
  });

  it('reservation UUID invalid → gagal', () => {
    expect(reservationSchema.safeParse({ book_id: 'bad', member_id: UUID2 }).success).toBe(false);
  });

  it('reservation status enum ketat', () => {
    expect(reservationSchema.safeParse({ status: 'waiting' }, true).success).toBe(false);
    for (const s of ['pending', 'ready', 'completed', 'cancelled', 'expired']) {
      expect(reservationSchema.safeParse({ status: s }, true).success).toBe(true);
    }
  });

  it('reservation tanggal + notes batas', () => {
    expect(reservationSchema.safeParse({ reserved_at: 'xxx' }, true).success).toBe(false);
    expect(reservationSchema.safeParse({ expires_at: 'xxx' }, true).success).toBe(false);
    expect(reservationSchema.safeParse({ notes: 'x'.repeat(2001) }, true).success).toBe(false);
  });

  it('reservation parse melempar saat invalid', () => {
    expect(() => reservationSchema.parse({ book_id: 'bad', member_id: UUID2 })).toThrow();
  });
});

describe('validation-entities fine', () => {
  it('fine valid safeParse success', () => {
    expect(fineSchema.safeParse({ loan_id: UUID, member_id: UUID2, amount: 5000 }).success).toBe(
      true
    );
  });

  it('fine UUID invalid → gagal', () => {
    expect(fineSchema.safeParse({ loan_id: 'bad', member_id: UUID2, amount: 1 }).success).toBe(
      false
    );
    expect(fineSchema.safeParse({ loan_id: UUID, member_id: 'bad', amount: 1 }).success).toBe(
      false
    );
  });

  it('fine amount/paid_amount negatif → gagal, nol lolos', () => {
    expect(fineSchema.safeParse({ amount: -1 }, true).success).toBe(false);
    expect(fineSchema.safeParse({ paid_amount: -1 }, true).success).toBe(false);
    expect(fineSchema.safeParse({ loan_id: UUID, member_id: UUID2, amount: 0 }).success).toBe(true);
  });

  it('fine status enum ketat', () => {
    expect(fineSchema.safeParse({ status: 'lunas' }, true).success).toBe(false);
    for (const s of ['unpaid', 'partial', 'paid', 'waived']) {
      expect(fineSchema.safeParse({ status: s }, true).success).toBe(true);
    }
  });

  it('fine tanggal + notes batas', () => {
    expect(fineSchema.safeParse({ issued_at: 'xxx' }, true).success).toBe(false);
    expect(fineSchema.safeParse({ paid_at: 'xxx' }, true).success).toBe(false);
    expect(fineSchema.safeParse({ notes: 'x'.repeat(2001) }, true).success).toBe(false);
  });

  it('fine parse melempar saat invalid, non-objek gagal', () => {
    expect(() => fineSchema.parse({ loan_id: UUID, member_id: UUID2, amount: -5 })).toThrow();
    expect(fineSchema.safeParse(null).success).toBe(false);
  });
});
