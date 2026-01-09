import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleMySQL } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { animes, tags, animeTags } from '../schema';

export async function onRequest(context) {
  // 验证 API Key
  const authHeader = context.request.headers.get('Authorization');
  const expectedToken = context.env.ADMIN_API_KEY || 'your-secret-key';

  if (authHeader !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await context.request.json();
    const { animes: animesData, tags: tagsData } = body;

    const dbType = context.env.DB_TYPE || 'd1';
    let db;

    if (dbType === 'd1') {
      db = drizzleD1(context.env.DB);
    } else {
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
    }

    let insertedAnimes = 0;
    let insertedTags = 0;

    // 批量插入 tags - 使用 onConflictDoNothing 忽略已存在的标签
    if (tagsData && tagsData.length > 0) {
      try {
        await db.insert(tags).values(tagsData).onConflictDoNothing();
        insertedTags = tagsData.length;
      } catch (tagError) {
        console.error('Tags insert error:', tagError);
        // 继续处理，不中断
      }
    }

    // 批量插入 animes - 使用 onConflictDoNothing 忽略已存在的动漫
    if (animesData && animesData.length > 0) {
      try {
        await db.insert(animes).values(animesData).onConflictDoNothing();
        insertedAnimes = animesData.length;
      } catch (animeError) {
        console.error('Animes insert error:', animeError);
        // 继续处理，不中断
      }
    }

    if (dbType === 'hyperdrive') {
      const conn = context.get('conn');
      if (conn) await conn.end();
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: {
        animes: insertedAnimes,
        tags: insertedTags
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

