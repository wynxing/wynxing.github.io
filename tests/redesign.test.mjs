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

test('glass homepage keeps all destinations and only one newest article preview', () => {
  const html = read('dist/index.html');
  const destinations = [...html.matchAll(/href="([^"]+)" data-portal="([^"]+)"/g)];
  assert.deepEqual(destinations.map(match => [match[2], match[1]]), [
    ['articles', '/blog/'], ['projects', '/projects/'], ['notes', '/notes/'], ['about', '/about/'],
  ]);
  for (const [, href] of destinations) assert.ok(existsSync(resolve(root, 'dist', '.' + href, 'index.html')));
  const preview = [...html.matchAll(/data-latest-entry href="([^"]+)"/g)];
  assert.equal(preview.length, 1);
  assert.ok(existsSync(resolve(root, 'dist', '.' + preview[0][1], 'index.html')));
  assert.equal((html.match(/data-entry-card/g) || []).length, 0);
  assert.ok(html.includes('aria-describedby="projects-description"'));
  assert.ok(html.includes('aria-describedby="notes-description"'));
});

test('glass pointer effects coalesce frames and stop for touch, reduced motion and hidden pages', () => {
  const source = ts.transpile(read('src/components/GlassScene.astro').match(/<script>([\s\S]*?)<\/script>/)[1], { target: ts.ScriptTarget.ES2022 });
  const handlers = {}, documentEvents = {}, mediaEvents = {}, props = new Map(), frames = new Map();
  let sequence = 0;
  const reduced = { matches: false, addEventListener: (_, fn) => { mediaEvents.reduced = fn; } };
  const fine = { matches: true, addEventListener: (_, fn) => { mediaEvents.fine = fn; } };
  const portal = {
    style: { setProperty: (key, value) => props.set(key, value), removeProperty: key => props.delete(key) },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
  };
  let paused = false;
  const world = { querySelectorAll: () => [portal], classList: { toggle: (_, value) => { paused = value; } } };
  const document = { hidden: false, querySelector: () => world, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  runInNewContext(source, {
    document, window: { addEventListener() {} },
    matchMedia: query => query.includes('reduced-motion') ? reduced : fine,
    requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const move = (pointerType = 'mouse') => handlers.pointermove({ pointerType, clientX: 200, clientY: 100 });
  move('touch'); assert.equal(frames.size, 0);
  move(); move(); assert.equal(frames.size, 1);
  const paint = frames.values().next().value; frames.clear(); paint();
  assert.equal(props.get('--dx'), '4px');
  assert.equal(props.get('--dy'), '4px');
  assert.equal(props.get('--rx'), '-2.5deg');
  reduced.matches = true; mediaEvents.reduced();
  assert.equal(props.size, 0); assert.equal(paused, true);
  move(); assert.equal(frames.size, 0);
  reduced.matches = false; mediaEvents.reduced();
  move(); assert.equal(frames.size, 1);
  document.hidden = true; documentEvents.visibilitychange();
  assert.equal(frames.size, 0); assert.equal(paused, true);
  document.hidden = false; documentEvents.visibilitychange();
  fine.matches = false; mediaEvents.fine(); move(); assert.equal(frames.size, 0);
});
