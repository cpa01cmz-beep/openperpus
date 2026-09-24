export type Err = { message: string; code?: string } | null;
export type Resp = { data?: unknown; error?: Err; count?: number | null };

export type TableBehavior = {
  list?: Resp;
  single?: Resp;
  insert?: Resp;
  update?: Resp;
  delete?: Resp;
  count?: number;
};

const behaviors = new Map<string, TableBehavior>();
const rpcs = new Map<string, Resp>();
let authUser: { id: string } | null = { id: 'user-1' };
let profileRole: string | null = 'admin';
let signUpResult: { data?: { user?: { id: string } | null }; error?: Err } = {
  data: { user: { id: 'new-user-1' } },
  error: null,
};
let signInResult: { data?: { user?: { id: string } | null }; error?: Err } = {
  data: { user: { id: 'user-1' } },
  error: null,
};
let throwFrom: string | null = null;

export function setTable(table: string, b: TableBehavior): void {
  behaviors.set(table, { ...behaviors.get(table), ...b });
}
export function setRpc(name: string, r: Resp): void {
  rpcs.set(name, r);
}
export function setAuthUser(u: { id: string } | null): void {
  authUser = u;
}
export function setProfileRole(role: string | null): void {
  profileRole = role;
}
export function setSignUpResult(r: typeof signUpResult): void {
  signUpResult = r;
}
export function setSignInResult(r: typeof signInResult): void {
  signInResult = r;
}
export function setThrowFrom(table: string | null): void {
  throwFrom = table;
}
export function resetMockDb(): void {
  behaviors.clear();
  rpcs.clear();
  authUser = { id: 'user-1' };
  profileRole = 'admin';
  signUpResult = { data: { user: { id: 'new-user-1' } }, error: null };
  signInResult = { data: { user: { id: 'user-1' } }, error: null };
  throwFrom = null;
}

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'count';

function respond(table: string, mode: Mode): Resp {
  if (throwFrom === table) throw new Error(`mock db down: ${table}`);
  const b = behaviors.get(table) ?? {};
  if (table === 'activity_logs') {
    if (mode === 'select') return b.list ?? { data: [], error: null, count: 0 };
    if (b.insert?.error) return b.insert;
    return { data: null, error: null };
  }
  switch (mode) {
    case 'insert':
      return b.insert ?? { data: { id: 'row-1' }, error: null };
    case 'update':
      return b.update ?? { data: { id: 'row-1' }, error: null };
    case 'upsert':
      return b.insert ?? { data: { id: 'row-1' }, error: null };
    case 'delete':
      return b.delete ?? { data: null, error: null };
    case 'count':
      return { data: null, error: null, count: b.count ?? 0 };
    case 'select':
    default:
      if (b.list) {
        return {
          data: b.list.data ?? [],
          error: b.list.error ?? null,
          count: b.list.count ?? b.count ?? 0,
        };
      }
      return { data: [], error: null, count: b.count ?? 0 };
  }
}

function respondSingle(table: string, lastEq: { col: string; val: unknown } | null): Resp {
  if (throwFrom === table) throw new Error(`mock db down: ${table}`);
  const b = behaviors.get(table) ?? {};
  if (table === 'profiles') {
    if (lastEq && lastEq.val === 'user-1')
      return { data: { role: profileRole ?? 'admin' }, error: null };
    if (b.single) return b.single;
    return { data: { id: 'row-1' }, error: null };
  }
  if (b.single) return b.single;
  if (table === 'library_settings') return { data: { id: 1, name: 'Perpus Uji' }, error: null };
  return { data: { id: 'row-1', is_active: true }, error: null };
}

function makeChain(table: string) {
  let mode: Mode = 'select';
  let lastEq: { col: string; val: unknown } | null = null;
  let insertPayload: Record<string, unknown> = {};
  let updatePayload: Record<string, unknown> = {};
  const c: Record<string, unknown> = {};

  c.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) mode = 'count';
    return c;
  };
  c.insert = (row?: Record<string, unknown>) => {
    mode = 'insert';
    if (row && typeof row === 'object') insertPayload = row as Record<string, unknown>;
    return c;
  };
  c.update = (row?: Record<string, unknown>) => {
    mode = 'update';
    if (row && typeof row === 'object') updatePayload = row as Record<string, unknown>;
    return c;
  };
  c.upsert = (row?: Record<string, unknown>) => {
    mode = 'upsert';
    if (row && typeof row === 'object') insertPayload = row as Record<string, unknown>;
    return c;
  };
  c.delete = () => {
    mode = 'delete';
    return c;
  };
  for (const m of [
    'gt',
    'lt',
    'gte',
    'lte',
    'in',
    'is',
    'or',
    'and',
    'order',
    'limit',
    'range',
    'ilike',
    'match',
    'neq',
  ]) {
    c[m] = () => c;
  }
  c.eq = (col: string, val: unknown) => {
    lastEq = { col, val };
    return c;
  };

  c.single = async () => {
    const b = behaviors.get(table) ?? {};
    if (mode === 'insert' || mode === 'upsert') {
      if (b.insert?.error) return b.insert;
      return { data: { id: 'row-1', ...insertPayload }, error: null };
    }
    if (mode === 'update') {
      if (b.update?.error) return b.update;
      return { data: { id: 'row-1', ...updatePayload }, error: null };
    }
    return respondSingle(table, lastEq);
  };
  c.maybeSingle = async () => {
    const b = behaviors.get(table) ?? {};
    if (mode === 'insert' || mode === 'update') return c.single();
    if (b.single) return b.single;
    if (table === 'library_settings') return { data: { id: 1, name: 'Perpus Uji' }, error: null };
    return { data: null, error: null };
  };

  c.then = (
    onFulfilled?: (v: Resp) => unknown,
    onRejected?: (e: unknown) => unknown
  ): Promise<unknown> => {
    try {
      return Promise.resolve(respond(table, mode)).then(onFulfilled, onRejected);
    } catch (e) {
      return Promise.reject(e).then(onFulfilled, onRejected);
    }
  };

  return c;
}

export function installMockSupabase(): Record<string, unknown> {
  const client = {
    auth: {
      getUser: async () =>
        authUser
          ? { data: { user: { id: authUser.id, email: 'user@example.com' } }, error: null }
          : { data: { user: null }, error: null },
      signUp: async () => signUpResult,
      signInWithPassword: async () => signInResult,
    },
    from: (table: string) => makeChain(table),
    rpc: async (name: string) => rpcs.get(name) ?? { data: null, error: null },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'covers/demo.png' }, error: null }),
        getPublicUrl: () => ({
          data: { publicUrl: 'https://demo.supabase.co/storage/v1/object/public/covers/demo.png' },
        }),
      }),
    },
  };
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = client;
  return client;
}

export function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}

export function jsonReq(method: string, url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function badJsonReq(method: string, url: string): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
}

export async function errCode(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code;
}
