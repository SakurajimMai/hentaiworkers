import express from 'express';
import cors from 'cors';
import { db } from './db';
import { animes } from './schema';
import { eq, desc } from 'drizzle-orm';

const app = express();
app.use(cors());
app.use(express.json());

// Get Recent Animes
app.get('/api/animes', async (req, res) => {
  try {
    const results = await db.select().from(animes).orderBy(desc(animes.createdAt)).limit(50).all();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get Anime by ID
app.get('/api/animes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await db.select().from(animes).where(eq(animes.id, id)).get();
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
