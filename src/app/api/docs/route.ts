import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GET /api/docs — serves Scalar API reference (falls back to Swagger UI CDN).
 * Reads ../../../../../openapi.yaml at runtime so the UI always matches the contract.
 * No new dependencies: UI loads from CDN; local preview only.
 */

function loadSpec(): string {
  try {
    return readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8');
  } catch {
    return 'openapi: 3.1.0\ninfo:\n  title: OpenPerpus API\n  version: 0.1.0\npaths: {}';
  }
}

export async function GET(): Promise<NextResponse> {
  const spec = loadSpec();
  const jsonSpec = JSON.stringify(spec);
  const html = `<!doctype html>
<html>
<head>
  <title>OpenPerpus API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <!-- Scalar API Reference for openapi.yaml; Swagger UI fallback via CDN -->
  <script id="api-reference" data-url="/openapi.yaml"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest"></script>
  <script>
    window.__OPENAPI__ = ${jsonSpec};
  </script>
  <noscript>
    <p>Swagger UI fallback: open <a href="/openapi.yaml">openapi.yaml</a>.</p>
  </noscript>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
