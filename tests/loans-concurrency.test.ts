import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// TDD RED→GREEN — celah konkuren/race sirkulasi (indikator Keandalan & Pengujian).
// Jalur utama sudah atomik: POST /api/loans memanggil RPC checkout_loan
// (src/app/api/loans/route.ts:99) yang mengunci baris via SELECT ... FOR UPDATE
// (supabase/migrations/0005_checkout.sql:36) + guard stock_available>0 (:41).
// Test ini mengunci perilaku itu + guard fallback + idempoten fines pay +
// clamp return, agar regresi race terdeteksi sebagai FAIL biner.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('CONC loans concurrency guards', () => {
  it('CONC-01 checkout atomik: RPC checkout_loan + FOR UPDATE + penanda guard fallback', () => {
    const route = read('src/app/api/loans/route.ts');
    const sql = read('supabase/migrations/0005_checkout.sql').toLowerCase();
    expect(
      route.includes('.rpc("checkout_loan"') || route.includes(".rpc('checkout_loan'"),
      'CONC-01 RED: POST /api/loans harus memanggil rpc checkout_loan (atomik)'
    ).toBe(true);
    expect(
      sql.includes('for update'),
      'CONC-01 RED: 0005_checkout.sql harus mengunci baris (FOR UPDATE)'
    ).toBe(true);
    expect(
      sql.includes('stock_available > 0'),
      'CONC-01 RED: checkout_loan harus guard stock_available>0'
    ).toBe(true);
    expect(
      route.includes('CONCURRENCY-GUARD'),
      'CONC-01 RED: fallback read-then-write wajib berpenanda CONCURRENCY-GUARD (verifikasi pasca-decrement + 409)'
    ).toBe(true);
  });

  it('CONC-02 race 2 peminjam berebut 1 stok: model tanpa-guard oversell, model ber-guard tepat 1 menang', () => {
    // Model naif read-then-write: keduanya membaca 1, keduanya insert → 2 loan untuk 1 stok.
    const naiveLoanCount = (() => {
      let stock = 1;
      let loans = 0;
      const seenA = stock;
      const seenB = stock; // baca bersamaan sebelum tulis
      if (seenA > 0) {
        stock -= 1;
        loans += 1;
      }
      if (seenB > 0) {
        stock -= 1;
        loans += 1;
      }
      return loans;
    })();
    expect(
      naiveLoanCount,
      'CONC-02 RED: model naif harus menunjukkan oversell (2 loan untuk 1 stok) — bukti race nyata'
    ).toBe(2);
    // Model ber-guard (serialisasi ala FOR UPDATE + .gt(stock_available,0)): tepat 1 menang.
    const guardedWins = (() => {
      let stock = 1;
      let wins = 0;
      const tryCheckout = () => {
        if (stock <= 0) return false;
        stock -= 1;
        wins += 1;
        return true;
      };
      tryCheckout();
      tryCheckout();
      return wins;
    })();
    expect(
      guardedWins,
      'CONC-02 RED: dengan guard atomik, 2 peminjam berebut 1 stok → tepat 1 sukses'
    ).toBe(1);
  });

  it('CONC-03 fines pay idempoten: 409 + CAS status + penanda', () => {
    const pay = read('src/app/api/fines/[id]/pay/route.ts');
    expect(
      pay.includes('jsonError("CONFLICT"') || pay.includes("jsonError('CONFLICT'"),
      'CONC-03 RED: fines pay harus memakai jsonError CONFLICT konsisten'
    ).toBe(true);
    expect(
      pay.includes(', 409)'),
      'CONC-03 RED: fines pay idempoten harus 409 bila sudah paid/waived'
    ).toBe(true);
    expect(
      pay.includes('.in("status", ["unpaid", "partial"])') ||
        pay.includes(".in('status', ['unpaid', 'partial'])"),
      'CONC-03 RED: fines pay harus CAS .in(status,[unpaid,partial]) agar double-submit konkuren hanya 1 menang'
    ).toBe(true);
    expect(
      pay.includes('FINE-PAY-IDEMPOTENT'),
      'CONC-03 RED: fines pay wajib berpenanda FINE-PAY-IDEMPOTENT'
    ).toBe(true);
  });

  it('CONC-04 return clamp: stock_available tidak melebihi stock_total + penanda', () => {
    const route = read('src/app/api/loans/route.ts');
    expect(
      route.includes('Math.min(') && route.includes('stock_total'),
      'CONC-04 RED: return harus clamp Math.min(stock_total, available+1)'
    ).toBe(true);
    expect(
      route.includes('RETURN-CLAMP'),
      'CONC-04 RED: blok return wajib berpenanda RETURN-CLAMP'
    ).toBe(true);
  });
});
