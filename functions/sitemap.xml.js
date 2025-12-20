import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleMySQL } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { animes, tags } from './schema';

export async function onRequest(context) {
  try {
    const dbType = context.env.DB_TYPE || 'd1';
    let db, allAnimes, allTags;

    if (dbType === 'd1') {
      // Use D1
      db = drizzleD1(context.env.DB);

      allAnimes = await db.select({
        id: animes.id,
        createdAt: animes.createdAt
      }).from(animes);

      allTags = await db.select({
        id: tags.id,
        name: tags.name
      }).from(tags);
    } else {
      // Use Hyperdrive (MySQL)
      const connection = await createConnection({
        host: context.env.HYPERDRIVE.host,
        user: context.env.HYPERDRIVE.user,
        password: context.env.HYPERDRIVE.password,
        database: context.env.HYPERDRIVE.database,
        port: context.env.HYPERDRIVE.port,
        socketPath: context.env.HYPERDRIVE.socketPath,
        disableEval: true
      });

      db = drizzleMySQL(connection);

      allAnimes = await db.select({
        id: animes.id,
        createdAt: animes.createdAt
      }).from(animes);

      allTags = await db.select({
        id: tags.id,
        name: tags.name
      }).from(tags);

      await connection.end();
    }

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
