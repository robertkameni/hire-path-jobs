import { next } from '@vercel/functions';

const LINK_API_CATALOG = '</.well-known/api-catalog>; rel="api-catalog"';

function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/markdown');
}

function markdownHome(origin: string, method: string): Response {
  const body =
    method === 'HEAD'
      ? null
      : `# Hire Path Jobs

Browser UI: paste a **job URL** or **job description** to run AI analysis.

## REST API (same origin via proxy)

| Resource | URL |
|----------|-----|
| API catalog (RFC 9727) | \`${origin}/.well-known/api-catalog\` |
| OpenAPI JSON | \`${origin}/api/docs-json\` |
| Swagger UI | \`${origin}/api/docs\` |
| Health | \`${origin}/api/health\` |

There is no OAuth, MCP server, or hosted Agent Skills index on this origin; discovery files describe the NestJS API only.
`;

  return new Response(body, {
    headers: new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: LINK_API_CATALOG,
    }),
  });
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD') && wantsMarkdown(request)) {
    return markdownHome(url.origin, request.method);
  }
  return next();
}

export const config = {
  matcher: '/',
};
