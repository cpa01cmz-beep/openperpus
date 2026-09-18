import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('admin BookForm dropdowns + upload (S1)', () => {
  it('BookForm renders <select> for category/rack (not raw UUID text)', () => {
    const src = readSource('src/components/admin/BookForm.tsx');
    // Must contain a <select> tied to category (any of these shapes counts)
    expect(src).toMatch(/<select[^>]*categor|category_id.*select|options.*categor/i);
    // Must contain a <select> tied to rack
    expect(src).toMatch(/<select[^>]*rack|rack_id.*select|options.*rack/i);
    // UploadInput must be wired in for cover/pdf
    expect(src).toMatch(/UploadInput|onUploaded/i);
  });

  it('UploadInput component exists with library-assets upload + URL fallback', () => {
    const rel = 'src/components/admin/UploadInput.tsx';
    expect(existsSync(join(ROOT, rel))).toBe(true);
    const src = readSource(rel);
    expect(src).toMatch(/library-assets/);
    expect(src).toMatch(/onUploaded/);
    // manual URL paste fallback
    expect(src).toMatch(/<input[^>]*text|placeholder.*https|fallback|manual|URL/i);
    // 10MB + mime guard matching 0003_storage.sql
    expect(src).toMatch(/10485760|10\s*\*?\s*1024|10MB|maxSize/i);
    expect(src).toMatch(/image\/jpeg|image\/png|application\/pdf/i);
    // no alert() — inline error text instead
    expect(src).not.toMatch(/alert\s*\(/);
  });
});
