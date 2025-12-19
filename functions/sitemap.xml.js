import { createConnection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { animes, tags } from './schema';

export async function onRequest(context) {
  try {
    const connection = await createConnection({
      host: context.env.HYPERDRIVE.host,
      user: context.env.HYPERDRIVE.user,
      password: context.env.HYPERDRIVE.password,
      database: context.env.HYPERDRIVE.database,
      port: context.env.HYPERDRIVE.port,
      socketPath: context.env.HYPERDRIVE.socketPath,
      disableEval: true
    });

    const db = drizzle(connection);

    // Fetch all animes
    const allAnimes = await db.select({
      id: animes.id,
      createdAt: animes.createdAt
    }).from(animes);

    // Fetch all tags
    const allTags = await db.select({
      id: tags.id,
      name: tags.name
    }).from(tags);

    await connection.end();

    // Generate XML sitemap
    const baseUrl = 'https://anime.ixacg.top';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

    // Add all anime watch pages
    for (const anime of allAnimes) {
      const lastmod = anime.createdAt
        ? new Date(anime.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      xml += `  <url>
    <loc>${baseUrl}/watch/${anime.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }

    // Add all tag pages
    for (const tag of allTags) {
      xml += `  <url>
    <loc>${baseUrl}/?tag=${tag.id}&amp;tagName=${encodeURIComponent(tag.name)}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return new Response('Error generating sitemap', { status: 500 });
  }
}
