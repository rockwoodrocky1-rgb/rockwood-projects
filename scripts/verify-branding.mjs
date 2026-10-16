// Read-only verification of the HTML and assets that phones/share crawlers consume.
import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:8792');
const production = 'https://rockwood-projects.vercel.app';
const targets = [
  { route: '/cam', name: 'Rockwood Cam', brand: '/brand/cam/v2', logo: '/brand/rockwood-cam-v2.svg' },
  { route: '/workspace', name: 'Rockwood Projects', brand: '/brand/development/v1' },
];
const userAgents = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  'WhatsApp/2.24.0',
  'Twitterbot/1.0',
];

async function get(path, userAgent) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin, 'Check only the explicitly selected host');
  const response = await fetch(url, { headers: userAgent ? { 'User-Agent': userAgent } : {} });
  assert.equal(response.status, 200, `${path} must be publicly accessible`);
  assert.equal(new URL(response.url).pathname, url.pathname, `${path} must not redirect to login`);
  return response;
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1].toLowerCase(), m[2].replaceAll('&amp;', '&')]));
}

async function checkPng(path, width, height) {
  const response = await get(path);
  assert.match(response.headers.get('content-type') || '', /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), width, `${path} width`);
  assert.equal(bytes.readUInt32BE(20), height, `${path} height`);
  return bytes;
}

for (const target of targets) {
  for (const userAgent of userAgents) {
    const html = await (await get(target.route, userAgent)).text();
    const head = html.split('</head>')[0];
    const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m => attributes(m[0]));
    const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(m => attributes(m[0]));
    const content = key => meta.find(m => m.name === key || m.property === key)?.content;
    assert.equal(content('application-name'), target.name);
    assert.equal(content('apple-mobile-web-app-title'), target.name);
    assert.equal(content('robots'), 'noindex, nofollow');
    assert.equal(content('og:title'), target.name);
    assert.equal(content('og:url'), production + target.route);
    assert.equal(content('og:image'), production + target.brand + '/share-1200x630.png');
    assert.equal(content('twitter:image'), content('og:image'));
    assert.equal(content('twitter:card'), 'summary_large_image');
    assert.equal(links.find(l => l.rel === 'manifest')?.href, target.brand + '/manifest.webmanifest');
    const apple = links.filter(l => l.rel === 'apple-touch-icon');
    assert.equal(apple.length, 1, 'No inherited icon from another app');
    assert.equal(apple[0].href, target.brand + '/icon-180.png');
    assert.equal(apple[0].sizes, '180x180');
    assert.ok(links.filter(l => l.rel === 'icon').every(l => l.href.startsWith(target.brand + '/')));
    if (target.logo) assert.ok(html.includes(target.logo), 'Cam UI uses the new camera wordmark');
  }

  const manifestResponse = await get(target.brand + '/manifest.webmanifest');
  assert.match(manifestResponse.headers.get('content-type') || '', /application\/(manifest\+json|json)/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, target.name);
  assert.equal(manifest.id, target.route);
  assert.equal(manifest.start_url, target.route);
  assert.equal(manifest.scope, target.route);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith(target.brand + '/'));
    const [w, h] = icon.sizes.split('x').map(Number);
    await checkPng(icon.src, w, h);
  }
  const apple = await checkPng(target.brand + '/icon-180.png', 180, 180);
  assert.equal(apple[25], 2, 'Home Screen PNG must be opaque RGB');
  await checkPng(target.brand + '/share-1200x630.png', 1200, 630);
  const ico = Buffer.from(await (await get(target.brand + '/favicon.ico')).arrayBuffer());
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
  const svg = await (await get(target.brand + '/icon.svg')).text();
  assert.ok(svg.includes('<path'));
  assert.ok(!/<image|<text[\s>]/.test(svg), 'Icons must remain self-contained vector paths');
  console.log(`PASS ${target.route}: Safari/WhatsApp/Twitter head metadata; app identity; public icons and share image`);
}

console.log(`Branding verified at ${origin.origin}. Physical phone installation and third-party preview caches require separate device checks.`);
