import type { CollectionEntry } from 'astro:content';

export type Entry =
  | CollectionEntry<'blog'>
  | CollectionEntry<'notes'>
  | CollectionEntry<'projects'>;

const SAVE_GOAL = 12;

export function byDateDesc<T extends Entry>(entries: T[]) {
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  })
    .format(date)
    .replaceAll('/', '.');
}

export function collectionPath(collection: Entry['collection']) {
  return collection === 'blog' ? 'blog' : collection === 'notes' ? 'notes' : 'projects';
}

export function entryHref(entry: Entry) {
  return `/${collectionPath(entry.collection)}/${entry.id}/`;
}

export function collectionHref(collection: Entry['collection']) {
  return `/${collectionPath(collection)}/`;
}

export function tagHref(collection: Entry['collection'], tag: string) {
  return `${collectionHref(collection)}?tag=${encodeURIComponent(tag)}`;
}

export function readingTime(body = '') {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const cjk = body.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const minutes = Math.max(1, Math.ceil((words + cjk / 2) / 220));
  return `${minutes} 分钟`;
}

export function deriveExp(entryCount: number, goal = SAVE_GOAL) {
  return Math.min(100, Math.round((entryCount / goal) * 100));
}

export function isCurrentPath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/' || pathname === '';
  }

  return pathname === href || pathname.startsWith(href);
}
