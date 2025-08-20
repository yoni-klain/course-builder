export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED = new Set(["ru", "en", "he"]);
const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

async function ensureOwner(courseId: string, userId: string) {
    const { rows } = await pool.query(
        `SELECT 1 FROM course WHERE id=$1 AND owner_id=$2`,
        [courseId, userId]
    );
    return rows.length > 0;
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params;
    if (!isUUID(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const userId = process.env.DEV_USER_ID;
    if (!userId) return NextResponse.json({ error: "DEV_USER_ID is not set" }, { status: 500 });

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const { lang, title, description } = (body ?? {}) as { lang?: string; title?: string; description?: string };

    if (!lang || !ALLOWED.has(lang)) return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    const ttl = (title ?? "").toString().trim();
    if (!ttl) return NextResponse.json({ error: "Title required" }, { status: 400 });
    const desc = (description ?? "").toString();

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Владелец?
        const ok = await ensureOwner(id, userId);
        if (!ok) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Создаём локаль (если уже есть — вернём 409)
        const exists = await client.query(
            `SELECT 1 FROM course_locale WHERE course_id=$1 AND lang=$2`,
            [id, lang]
        );
        if (exists.rowCount) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Locale exists" }, { status: 409 });
        }

        await client.query(
            `INSERT INTO course_locale (course_id, lang, title, description)
       VALUES ($1, $2, $3, $4)`,
            [id, lang, ttl.slice(0, 120), desc.slice(0, 4000)]
        );

        // Добавим язык в supported_langs, если его там нет
        await client.query(
            `UPDATE course
         SET supported_langs = (
           SELECT CASE
             WHEN NOT (supported_langs ? $2)
             THEN supported_langs || to_jsonb($3::text)
             ELSE supported_langs
           END
         ),
             updated_at = now()
       WHERE id=$1`,
            [id, lang, lang]
        );

        await client.query("COMMIT");
        return NextResponse.json({ ok: true }, { status: 201 });
    } catch (err: unknown) {
        await client.query("ROLLBACK");
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params;
    if (!isUUID(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const userId = process.env.DEV_USER_ID;
    if (!userId) return NextResponse.json({ error: "DEV_USER_ID is not set" }, { status: 500 });

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const { lang, title, description } = (body ?? {}) as { lang?: string; title?: string; description?: string };

    if (!lang || !ALLOWED.has(lang)) return NextResponse.json({ error: "Invalid lang" }, { status: 400 });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const ok = await ensureOwner(id, userId);
        if (!ok) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const r = await client.query(
            `UPDATE course_locale
         SET title = COALESCE($3, title),
             description = COALESCE($4, description)
       WHERE course_id=$1 AND lang=$2
       RETURNING lang`,
            [id, lang, title?.slice(0, 120), description?.slice(0, 4000)]
        );
        if (!r.rowCount) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Locale not found" }, { status: 404 });
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        await client.query("ROLLBACK");
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
    } finally {
        client.release();
    }
}
