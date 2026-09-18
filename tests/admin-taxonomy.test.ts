import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

describe("admin taxonomy pages (S1)", () => {
  it("kategori page exists and uses /api/categories", () => {
    const p = "src/app/admin/kategori/page.tsx";
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain("/api/categories");
    expect(src).toContain("confirm(");
  });

  it("rak page exists and uses /api/racks", () => {
    const p = "src/app/admin/rak/page.tsx";
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain("/api/racks");
    expect(src).toContain("confirm(");
  });

  it("menu page exists and uses /api/menus", () => {
    const p = "src/app/admin/menu/page.tsx";
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain("/api/menus");
    expect(src).toContain("confirm(");
  });

  it("Sidebar links the three taxonomy pages", () => {
    const src = read("src/components/admin/Sidebar.tsx");
    expect(src).toContain("/admin/kategori");
    expect(src).toContain("/admin/rak");
    expect(src).toContain("/admin/menu");
  });
});
