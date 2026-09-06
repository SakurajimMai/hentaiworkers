import { siteMetaTagsSchema, type SiteMetaTag } from '@/lib/site-meta';

/** DOMParser is inert: imported verification snippets never enter the live document. */
export function importSiteMetaTags(source: string): SiteMetaTag[] {
  const document = new DOMParser().parseFromString(source, 'text/html');
  const nodes = [...document.head.childNodes, ...document.body.childNodes];
  const tags: SiteMetaTag[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.COMMENT_NODE) continue;
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
    if (!(node instanceof HTMLMetaElement)) throw new Error('仅接受 meta 标签');
    const attribute = node.hasAttribute('name') ? 'name' : 'property';
    if ([...node.attributes].some((attr) => attr.name !== attribute && attr.name !== 'content')) {
      throw new Error('标签仅接受 name 或 property，以及 content 属性');
    }
    tags.push({ attribute, key: node.getAttribute(attribute) ?? '', content: node.content });
  }
  if (!tags.length) throw new Error('未找到有效的 meta 标签');
  const parsed = siteMetaTagsSchema.safeParse(tags);
  if (!parsed.success) throw new Error('Meta 标签名称或内容无效，或超过 50 条');
  return parsed.data;
}
