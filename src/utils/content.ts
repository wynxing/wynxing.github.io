import type { CollectionEntry } from 'astro:content';

export type Entry =
  | CollectionEntry<'blog'>
  | CollectionEntry<'projects'>;

export function byDateDesc<T extends Entry>(entries: T[]) {
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function byProjectOrder<T extends CollectionEntry<'projects'>>(entries: T[]) {
  return [...entries].sort((a, b) => {
    const aOrder = a.data.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.data.order ?? Number.POSITIVE_INFINITY;
    return (aOrder === bOrder ? 0 : aOrder - bOrder)
      || b.data.date.valueOf() - a.data.date.valueOf()
      || a.id.localeCompare(b.id);
  });
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
  return collection;
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

export function categoryLabel(category: string) {
  return ({ Tech: '技术', Projects: '项目', Thoughts: '思考', Learning: '学习' } as Record<string, string>)[category] ?? category;
}

export function statusLabel(status: string) {
  return ({ building: '进行中', paused: '已暂停', shipped: '已发布', archived: '已归档' } as Record<string, string>)[status] ?? status;
}

export function isCurrentPath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/' || pathname === '';
  }

  return pathname === href || pathname.startsWith(href);
}
