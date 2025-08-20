// src/app/api/courses/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED = new Set(["ru", "en", "he"]);
const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }   // 👈 params — Promise
) {
    const { id } = await ctx.params;           // 👈 await params
    const lang = (req.nextUrl.searchParams.get("lang") || "ru") as "ru" | "en" | "he";
    if (!ALLOWED.has(lang)) {
        return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }
    if (!isUUID(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        const cr = await client.query(
            `SELECT id, status, supported_langs, updated_at
       FROM course WHERE id = $1`,
            [id]
        );
        if (cr.rowCount === 0) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const langs = await client.query(
            `SELECT lang FROM course_locale WHERE course_id=$1 ORDER BY lang`,
            [id]
        );
        const available = langs.rows.map(r => r.lang as "ru" | "en" | "he");

        const lr = await client.query(
            `SELECT lang, title, description
       FROM course_locale WHERE course_id=$1 AND lang=$2`,
            [id, lang]
        );
        const locale = lr.rows[0] || null;

        return NextResponse.json({
            id: cr.rows[0].id,
            status: cr.rows[0].status,
            supported_langs: cr.rows[0].supported_langs,
            updated_at: cr.rows[0].updated_at,
            available_langs: available,
            requested_lang: lang,
            missing: !locale,
            locale,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "DB error", detail: message }, { status: 500 });
    } finally {
        client.release();
    }
}
