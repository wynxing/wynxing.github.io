import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const writingSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: writingSchema.extend({
    category: z.enum(['Tech', 'Projects', 'Thoughts', 'Learning']).default('Tech'),
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: writingSchema.extend({
    mood: z.enum(['Log', 'Idea', 'Clip', 'Bug', 'Study']).default('Log'),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: writingSchema.extend({
    stack: z.array(z.string()).default([]),
    repo: z.url().optional(),
    demo: z.url().optional(),
    status: z.enum(['building', 'paused', 'shipped', 'archived']).default('building'),
  }),
});

export const collections = { blog, notes, projects };
