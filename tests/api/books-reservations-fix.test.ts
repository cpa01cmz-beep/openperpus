import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('GAP-1: PUT books/[id] validates via validateBook', () => {
  it('calls validateBook(payload, true) before update', () => {
    const src = read('src/app/api/books/[id]/route.ts');
    expect(
      src.includes('validateBook'),
      'RED: PUT books/[id] missing validateBook import/call'
    ).toBe(true);
    expect(
      src.includes('validateBook(payload, true)') || src.includes('validateBook(payload,true)'),
      'RED: PUT must call validateBook(payload, true) (partial mode, match POST pattern)'
    ).toBe(true);
  });
});

describe('books/route.ts: search via rpc + stock guards', () => {
  it('searches via rpc search_books (not bare ilike .or)', () => {
    const src = read('src/app/api/books/route.ts');
    expect(src.includes('search_books'), 'RED: GET must use rpc search_books').toBe(true);
    expect(
      src.includes(".rpc('search_books'") || src.includes('.rpc("search_books"'),
      'RED: GET must call supabase.rpc(search_books)'
    ).toBe(true);
  });

  it('stock_opname: per-item UUID check + cap items<=100', () => {
    const src = read('src/app/api/books/route.ts');
    expect(src.includes('isUuid'), 'RED: stock_opname must validate per-item UUID via isUuid').toBe(
      true
    );
    expect(src.includes('100'), 'RED: stock_opname must cap items<=100 (422 above)').toBe(true);
    expect(
      /items\.length\s*>\s*100/.test(src),
      'RED: stock_opname must reject items.length > 100 with 422'
    ).toBe(true);
  });

  it('stock_opname: bulk upsert + single audit insert (no per-row await loop)', () => {
    const src = read('src/app/api/books/route.ts');
    const opname = src.slice(src.indexOf('stock_opname'));
    expect(
      opname.includes('.upsert(') || opname.includes('Promise.all'),
      'RED: stock_opname must bulk upsert (or Promise.all limit 5), not sequential per-row update'
    ).toBe(true);
    expect(
      (opname.match(/activity_logs/g) ?? []).length <= 2,
      'RED: stock_opname must do a single audit insert, not per-row inserts'
    ).toBe(true);
  });

  it('bulk DELETE: single audit insert (no per-id loop)', () => {
    const src = read('src/app/api/books/route.ts');
    expect(
      src.includes('for (const id of deletable)'),
      'RED: bulk DELETE still loops per-id audit inserts — must be a single insert'
    ).toBe(false);
  });

  it('POST: Number(stock_total) NaN -> 422', () => {
    const src = read('src/app/api/books/route.ts');
    const post = src.slice(src.indexOf('export async function POST'), src.indexOf('stock_opname'));
    expect(
      /Number\.isInteger\(stock_total\)/.test(post) || /Number\.isNaN/.test(post),
      'RED: POST must reject NaN stock_total with 422'
    ).toBe(true);
  });
});

describe('reservations POST guards', () => {
  it('rejects is_active=false books (410/404)', () => {
    const src = read('src/app/api/reservations/route.ts');
    const post = src.slice(
      src.indexOf('export async function POST'),
      src.indexOf('export async function PUT')
    );
    expect(post.includes('is_active'), 'RED: POST must check book is_active').toBe(true);
    expect(post.includes('410'), 'RED: POST must reject inactive book with 410 Gone').toBe(true);
  });

  it('rejects expires_at<=now with 422', () => {
    const src = read('src/app/api/reservations/route.ts');
    expect(src.includes('Date.now()'), 'RED: POST must compare expires_at against now').toBe(true);
  });

  it('caps notes length + type check', () => {
    const src = read('src/app/api/reservations/route.ts');
    const post = src.slice(
      src.indexOf('export async function POST'),
      src.indexOf('export async function PUT')
    );
    expect(post.includes('500'), 'RED: POST must cap notes length (e.g. 500)').toBe(true);
    expect(
      post.includes('typeof') && post.includes('notes'),
      'RED: POST must type-check notes'
    ).toBe(true);
  });
});
