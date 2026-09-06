import { z } from 'zod';

export const MAX_SITE_META_TAGS = 50;
export const SITE_META_CACHE_TAG = 'site-meta-tags';

export const siteMetaTagSchema = z.object({
  attribute: z.enum(['name', 'property']).default('name'),
  key: z.string().trim().min(1).max(128)
    .regex(/^[a-zA-Z][a-zA-Z0-9:._-]*$/)
    .refine((value) => !['viewport', 'charset', 'theme-color', 'color-scheme'].includes(value.toLowerCase()), {
      message: '该标签由网站管理',
    }),
  content: z.string().trim().min(1).max(4096),
}).strict();

export const siteMetaTagsSchema = z.array(siteMetaTagSchema).max(MAX_SITE_META_TAGS);
export type SiteMetaTag = z.infer<typeof siteMetaTagSchema>;
