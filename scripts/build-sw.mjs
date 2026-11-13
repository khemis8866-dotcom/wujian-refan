import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir, prefix = '') {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const relative = `${prefix}${item.name}`;
    if (item.isDirectory()) files.push(...await walk(`${dir}/${item.name}`, `${relative}/`));
    else if (item.name !== 'sw.js') files.push(relative);
  }
  return files.sort();
}
const files = await walk('dist');
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(`dist/${file}`));
const version = hash.digest('hex').slice(0, 16);
await writeFile('dist/sw.js', `// Generated from the actual build. No user data is cached or transmitted here.
const PREFIX = 'wujian-refan-shell-';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)};
const ROOT = self.registration.scope;
const URLS = FILES.map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)));
  // Wait for all old windows to close before activating a new shell.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('index.html', ROOT).href, { ignoreVary: true })).then(cached => cached || fetch(request)));
    return;
  }
  if (!URLS.includes(url.href)) return;
  // Static module servers may emit Vary: Origin. Precache requests have no Origin,
  // while module scripts do. These content-hashed public files have no variants.
  event.respondWith(caches.open(CACHE).then(cache => cache.match(request, { ignoreVary: true })).then(cached => cached || fetch(request)));
});
`);
console.log(`Offline shell ${version}: ${files.length} local assets`);
