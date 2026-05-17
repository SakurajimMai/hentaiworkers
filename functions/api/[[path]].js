import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleMySQL } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { animes, tags, animeTags } from '../schema';
import { eq, desc, and, ne, inArray, sql } from 'drizzle-orm';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400,
}));

// Database connection middleware
app.use('*', async (c, next) => {
  const dbType = c.env.DB_TYPE || 'd1'; // 默认使用 D1

  if (dbType === 'd1') {
    // Use D1
    const db = drizzleD1(c.env.DB);
    c.set('db', db);
    c.set('dbType', 'd1');
    c.set('rawDb', c.env.DB); // 原始 D1 实例
  } else {
    // Use Hyperdrive (MySQL)
    const connection = await createConnection({
      host: c.env.HYPERDRIVE.host,
      user: c.env.HYPERDRIVE.user,
      password: c.env.HYPERDRIVE.password,
      database: c.env.HYPERDRIVE.database,
      port: c.env.HYPERDRIVE.port,
      socketPath: c.env.HYPERDRIVE.socketPath,
      disableEval: true
    });

    const db = drizzleMySQL(connection);
    c.set('db', db);
    c.set('dbType', 'hyperdrive');
    c.set('conn', connection);
  }

  try {
    await next();
  } finally {
    // Close MySQL connection if using Hyperdrive
    if (dbType === 'hyperdrive') {
      const conn = c.get('conn');
      if (conn) await conn.end();
    }
  }
});

app.get('/api/health', async (c) => {
  const dbType = c.get('dbType');

  try {
    if (dbType === 'd1') {
      const rawDb = c.get('rawDb');
      const result = await rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      return c.json({
        database: 'd1',
        tables: result.results
      });
    } else {
      const conn = c.get('conn');
      const [rows] = await conn.query('SHOW TABLES');
      return c.json({
        database: 'hyperdrive',
        tables: rows
      });
    }
  } catch (e) {
    console.error('Health Check Failed:', e);
    return c.json({ error: e.message, stack: e.stack }, 500);
  }
});

app.get('/api/animes', async (c) => {
  const db = c.get('db');

  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '48');
  const tagId = c.req.query('tag') ? parseInt(c.req.query('tag')) : null;
  const search = c.req.query('search');
  const sort = c.req.query('sort');

  const offset = (page - 1) * limit;
  const orderColumn = sort === 'popular' ? animes.viewCount : animes.createdAt;

  try {
      let query = db.select({
        id: animes.id,
        title: animes.title,
        cover: animes.cover,
        viewCount: animes.viewCount,
        titleEnglish: animes.titleEnglish,
      }).from(animes);

      let countQuery = db.select({ count: sql`count(*)` }).from(animes);

      // Apply search filter
      if (search) {
        const searchLike = `%${search}%`;
        const searchCondition = sql`(${animes.title} LIKE ${searchLike} OR ${animes.titleJapanese} LIKE ${searchLike})`;

        if (tagId) {
          query = query
            .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
            .where(and(eq(animeTags.tagId, tagId), searchCondition));

          countQuery = countQuery
            .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
            .where(and(eq(animeTags.tagId, tagId), searchCondition));
        } else {
          query = query.where(searchCondition);
          countQuery = countQuery.where(searchCondition);
        }
      } else if (tagId) {
        query = query
            .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
            .where(eq(animeTags.tagId, tagId));

        countQuery = countQuery
            .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
            .where(eq(animeTags.tagId, tagId));
      }

      const results = await query.orderBy(desc(orderColumn)).limit(limit).offset(offset);
      const [totalResult] = await countQuery;

      return c.json({
        data: results,
        pagination: {
          page,
          limit,
          total: Number(totalResult.count),
          totalPages: Math.ceil(Number(totalResult.count) / limit)
        }
      });
  } catch(e) {
      console.error('Fetch Animes Failed:', e);
      return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.get('/api/tags', async (c) => {
  const db = c.get('db');

  try {
    const allTags = await db.select({
        id: tags.id,
        name: tags.name,
    })
    .from(tags)
    .orderBy(tags.name);

    return c.json(allTags);
  } catch (e) {
    console.error('Tags Failed:', e);
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/animes/:id/similar', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  try {
    const currentAnime = await db.select({ title: animes.title }).from(animes).where(eq(animes.id, id));
    if (!currentAnime || currentAnime.length === 0) return c.json([]);

    const currentTags = await db.select({ id: animeTags.tagId })
      .from(animeTags)
      .where(eq(animeTags.animeId, id));

    const tagIds = currentTags.map(t => t.id);

    if (tagIds.length === 0) {
      const randoms = await db.select({
             id: animes.id,
             title: animes.title,
             cover: animes.cover,
             fanart: animes.fanart,
             viewCount: animes.viewCount,
      })
      .from(animes)
      .where(ne(animes.id, id))
      .orderBy(desc(animes.viewCount))
      .limit(12);
      return c.json(randoms);
    }

    const similarAnimes = await db.select({
        id: animes.id,
        title: animes.title,
        cover: animes.cover,
        fanart: animes.fanart,
        viewCount: animes.viewCount,
        matches: sql`count(${animeTags.tagId})`.as('match_count')
    })
    .from(animes)
    .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
    .where(
      and(
         inArray(animeTags.tagId, tagIds),
         ne(animes.id, id)
      )
    )
    .groupBy(animes.id)
    .orderBy(desc(sql`match_count`), desc(animes.viewCount))
    .limit(12);

    return c.json(similarAnimes);
  } catch (e) {
     console.error('Similar Failed:', e);
     return c.json({ error: e.message }, 500);
  }
});

app.get('/api/animes/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  try {
      const result = await db.select().from(animes).where(eq(animes.id, id));
      if (result.length === 0) return c.json({ error: 'Not found' }, 404);

      const anime = result[0];

      const tagResults = await db.select({
          id: tags.id,
          name: tags.name,
          description: tags.description
      })
      .from(tags)
      .innerJoin(animeTags, eq(tags.id, animeTags.tagId))
      .where(eq(animeTags.animeId, id));

      anime.tags = tagResults;

      return c.json(anime);
  } catch(e) {
      console.error(e);
      return c.json({error: e.message}, 500);
  }
});

export const onRequest = handle(app);
