import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const withExplicitProxyRequestInitMock = vi.fn((_proxyUrl: string | null | undefined, options?: RequestInit) => options ?? {});

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  return {
    ...actual,
    fetch: (...args: unknown[]) => fetchMock(...args),
  };
});

vi.mock('../../services/siteProxy.js', () => ({
  withExplicitProxyRequestInit: (...args: unknown[]) => withExplicitProxyRequestInitMock(...args),
}));

describe('hidden server ip page route', () => {
  let app: FastifyInstance;
  let hiddenPath = '';
  let originalIfconfigToken = '';

  beforeAll(async () => {
    const { config } = await import('../../config.js');
    originalIfconfigToken = config.ifconfigToken;
    config.ifconfigToken = 'Ops/Rotate+2026==';

    const routesModule = await import('./serverIpPage.js');
    hiddenPath = routesModule.getHiddenServerIpPagePath() || '';
    app = Fastify();
    await app.register(routesModule.hiddenServerIpPageRoutes);
  });

  beforeEach(() => {
    fetchMock.mockReset();
    withExplicitProxyRequestInitMock.mockClear();
  });

  afterAll(async () => {
    const { config } = await import('../../config.js');
    config.ifconfigToken = originalIfconfigToken;
    await app.close();
  });

  it('renders the probed server ip payload into an html page', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      ip_addr: '203.0.113.10',
      forwarded: '203.0.113.10, 10.0.0.1',
      user_agent: 'metapi-hidden-ip-page/1.0',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const response = await app.inject({
      method: 'GET',
      url: hiddenPath,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(hiddenPath).toBe('/.metapi-shadow/net-ip-Ops%2FRotate%2B2026%3D%3D');
    expect(response.body).toContain('203.0.113.10');
    expect(response.body).toContain('ifconfig.me/all.json');
    expect(response.body).toContain('Probe succeeded');
    expect(withExplicitProxyRequestInitMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'application/json',
          'user-agent': 'metapi-hidden-ip-page/1.0',
        }),
      }),
    );
  });

  it('renders an html error page when the upstream probe fails', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:443'));

    const response = await app.inject({
      method: 'GET',
      url: hiddenPath,
    });

    expect(response.statusCode).toBe(502);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Probe failed');
    expect(response.body).toContain('connect ECONNREFUSED 127.0.0.1:443');
  });

  it('returns 404 for mismatched hidden route tokens without probing upstream', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/.metapi-shadow/net-ip-stale-token',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('hidden server ip namespace routing', () => {
  let app: FastifyInstance;
  let hiddenPath = '';
  let originalIfconfigToken = '';

  beforeAll(async () => {
    const { config } = await import('../../config.js');
    const { isHiddenServerIpRouteNamespace } = await import('../../services/serverIpPage.js');
    originalIfconfigToken = config.ifconfigToken;
    config.ifconfigToken = '';

    app = Fastify();
    app.setNotFoundHandler(async (request, reply) => {
      if (
        !request.url.startsWith('/api/')
        && !request.url.startsWith('/v1/')
        && !isHiddenServerIpRouteNamespace(request.url)
      ) {
        reply.type('text/html; charset=utf-8');
        return '<html>spa shell</html>';
      }
      return reply.code(404).send({ error: 'Not found' });
    });

    hiddenPath = '/.metapi-shadow/net-ip-stale-token';
  });

  afterAll(async () => {
    const { config } = await import('../../config.js');
    config.ifconfigToken = originalIfconfigToken;
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    withExplicitProxyRequestInitMock.mockClear();
  });

  it('reserves hidden namespace from the SPA fallback', async () => {
    const hiddenResponse = await app.inject({
      method: 'GET',
      url: hiddenPath,
    });
    const spaResponse = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(hiddenResponse.statusCode).toBe(404);
    expect(hiddenResponse.json()).toEqual({ error: 'Not found' });
    expect(spaResponse.statusCode).toBe(200);
    expect(spaResponse.body).toContain('spa shell');
  });
});

describe('hidden server ip page route without IFCONFIG_TOKEN', () => {
  let app: FastifyInstance;
  let originalIfconfigToken = '';

  beforeAll(async () => {
    const { config } = await import('../../config.js');
    originalIfconfigToken = config.ifconfigToken;
    config.ifconfigToken = '';

    const routesModule = await import('./serverIpPage.js');
    app = Fastify();
    await app.register(routesModule.hiddenServerIpPageRoutes);
  });

  afterAll(async () => {
    const { config } = await import('../../config.js');
    config.ifconfigToken = originalIfconfigToken;
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    withExplicitProxyRequestInitMock.mockClear();
  });

  it('does not register the hidden route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/.metapi-shadow/net-ip-ops-rotate-2026',
    });

    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
