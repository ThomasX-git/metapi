import { fetch } from 'undici';
import { config } from '../config.js';
import { withExplicitProxyRequestInit } from './siteProxy.js';

const SERVER_IP_PROBE_URL = 'https://ifconfig.me/all.json';
const SERVER_IP_PROBE_TIMEOUT_MS = 5_000;
const HIDDEN_SERVER_IP_PAGE_PREFIX = '/.metapi-shadow/net-ip-';

type ServerIpProbePayload = Record<string, unknown>;

export type HiddenServerIpPageResponse = {
  statusCode: number;
  html: string;
};

export function getHiddenServerIpPagePath(): string | null {
  if (!config.ifconfigToken) return null;
  return `${HIDDEN_SERVER_IP_PAGE_PREFIX}${config.ifconfigToken}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trimSingleLine(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

function describeProbeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return trimSingleLine(error.message);
  }
  return 'unknown probe error';
}

function extractPrimaryIp(payload: ServerIpProbePayload | null): string {
  if (!payload) return 'unavailable';
  const directIp = String(payload.ip_addr || '').trim();
  if (directIp) return directIp;
  const forwarded = String(payload.forwarded || '').trim();
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unavailable';
  }
  return 'unavailable';
}

async function fetchServerIpProbePayload(): Promise<ServerIpProbePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_IP_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(
      SERVER_IP_PROBE_URL,
      withExplicitProxyRequestInit(config.systemProxyUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'cache-control': 'no-cache',
          'user-agent': 'metapi-hidden-ip-page/1.0',
        },
      }),
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`ifconfig.me returned HTTP ${response.status}: ${trimSingleLine(text || 'empty response')}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`ifconfig.me returned non-JSON content: ${trimSingleLine(text || 'empty response')}`);
    }

    if (!isRecord(parsed)) {
      throw new Error('ifconfig.me returned a non-object payload');
    }

    return parsed;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`ifconfig.me probe timeout (${Math.round(SERVER_IP_PROBE_TIMEOUT_MS / 1000)}s)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function renderHiddenServerIpPage(input: {
  fetchedAt: string;
  payload: ServerIpProbePayload | null;
  error: string | null;
}): string {
  const payloadJson = input.payload
    ? JSON.stringify(input.payload, null, 2)
    : JSON.stringify({ error: input.error || 'unknown probe error' }, null, 2);
  const primaryIp = extractPrimaryIp(input.payload);
  const probeStateLabel = input.error ? 'Probe failed' : 'Probe succeeded';
  const title = input.error ? '服务器出口 IP 探测失败' : '服务器出口 IP 信息';
  const accentClass = input.error ? 'error' : 'success';
  const message = input.error
    ? `无法从 ${SERVER_IP_PROBE_URL} 获取服务器出口 IP。`
    : '当前页面展示的是服务器访问 ifconfig.me 时看到的出口信息。';

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: rgba(255, 252, 247, 0.94);
        --text: #1d1d1b;
        --muted: #5d5a55;
        --border: rgba(29, 29, 27, 0.12);
        --success: #0f766e;
        --error: #b42318;
        --shadow: 0 24px 70px rgba(58, 45, 30, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(196, 137, 52, 0.18), transparent 32rem),
          radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.14), transparent 28rem),
          var(--bg);
        padding: 24px;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .hero {
        padding: 28px 28px 18px;
        border-bottom: 1px solid var(--border);
      }
      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: var(--muted);
      }
      h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 42px);
        line-height: 1.08;
      }
      .message {
        margin: 14px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        padding: 22px 28px 0;
      }
      .card {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.65);
      }
      .card dt {
        margin: 0 0 10px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--muted);
      }
      .card dd {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        word-break: break-word;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        border: 1px solid var(--border);
        color: var(--${accentClass});
        background: rgba(255, 255, 255, 0.72);
      }
      .payload {
        padding: 22px 28px 28px;
      }
      .payload h2 {
        margin: 0 0 12px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--muted);
      }
      pre {
        margin: 0;
        padding: 18px;
        overflow-x: auto;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: #191816;
        color: #f7f1e7;
        font-size: 13px;
        line-height: 1.6;
      }
      @media (max-width: 640px) {
        body { padding: 16px; }
        .hero, .grid, .payload { padding-left: 18px; padding-right: 18px; }
        .hero { padding-top: 20px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Hidden Network Probe</p>
        <div class="pill">${escapeHtml(probeStateLabel)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="message">${escapeHtml(message)}</p>
      </section>
      <section class="grid">
        <dl class="card">
          <dt>Primary IP</dt>
          <dd>${escapeHtml(primaryIp)}</dd>
        </dl>
        <dl class="card">
          <dt>Fetched At</dt>
          <dd>${escapeHtml(input.fetchedAt)}</dd>
        </dl>
        <dl class="card">
          <dt>Probe URL</dt>
          <dd>${escapeHtml(SERVER_IP_PROBE_URL)}</dd>
        </dl>
        <dl class="card">
          <dt>Result</dt>
          <dd>${escapeHtml(input.error || 'OK')}</dd>
        </dl>
      </section>
      <section class="payload">
        <h2>Payload</h2>
        <pre>${escapeHtml(payloadJson)}</pre>
      </section>
    </main>
  </body>
</html>`;
}

export async function buildHiddenServerIpPageResponse(): Promise<HiddenServerIpPageResponse> {
  const fetchedAt = new Date().toISOString();

  try {
    const payload = await fetchServerIpProbePayload();
    return {
      statusCode: 200,
      html: renderHiddenServerIpPage({
        fetchedAt,
        payload,
        error: null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 502,
      html: renderHiddenServerIpPage({
        fetchedAt,
        payload: null,
        error: describeProbeError(error),
      }),
    };
  }
}
