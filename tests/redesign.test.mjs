import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const initial = read('src/layouts/BaseLayout.astro').match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const interaction = ts.transpile(read('src/components/ThemeToggle.astro').match(/<script>([\s\S]*?)<\/script>/)[1], { target: ts.ScriptTarget.ES2022 });

function themeHarness({ dark = false, saved = null, blocked = false } = {}) {
  const events = {};
  const controlEvents = {};
  const mediaEvents = {};
  const emitted = [];
  const document = {
    documentElement: { dataset: {} },
    querySelector: () => select,
    dispatchEvent: event => emitted.push(event.detail),
  };
  const select = { value: '', addEventListener: (name, handler) => { controlEvents[name] = handler; } };
  const media = { matches: dark, addEventListener: (name, handler) => { mediaEvents[name] = handler; } };
  const storage = {
    getItem: () => { if (blocked) throw Error('denied'); return saved; },
    setItem: (_, value) => { if (blocked) throw Error('denied'); saved = value; },
  };
  const window = { matchMedia: () => media, addEventListener: (name, handler) => { events[name] = handler; } };
  const context = { window, document, matchMedia: window.matchMedia, localStorage: storage, CustomEvent: class { constructor(_, data) { this.detail = data.detail; } } };
  runInNewContext(initial, context);
  const firstPaint = document.documentElement.dataset.theme;
  runInNewContext(interaction, context);
  return {
    firstPaint, emitted,
    get theme() { return document.documentElement.dataset.theme; },
    get preference() { return select.value; },
    get saved() { return saved; },
    system(dark) { media.matches = dark; mediaEvents.change(); },
    choose(value) { select.value = value; controlEvents.change(); },
    storage(value) { events.storage({ key: 'theme', newValue: value }); },
  };
}

test('first paint and live updates follow both system appearances', () => {
  for (const dark of [false, true]) {
    const h = themeHarness({ dark });
    assert.equal(h.firstPaint, dark ? 'dark' : 'light');
    assert.equal(h.preference, 'system');
    h.system(!dark);
    assert.equal(h.theme, dark ? 'light' : 'dark');
    assert.equal(h.emitted.at(-1), h.theme);
  }
});
test('existing explicit preferences survive and override the system', () => {
  for (const saved of ['light', 'dark']) {
    const h = themeHarness({ saved, dark: saved !== 'dark' });
    assert.equal(h.firstPaint, saved);
    h.system(saved !== 'dark');
    assert.equal(h.theme, saved);
  }
});
test('manual selection persists; returning to system resumes live updates', () => {
  const h = themeHarness();
  h.choose('dark');
  assert.equal(h.saved, 'dark');
  h.system(false);
  assert.equal(h.theme, 'dark');
  h.choose('system');
  assert.equal(h.saved, 'system');
  assert.equal(h.theme, 'light');
  h.system(true);
  assert.equal(h.theme, 'dark');
});
test('blocked storage and invalid preferences fail safely', () => {
  for (const options of [{ blocked: true }, { saved: 'invalid' }, { saved: 'system' }]) {
    const h = themeHarness({ ...options, dark: true });
    assert.equal(h.firstPaint, 'dark');
    assert.equal(h.preference, 'system');
    h.choose('light');
    assert.equal(h.theme, 'light');
    h.choose('system');
    assert.equal(h.theme, 'dark');
  }
});
test('cross-tab preference reset returns to the current system theme', () => {
  const h = themeHarness({ dark: true, saved: 'light' });
  h.storage(null);
  assert.equal(h.theme, 'dark');
  assert.equal(h.preference, 'system');
});

