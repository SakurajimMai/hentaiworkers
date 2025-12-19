import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { animes, tags, animeTags } from '../schema';
import { eq, desc, and, ne, inArray, sql } from 'drizzle-orm';

const app = new Hono();

// Middleware to inject DB
app.use('*', async (c, next) => {
  const connection = await createConnection({
    host: c.env.HYPERDRIVE.host,
    user: c.env.HYPERDRIVE.user,
    password: c.env.HYPERDRIVE.password,
    database: c.env.HYPERDRIVE.database,
    port: c.env.HYPERDRIVE.port,
    socketPath: c.env.HYPERDRIVE.socketPath,
    disableEval: true
  });

  const db = drizzle(connection);
  c.set('db', db);
  c.set('conn', connection);

  try {
    await next();
  } finally {
    await connection.end();
  }
});

app.get('/api/health', async (c) => {
  const conn = c.get('conn');
  try {
    const [rows] = await conn.query('SHOW TABLES');
    return c.json({ tables: rows });
  } catch (e) {
    console.error('Health Check Failed:', e);
    return c.json({ error: e.message, stack: e.stack }, 500);
  }
});

app.get('/api/animes', async (c) => {
  const db = c.get('db');

  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const tagId = c.req.query('tag') ? parseInt(c.req.query('tag')) : null;
  const search = c.req.query('search');

  const offset = (page - 1) * limit;

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

      const results = await query.orderBy(desc(animes.createdAt)).limit(limit).offset(offset);
      const [totalResult] = await countQuery;

      return c.json({
        data: results,
        pagination: {
          page,
          limit,
          total: totalResult.count,
          totalPages: Math.ceil(totalResult.count / limit)
        }
      });
  } catch(e) {
      console.error('Fetch Animes Failed:', e);
      return c.json({ error: e.message, code: e.code }, 500);
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
