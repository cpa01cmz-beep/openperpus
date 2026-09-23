import { describe, expect, it, beforeAll } from 'vitest';
import { getSupabaseServiceClient, skipIfNoSupabase } from './setup';

const supabase = getSupabaseServiceClient();

describe('Integration: Books API', () => {
  beforeAll(() => {
    if (skipIfNoSupabase()) {
      return;
    }
  });

  it('should list books with pagination', async () => {
    const { data, error } = await supabase
      .from('books')
      .select('id,title,slug,stock_total,stock_available')
      .eq('is_active', true)
      .limit(12);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('should get book by slug', async () => {
    const { data: books } = await supabase
      .from('books')
      .select('slug')
      .eq('is_active', true)
      .limit(1);
    const booksArr = books ?? [];
    if (booksArr.length === 0) return;
    const slug = booksArr[0]!.slug;

    const { data, error } = await supabase
      .from('books')
      .select(
        'id,title,slug,author,category_id,rack_id,stock_total,stock_available,categories(*),racks(*)'
      )
      .eq('slug', slug)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.slug).toBe(slug);
  });

  it('should filter books by category', async () => {
    const { data: cats } = await supabase
      .from('categories')
      .select('id,slug')
      .eq('is_active', true)
      .limit(1);
    const catsArr = cats ?? [];
    if (catsArr.length === 0) return;
    const catId = catsArr[0]!.id;

    const { data, error } = await supabase
      .from('books')
      .select('id,title,category_id')
      .eq('category_id', catId)
      .eq('is_active', true);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.every((b) => b.category_id === catId)).toBe(true);
  });

  it('should search books via RPC', async () => {
    const { data, error } = await supabase.rpc('search_books', {
      p_q: 'pemrograman',
      p_limit: 10,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});