test('production pages preserve all internal destinations, anchors and content URLs', () => {
  const dist = resolve(root, 'dist');
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(resolve(dir, item.name)) : [resolve(dir, item.name)]);
  }
  const files = walk(dist).filter(file => file.endsWith('.html'));
  let checked = 0;
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const url = new URL(href.replaceAll('&amp;', '&'), 'https://example.test' + file.slice(dist.length).replaceAll('\\', '/'));
      const dest = href.startsWith('#') ? file : resolve(dist, '.' + decodeURIComponent(url.pathname));
      const candidates = [dest, resolve(dest, 'index.html')];
      const target = candidates.find(candidate => existsSync(candidate) && !readdirSafe(candidate));
      assert.ok(target, 'Missing destination: ' + href + ' in ' + file);
      if (url.hash && target.endsWith('.html')) {
        const targetHtml = readFileSync(target, 'utf8');
        assert.ok(targetHtml.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'), 'Missing anchor: ' + href);
      }
      checked++;
    }
  }
  assert.ok(checked > 100);
  let published = 0;
  for (const name of readdirSync(resolve(root, 'src/content/blog'))) {
    const markdown = read('src/content/blog/' + name);
    if (/draft:\s*true/.test(markdown)) continue;
    published++;
    assert.ok(existsSync(resolve(dist, 'blog', name.replace(/\.mdx?$/, ''), 'index.html')));
  }
  const rss = read('dist/rss.xml');
  assert.equal((rss.match(/<item>/g) || []).length, published);
});
function readdirSafe(path) {
  try { readdirSync(path); return true; } catch { return false; }
}

test('tag filtering preserves commas and combines category with tag', () => {
  const source = ts.transpile(read('src/components/ListGrid.astro').match(/<script>([\s\S]*?)<\/script>/)[1], { target: ts.ScriptTarget.ES2022 });
  const handlers = {};
  const makeSelect = values => ({
    value: '', options: values.map(value => ({ value })),
    querySelector: () => null, add(option) { this.options.push(option); }
  });
  const tag = makeSelect(['', 'a,b', 'a']);
  const category = makeSelect(['', 'Tech', 'Thoughts']);
  const count = { textContent: '' };
  const empty = { hidden: true };
  const cards = [
    { dataset: { tags: JSON.stringify(['a,b']), category: 'Tech' }, hidden: false },
    { dataset: { tags: JSON.stringify(['a', 'b']), category: 'Tech' }, hidden: false },
    { dataset: { tags: JSON.stringify(['a,b']), category: 'Thoughts' }, hidden: false },
  ];
  const form = { hidden: true, querySelector: selector => selector.includes('category') ? category : tag, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const root = {
    querySelector: selector => ({ '[data-filters]': form, '[data-visible-count]': count, '[data-tag-empty]': empty })[selector],
    querySelectorAll: selector => selector === '[data-entry-card]' ? cards : [],
  };
  let url = new URL('https://example.test/blog/?tag=a%2Cb&category=Tech');
  const location = { get search() { return url.search; }, get href() { return url.href; } };
  runInNewContext(source, {
    document: { querySelectorAll: () => [root] },
    location, URL, URLSearchParams,
    history: { pushState: (_, __, value) => { url = new URL(value, url); } },
    window: { addEventListener: (name, fn) => { handlers[name] = fn; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; this.dataset = {}; } },
  });
  assert.equal(count.textContent, '1');
  assert.deepEqual(cards.map(card => card.hidden), [false, true, true]);
  category.value = '';
  handlers.change();
  assert.equal(count.textContent, '2');
  assert.equal(url.searchParams.get('tag'), 'a,b');
  url = new URL('https://example.test/blog/?tag=absent');
  handlers.popstate();
  assert.equal(count.textContent, '0');
  assert.equal(empty.hidden, false);
  assert.equal(tag.value, 'absent');
});

test('editorial homepage has one latest entry and unique published article destinations', () => {
  const html = read('dist/index.html');
  const links = [...html.matchAll(/class="card-link" href="([^"]+)"/g)].map(match => match[1]).filter(href => href.startsWith('/blog/'));
  assert.ok(links.length > 0 && links.length <= 6);
  assert.equal(new Set(links).size, links.length);
  assert.equal((html.match(/post-featured/g) || []).length, 1);
  assert.ok(html.includes('post-list'));
  for (const href of links) {
    assert.ok(existsSync(resolve(root, 'dist', '.' + href, 'index.html')));
  }
});
