#!/usr/bin/env node
'use strict';

const baseUrl = new URL(process.env.CUTINAPP_SMOKE_BASE_URL || 'https://cutinapp.petertecnet.com.br/');
const timeoutMs = Number(process.env.CUTINAPP_SMOKE_TIMEOUT_MS || 15000);

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'cache-control': 'no-cache, no-store, max-age=0',
        'user-agent': 'Cutinapp-W10-Runtime-Smoke/1.0',
        ...(options.headers || {}),
      },
      ...options,
    });
  } finally {
    clearTimeout(timer);
  }
}

function assetUrls(html) {
  const urls = new Set();
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = match[1];
      if (!value || value.startsWith('data:')) continue;
      const url = new URL(value, baseUrl);
      if (url.origin === baseUrl.origin && /\.(?:js|css)(?:\?|$)/i.test(url.href)) urls.add(url.href);
    }
  }
  return [...urls];
}

function assertSecurityHeaders(response) {
  const required = [
    ['x-content-type-options', (value) => value.toLowerCase() === 'nosniff'],
    ['referrer-policy', (value) => value.trim().length > 0],
    ['content-security-policy', (value) => value.trim().length > 0],
  ];

  const failures = [];
  for (const [name, validate] of required) {
    const value = response.headers.get(name);
    if (!value) failures.push(`${name}: missing`);
    else if (!validate(value)) failures.push(`${name}: invalid (${value})`);
  }

  if (baseUrl.protocol === 'https:') {
    const hsts = response.headers.get('strict-transport-security');
    if (!hsts) failures.push('strict-transport-security: missing');
    else if (!/max-age\s*=\s*\d+/i.test(hsts)) failures.push(`strict-transport-security: invalid (${hsts})`);
  }

  if (failures.length) throw new Error(`security header regression:\n${failures.join('\n')}`);
}

async function main() {
  const probe = new URL(`?w10-smoke=${Date.now()}`, baseUrl);
  const home = await request(probe);
  if (!home.ok) throw new Error(`home returned HTTP ${home.status}`);
  assertSecurityHeaders(home);
  const html = await home.text();
  if (!/<div[^>]+id=["']root["']/i.test(html)) throw new Error('home HTML is missing #root');

  const assets = assetUrls(html);
  if (assets.length === 0) throw new Error('home HTML exposes no same-origin JS/CSS assets');

  const failures = [];
  for (const asset of assets) {
    try {
      const response = await request(asset, { method: 'GET', headers: { range: 'bytes=0-0' } });
      if (!(response.ok || response.status === 206)) failures.push(`${response.status} ${asset}`);
    } catch (error) {
      failures.push(`${error.name || 'Error'} ${asset}`);
    }
  }
  if (failures.length) throw new Error(`broken runtime assets:\n${failures.join('\n')}`);

  let releaseSha = 'unavailable';
  try {
    const release = await request(new URL(`release-sha.txt?w10-smoke=${Date.now()}`, baseUrl));
    if (release.ok) releaseSha = (await release.text()).trim() || 'empty';
  } catch (_) {}

  console.log(`runtime smoke OK: ${baseUrl.href}`);
  console.log(`release: ${releaseSha}`);
  console.log(`critical assets checked: ${assets.length}`);
  console.log('security headers: baseline OK');
}

main().catch((error) => {
  console.error(`runtime smoke FAILED: ${error.message}`);
  process.exit(1);
});
