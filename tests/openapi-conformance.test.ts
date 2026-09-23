import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

// I6 API contract conformance (bidirectional): openapi.yaml must mirror the
// route modules under src/app/api — path/method parity, security parity with
// the actual auth gates in handlers, and the concrete response/error shapes
// those handlers emit. Spec-side fixes preferred over route changes.

type Obj = Record<string, unknown>;
type Spec = {
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, Obj>;
    parameters: Record<string, Obj>;
    securitySchemes: Record<string, Obj>;
  };
};

const ROOT = process.cwd();
const RAW_SPEC = readFileSync(join(ROOT, 'openapi.yaml'), 'utf8');
const SPEC = parse(RAW_SPEC) as Spec;
const HTTP = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP)[number];

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkRouteFiles(p));
    else if (e.name === 'route.ts') out.push(p);
  }
  return out.sort();
}

const ROUTE_FILES = walkRouteFiles(join(ROOT, 'src/app/api'));

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function relRoute(f: string): string {
  return f.slice(ROOT.length + 1);
}

function specPathOf(routeFile: string): string {
  return (
    '/' +
    relRoute(routeFile)
      .replace(/^src\/app\//, '')
      .replace(/\/route\.ts$/, '')
      .replace(/\[([^\]]+)\]/g, '{$1}')
  );
}

function exportedMethods(src: string): HttpMethod[] {
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const out: HttpMethod[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!.toLowerCase() as HttpMethod);
  return out;
}

/** Auth-gate level actually enforced by a handler, derived from its source:
 * required  = unconditional requireStaff()/getSession()/auth.getUser()
 * optional  = gated only under ?all=1/?id= staff elevation or maybeStaff
 * none      = public (RLS or no gate). */
type AuthLevel = 'none' | 'optional' | 'required';
const AUTH_RE = /await\s+requireStaff\s*\(|await\s+getSession\s*\(|\.auth\.getUser\s*\(/;

function functionRegions(src: string): Map<string, string> {
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const found: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) found.push({ name: m[1]!, start: m.index });
  const map = new Map<string, string>();
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1]!.start : src.length;
    map.set(found[i]!.name, src.slice(found[i]!.start, end));
  }
  return map;
}

function methodRegion(src: string, method: string): string {
  const re = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
  const m = re.exec(src);
  if (!m) return '';
  const next = /export\s+async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/g;
  next.lastIndex = m.index + m[0].length;
  const n = next.exec(src);
  return src.slice(m.index, n ? n.index : src.length);
}

function precededByIf(text: string, index: number): boolean {
  return text
    .slice(0, index)
    .split('\n')
    .slice(-3)
    .some((line) => /^\s*if\s*\(/.test(line));
}

function scanAuth(body: string): { conditional: boolean }[] {
  const lines = body.split('\n');
  const hits: { conditional: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!AUTH_RE.test(line)) continue;
    const prev = [lines[i - 1] ?? '', lines[i - 2] ?? '', lines[i - 3] ?? ''];
    const inIf = prev.some((p) => /^\s*if\s*\(/.test(p));
    const maybe = /\b\w*[Mm]aybe\w*\b/.test(line);
    hits.push({ conditional: inIf || maybe });
  }
  return hits;
}

function classifyAuth(src: string, method: string): AuthLevel {
  const fns = functionRegions(src);
  const queue: { body: string; weakened: boolean }[] = [
    { body: methodRegion(src, method), weakened: false },
  ];
  const seen = new Set<string>([method]);
  let required = false;
  let optional = false;
  while (queue.length > 0) {
    const item = queue.shift()!;
    for (const hit of scanAuth(item.body)) {
      if (hit.conditional || item.weakened) optional = true;
      else required = true;
    }
    const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(item.body))) {
      const name = m[1]!;
      if (!fns.has(name) || seen.has(name)) continue;
      seen.add(name);
      queue.push({
        body: fns.get(name)!,
        weakened: item.weakened || precededByIf(item.body, m.index),
      });
    }
  }
  if (required) return 'required';
  if (optional) return 'optional';
  return 'none';
}

