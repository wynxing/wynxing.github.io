import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const exists = p => existsSync(new URL('../' + p, import.meta.url));
const source = ts.transpile(read('src/utils/content.ts'), { module: ts.ModuleKind.ES2022 });
const { byProjectOrder, byDateDesc } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('project priority precedes dates, with deterministic fallback and no mutation', () => {
  const entry = (id, order, date) => ({ id, collection: 'projects', data: { order, date: new Date(date) } });
  const input = [entry('later', undefined, '2026-09-14'), entry('neo', 3, '2026-09-14'), entry('root', 1, '2020-01-01'), entry('may', 2, '2026-01-01'), entry('older', undefined, '2020-01-01'), entry('alpha', undefined, '2026-09-14')];
  const original = [...input];
  assert.deepEqual(byProjectOrder(input).map(x => x.id), ['root', 'may', 'neo', 'alpha', 'later', 'older']);
  assert.deepEqual(input, original);
  assert.deepEqual(byProjectOrder([entry('b', 1, '2025-01-01'), entry('a', 1, '2026-01-01')]).map(x => x.id), ['a', 'b']);
  assert.equal(byDateDesc([...input])[0].data.date.valueOf(), new Date('2026-09-14').valueOf());
});

test('built showcase links to four complete projects in the requested order', () => {
  const html = read('dist/projects/index.html');
  const cards = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(m => m[0]);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map(s => s.match(/class="card-link" href="([^"]+)"/)[1]), ['/projects/rootly/', '/projects/lanwork/', '/projects/neocode/', '/projects/veil/']);
  for (const card of cards) {
    assert.match(card, /project-role/);
    assert.match(card, /project-highlight/);
    assert.doesNotMatch(card, /<time/);
  }
  assert.doesNotMatch(cards[0], /github\.com/);
  assert.match(cards[1], /已发布 v0\.1\.0 · Rust \/ Slint/);
  assert.match(cards[1], /https:\/\/github\.com\/wynxing\/Lanwork/);
  assert.match(cards[1], /桌面应用/);
  assert.match(cards[1], /效率工具/);
  assert.match(cards[3], /已发布 1\.0\.1 · Rust</);
  assert.match(cards[3], /https:\/\/github\.com\/wynxing\/Veil/);
  assert.match(cards[3], /桌面应用/);
  assert.match(cards[3], /系统工具/);
  assert.equal(exists('dist/projects/maydolist/index.html'), false);
  for (const id of ['rootly', 'lanwork', 'neocode', 'veil']) {
    const detail = read(`dist/projects/${id}/index.html`);
    for (const section of ['产品介绍', '我负责的内容', '最终成果', '相关链接']) assert.ok(detail.includes(section));
    assert.match(detail, /data-pagefind-body/);
    assert.doesNotMatch(detail, /上一篇|下一篇|相邻文章/);
  }
  const lanwork = read('dist/projects/lanwork/index.html');
  assert.match(lanwork, /Ctrl\+Alt\+M/);
  assert.match(lanwork, /Everything/);
  assert.match(lanwork, /Documents\\Lanwork/);
  assert.match(lanwork, /已发布 v0\.1\.0/);
  const veil = read('dist/projects/veil/index.html');
  assert.match(veil, /你玩你的。屏幕，由你决定。/);
  assert.match(veil, /Ctrl\+Alt\+Shift\+F10/);
  assert.match(veil, /VeilSetup-1\.0\.1-x64\.exe/);
  assert.match(veil, /已发布 1\.0\.1/);
});

test('adjacent project navigation follows list direction and stops at its ends', () => {
  const nav = id => read(`dist/projects/${id}/index.html`).match(/<nav class="adjacent-posts"[\s\S]*?<\/nav>/)[0];
  const links = id => [...nav(id).matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(links('rootly'), ['/projects/lanwork/']);
  assert.deepEqual(links('lanwork'), ['/projects/rootly/', '/projects/neocode/']);
  assert.deepEqual(links('neocode'), ['/projects/lanwork/', '/projects/veil/']);
  assert.deepEqual(links('veil'), ['/projects/neocode/']);
  assert.match(nav('rootly'), /下一个项目/);
  assert.doesNotMatch(nav('rootly'), /上一个项目/);
  assert.match(nav('veil'), /上一个项目/);
  assert.doesNotMatch(nav('veil'), /下一个项目/);
});

test('draft projects never enter generated detail routes', async () => {
  const astro = read('src/pages/projects/[id].astro').split('---')[1];
  const module = ts.transpile(astro.split('const { entry } = Astro.props;')[0].replace(/^import .*;$/gm, ''), { module: ts.ModuleKind.ES2022 });
  const fixture = `const getCollection = async (_, filter) => [{id:'visible', data:{draft:false}}, {id:'secret-draft', data:{draft:true}}].filter(filter);\n`;
  const { getStaticPaths } = await import('data:text/javascript;base64,' + Buffer.from(fixture + module).toString('base64'));
  assert.deepEqual((await getStaticPaths()).map(x => x.params.id), ['visible']);
});

test('reduced-motion rules disable animation, transitions and smooth scrolling', () => {
  const css = read('src/styles/global.css').split('@media (prefers-reduced-motion: reduce)')[1];
  assert.match(css, /scroll-behavior:\s*auto/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
});
