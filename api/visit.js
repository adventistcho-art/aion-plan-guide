import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = process.env.DATABASE_URL;
  if (!url) {
    return res.status(503).json({ ok: false, error: "DATABASE_URL not configured" });
  }

  try {
    const sql = neon(url);
    await sql`
      CREATE TABLE IF NOT EXISTS guide_visits (
        id BIGSERIAL PRIMARY KEY,
        path TEXT NOT NULL DEFAULT '/',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    if (req.method === "POST") {
      const path = typeof req.body?.path === "string" ? req.body.path.slice(0, 200) : "/";
      await sql`INSERT INTO guide_visits (path) VALUES (${path})`;
      return res.status(201).json({ ok: true });
    }

    if (req.method === "GET") {
      const rows = await sql`SELECT COUNT(*)::int AS count FROM guide_visits`;
      return res.status(200).json({ ok: true, visits: rows[0]?.count ?? 0 });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Database error" });
  }
}