function resolve(node: unknown, depth = 0): Obj {
  if (depth > 10 || typeof node !== 'object' || node === null) return {};
  const obj = node as Obj;
  const ref = obj['$ref'];
  if (typeof ref === 'string') {
    let cur: unknown = SPEC;
    for (const part of ref.replace(/^#\//, '').split('/')) {
      cur = typeof cur === 'object' && cur !== null ? (cur as Obj)[part] : undefined;
    }
    return resolve(cur, depth + 1);
  }
  return obj;
}

function op(pathKey: string, method: HttpMethod): Obj {
  const o = SPEC.paths[pathKey]?.[method];
  if (typeof o !== 'object' || o === null) {
    throw new Error(`missing operation ${method.toUpperCase()} ${pathKey} in openapi.yaml`);
  }
  return o as Obj;
}

function responseJson(o: Obj, status: string): Obj {
  const responses = o['responses'] as Record<string, unknown>;
  const res = responses[status] as Obj;
  const content = res?.['content'] as Obj | undefined;
  const app = content?.['application/json'] as Obj | undefined;
  return resolve(app?.['schema']);
}

function requestJsonSchema(o: Obj): Obj {
  const body = o['requestBody'] as Obj | undefined;
  const content = body?.['content'] as Obj | undefined;
  const app = content?.['application/json'] as Obj | undefined;
  return resolve(app?.['schema']);
}

function requiredOf(schema: Obj): string[] {
  return Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
}

function propsOf(schema: Obj): Record<string, Obj> {
  return (schema['properties'] as Record<string, Obj> | undefined) ?? {};
}

function securityOf(o: Obj): unknown[] | undefined {
  const s = o['security'];
  return Array.isArray(s) ? (s as unknown[]) : undefined;
}

// Server-emitted error codes only (client-only union types excluded).
function usedErrorCodes(): Set<string> {
  const files = [
    'src/middleware.ts',
    'src/lib/http-error.ts',
    'src/lib/session.ts',
    'src/lib/returnLoan.ts',
    'src/lib/extendLoan.ts',
    'src/lib/legacyReturn.ts',
    'src/lib/supabase/auth.ts',
    ...ROUTE_FILES.map(relRoute),
  ];
  const codes = new Set<string>();
  for (const f of files) {
    const text = readSrc(f);
    for (const re of [/jsonError\(\s*'([A-Z_]+)'/g, /code:\s*'([A-Z_]+)'/g]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) codes.add(m[1]!);
    }
  }
  return codes;
}

describe('openapi path/method parity', () => {
  it('mirrors all 31 route modules in both directions', () => {
    const routePaths = new Set(ROUTE_FILES.map(specPathOf));
    const specPaths = new Set(Object.keys(SPEC.paths));
    expect(ROUTE_FILES).toHaveLength(31);
    expect([...routePaths].filter((p) => !specPaths.has(p))).toEqual([]);
    expect([...specPaths].filter((p) => !routePaths.has(p))).toEqual([]);
  });

  it('declares exactly the methods each route module exports', () => {
    const mismatches: string[] = [];
    for (const f of ROUTE_FILES) {
      const p = specPathOf(f);
      const actual = exportedMethods(readSrc(relRoute(f))).sort();
      const declared = HTTP.filter((m) => SPEC.paths[p]?.[m] !== undefined).sort();
      if (JSON.stringify(actual) !== JSON.stringify(declared)) {
        mismatches.push(`${p}: route=[${actual}] spec=[${declared}]`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('readyz contract', () => {
  const readyz = readSrc('src/app/api/readyz/route.ts');

  it('documents 200 as {ready, checks} matching the handler', () => {
    const schema = responseJson(op('/api/readyz', 'get'), '200');
    expect(requiredOf(schema).sort()).toEqual(['checks', 'ready']);
    expect(propsOf(schema)['ready']?.['type']).toBe('boolean');
    expect(propsOf(schema)['checks']?.['type']).toBe('object');
    expect(readyz).toContain('ready: true');
    expect(readyz).toContain('checks:');
  });

  it('documents 503 as the ready:false shape (not ErrorResponse)', () => {
    const schema = responseJson(op('/api/readyz', 'get'), '503');
    expect(requiredOf(schema).sort()).toEqual(['checks', 'ready']);
    expect(propsOf(schema)['ready']?.['enum']).toEqual([false]);
    const checks = propsOf(schema)['checks'] as Obj;
    expect(requiredOf(checks)).toContain('supabase');
    expect(propsOf(checks)['detail']).toBeDefined();
    expect(readyz).toContain('ready: false');
  });
});

describe('articles contract', () => {
  const articles = readSrc('src/app/api/articles/route.ts');

  it('GET 200 is {data, meta, pagination} with the actual inner keys', () => {
    const schema = responseJson(op('/api/articles', 'get'), '200');
    expect(requiredOf(schema).sort()).toEqual(['data', 'meta', 'pagination']);
    const meta = propsOf(schema)['meta'] as Obj;
    expect(requiredOf(meta).sort()).toEqual(['page', 'per_page', 'total']);
    const pagination = propsOf(schema)['pagination'] as Obj;
    expect(requiredOf(pagination).sort()).toEqual(['limit', 'page', 'total', 'totalPages']);
    expect(articles).toContain('meta: { page, per_page: perPage, total }');
    expect(articles).toContain('pagination: { page, limit: perPage, total, totalPages');
  });

  it('GET per_page defaults to 10 like parsePaging in the handler', () => {
    const perPage = SPEC.components.parameters['PerPageParam'] as Obj;
    expect(((perPage['schema'] as Obj) ?? {})['default']).toBe(10);
    expect(articles).toContain('parsePaging(req.url, 10)');
  });

  it('POST body: title+content_md required, slug optional/auto, status default draft with archived', () => {
    const schema = requestJsonSchema(op('/api/articles', 'post'));
    const required = requiredOf(schema);
    expect(required).toContain('title');
    expect(required).toContain('content_md');
    expect(required).not.toContain('slug');
    expect(required).not.toContain('status');
    expect(propsOf(schema)['content_md']).toBeDefined();
    const status = propsOf(schema)['status'] as Obj;
    expect(status['default']).toBe('draft');
    const statusMatch = /const STATUSES = \[([^\]]+)\]/.exec(articles);
    expect(statusMatch).not.toBeNull();
    const sourceStatuses = (statusMatch![1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    expect(status['enum']).toEqual(sourceStatuses);
    expect(articles).toContain("?? 'draft'");
    expect(articles).toContain('slugify(title)');
  });

  it('POST 201 wraps the row as {data} and Article models content_md', () => {
    const schema = responseJson(op('/api/articles', 'post'), '201');
    expect(requiredOf(schema)).toContain('data');
    const data = resolve(propsOf(schema)['data']);
    expect(requiredOf(data)).toContain('content_md');
    expect(propsOf(data)['content']).toBeUndefined();
    expect(articles).toContain('NextResponse.json({ data }, { status: 201 })');
  });
});

describe('ErrorResponse contract', () => {
  it('keeps details as a sibling of error, like http-error.ts emits', () => {
    const schema = SPEC.components.schemas['ErrorResponse'] as Obj;
    expect(propsOf(schema)['details']).toBeDefined();
    const error = propsOf(schema)['error'] as Obj;
    expect(propsOf(error)['details']).toBeUndefined();
    expect(requiredOf(error).sort()).toEqual(['code', 'message']);
    const helper = readSrc('src/lib/http-error.ts');
    expect(helper).toContain('{ error: { code, message }, details }');
  });

  it('enum covers every server-emitted code', () => {
    const schema = SPEC.components.schemas['ErrorResponse'] as Obj;
    const error = propsOf(schema)['error'] as Obj;
    const code = propsOf(error)['code'] as Obj;
    const enumValues = (code['enum'] as string[]) ?? [];
    const used = [...usedErrorCodes()].sort();
    expect(used.length).toBeGreaterThan(0);
    expect(enumValues).toEqual(expect.arrayContaining(used));
    for (const c of ['SPAM_DETECTED', 'RATE_LIMITED', 'GONE', 'BAD_REQUEST']) {
      expect(enumValues).toContain(c);
    }
  });
});

describe('security contract', () => {
  it('declares BearerAuth schemes', () => {
    expect(SPEC.components.securitySchemes['BearerAuth']).toBeDefined();
  });

  it('matches each handler auth gate: required/optional/none', () => {
    const mismatches: string[] = [];
    for (const f of ROUTE_FILES) {
      const p = specPathOf(f);
      const src = readSrc(relRoute(f));
      for (const method of exportedMethods(src)) {
        const expected = classifyAuth(src, method.toUpperCase());
        const declared = securityOf(op(p, method)) ?? [];
        const hasBearer = declared.some(
          (r) => typeof r === 'object' && r !== null && 'BearerAuth' in (r as Obj)
        );
        const hasAnon = declared.some(
          (r) => typeof r === 'object' && r !== null && Object.keys(r as Obj).length === 0
        );
        const ok =
          expected === 'required'
            ? hasBearer && !hasAnon
            : expected === 'optional'
              ? hasBearer && hasAnon
              : declared.length === 0;
        if (!ok) {
          mismatches.push(
            `${method.toUpperCase()} ${p}: handler=${expected} spec=${JSON.stringify(declared)}`
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('metrics contract', () => {
  it('documents 401 and 500 which the handler emits', () => {
    const o = op('/api/metrics', 'get');
    const responses = o['responses'] as Record<string, unknown>;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '401', '500']));
    const src = readSrc('src/app/api/metrics/route.ts');
    expect(src).toContain('status: 401');
    expect(src).toContain("code: 'UNAUTHORIZED'");
    expect(src).toContain('status: 500');
    expect(src).toContain("code: 'INTERNAL'");
  });
});

describe('banner contract', () => {
  it('models link (the migrated column), not link_url', () => {
    const banner = SPEC.components.schemas['Banner'] as Obj;
    expect(propsOf(banner)['link']).toBeDefined();
    expect(propsOf(banner)['link_url']).toBeUndefined();
    const src = readSrc('src/app/api/banners/route.ts');
    expect(src).toContain("'id,title,image_url,link,sort_order,is_active,created_at'");
  });
});

describe('loans PUT contract', () => {
  it('accepts action: extend|return like the handler dispatches', () => {
    for (const p of ['/api/loans', '/api/loans/{id}']) {
      const schema = requestJsonSchema(op(p, 'put'));
      expect(requiredOf(schema)).toContain('action');
      expect(propsOf(schema)['action']?.['enum']).toEqual(['extend', 'return']);
    }
    const src = readSrc('src/app/api/loans/route.ts');
    expect(src).toContain("body.action === 'extend'");
    expect(src).toContain("body.action !== 'return'");
  });
});

describe('component schemas', () => {
  it('has no dead (unreachable-from-paths) schemas', () => {
    const reachable = new Set<string>();
    const queue: unknown[] = [SPEC.paths];
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
      } else if (typeof node === 'object' && node !== null) {
        const obj = node as Obj;
        const ref = obj['$ref'];
        if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) {
          const name = ref.split('/').pop()!;
          if (!reachable.has(name)) {
            reachable.add(name);
            queue.push(SPEC.components.schemas[name]);
          }
        }
        queue.push(...Object.values(obj));
      }
    }
    expect(Object.keys(SPEC.components.schemas).filter((n) => !reachable.has(n))).toEqual([]);
  });
});
