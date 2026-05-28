import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { byDateDesc, entryHref } from '../utils/content';

export async function GET(context) {
  const entries = byDateDesc([
    ...(await getCollection('blog', ({ data }) => !data.draft)),
    ...(await getCollection('notes', ({ data }) => !data.draft)),
    ...(await getCollection('projects', ({ data }) => !data.draft)),
  ]);

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.date,
      link: entryHref(entry),
      categories: entry.data.tags,
    })),
  });
}
