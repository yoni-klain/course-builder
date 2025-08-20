export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED = new Set(["ru", "en", "he"]);

export async function GET(req: NextRequest) {
    const lang = req.nextUrl.searchParams.get("lang") || "ru";
    if (!ALLOWED.has(lang)) {
        return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }

    const userId = process.env.DEV_USER_ID;
    if (!userId) {
        return NextResponse.json({ error: "DEV_USER_ID is not set" }, { status: 500 });
    }

    const sql = `
    SELECT c.id, l.lang, l.title, l.description,
           c.status, c.supported_langs, c.updated_at
    FROM course c
    JOIN course_locale l ON l.course_id = c.id
    WHERE l.lang = $1
      AND c.owner_id = $2
    ORDER BY c.updated_at DESC
  `;

    try {
        const { rows } = await pool.query(sql, [lang, userId]);
        return NextResponse.json(rows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "DB error", detail: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const userId = process.env.DEV_USER_ID;
    if (!userId) {
        return NextResponse.json({ error: "DEV_USER_ID is not set" }, { status: 500 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { lang, title, description } = (body ?? {}) as {
        lang?: string; title?: string; description?: string;
    };

    if (!lang || !ALLOWED.has(lang)) {
        return NextResponse.json({ error: "Invalid or missing 'lang'" }, { status: 400 });
    }

    const safeTitle = (title ?? {
        ru: "Новый курс",
        en: "New Course",
        he: "קורס חדש",
    }[lang as "ru" | "en" | "he"]).toString().slice(0, 120);

    const safeDesc = (description ?? "").toString().slice(0, 2000);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Тех. название курса (ключ) — можно будет заменить на slug
        const techTitle = `course-${Date.now()}`;

        const insertCourse = `
      INSERT INTO course (owner_id, title, supported_langs)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id, updated_at
    `;
        const { rows: [c] } = await client.query(insertCourse, [
            userId,
            techTitle,
            JSON.stringify([lang])
        ]);

        const insertLocale = `
      INSERT INTO course_locale (course_id, lang, title, description)
      VALUES ($1, $2, $3, $4)
    `;
        await client.query(insertLocale, [c.id, lang, safeTitle, safeDesc]);

        await client.query("COMMIT");
        return NextResponse.json({ id: c.id }, { status: 201 });
    } catch (err: unknown) {
        await client.query("ROLLBACK");
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "DB error", detail: message }, { status: 500 });
    } finally {
        client.release();
    }
}
