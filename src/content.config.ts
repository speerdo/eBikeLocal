import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('eBikeLocal Editorial'),
    category: z.enum(['buying-guide', 'laws', 'education', 'news']),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    heroImage: z.string().optional(),
  }),
});

const bestOf = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/bestOf' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('eBikeLocal Editorial'),
    priceMax: z.number().optional(),
    category: z.string().optional(),
    featured: z.boolean().default(false),
    heroImage: z.string().optional(),
  }),
});

export const collections = { guides, bestOf };
