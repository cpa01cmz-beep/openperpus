import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function collectTsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...collectTsx(full));
    else if (e.endsWith(".tsx") || e.endsWith(".ts")) out.push(full);
  }
  return out;
}

const NATIVE_CONFIRM = /\bconfirm\s*\(/;
const NATIVE_ALERT = /\balert\s*\(/;

/** S-journey-dialogs: member journey never hits native confirm()/alert().
 * RED first: (public)/denda pay uses confirm()/alert(); login is admin-framed
 * "Masuk Admin". GREEN: inline Modal/dialog + member-facing login copy.
 */
describe("S-journey-dialogs no native dialogs in member journey", () => {
  const publicDir = join(ROOT, "src/app/(public)");

  it("public journey has zero native confirm() calls", () => {
    const files = collectTsx(publicDir);
    const offenders = files.filter((f) => NATIVE_CONFIRM.test(readFileSync(f, "utf8")));
    expect(offenders, `native confirm() in journey paths: ${offenders.join(", ")}`).toEqual([]);
  });

  it("public journey has zero native alert() calls", () => {
    const files = collectTsx(publicDir);
    const offenders = files.filter((f) => NATIVE_ALERT.test(readFileSync(f, "utf8")));
    expect(offenders, `native alert() in journey paths: ${offenders.join(", ")}`).toEqual([]);
  });

  it("login page has zero native confirm()/alert() calls", () => {
    const src = read("src/app/login/page.tsx");
    expect(NATIVE_CONFIRM.test(src), "login must not use confirm()").toBe(false);
    expect(NATIVE_ALERT.test(src), "login must not use alert()").toBe(false);
  });
});

describe("S-journey-dialogs member-facing login copy", () => {
  it("login heading welcomes members, not admins-only", () => {
    const src = read("src/app/login/page.tsx");
    expect(src.includes("Masuk Admin"), "login must not be admin-framed").toBe(false);
    expect(src.includes("Masuk Anggota"), "login heading must be member-facing").toBe(true);
    expect(src.includes("Pustakawan"), "login must still welcome pustakawan/staff").toBe(true);
  });
});

describe("S-journey-dialogs inline dialog component", () => {
  it("denda pay confirms via inline Modal/dialog, not confirm()", () => {
    const src = read("src/app/(public)/denda/page.tsx");
    const usesDialog =
      src.includes("<Modal") ||
      src.includes("<dialog") ||
      src.includes('role="dialog"');
    expect(usesDialog, "denda pay must render inline Modal/dialog").toBe(true);
  });

  it("admin peminjaman return confirms via inline Modal/dialog, not confirm()", () => {
    const src = read("src/app/admin/peminjaman/page.tsx");
    expect(NATIVE_CONFIRM.test(src), "peminjaman must not use confirm()").toBe(false);
    expect(NATIVE_ALERT.test(src), "peminjaman must not use alert()").toBe(false);
    const usesDialog =
      src.includes("<Modal") ||
      src.includes("<dialog") ||
      src.includes('role="dialog"');
    expect(usesDialog, "peminjaman return must render inline Modal/dialog").toBe(true);
  });
});
