// src/app/api/modules/[id]/locale/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Lang = "ru" | "en" | "he";
const ALLOWED = new Set<Lang>(["ru", "en", "he"]);

const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const isLang = (v: unknown): v is Lang =>
    typeof v === "string" && (ALLOWED as Set<string>).has(v);

async function ensureOwnerByModule(moduleId: string, userId: string): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT 1
       FROM module m
       JOIN course c ON c.id = m.course_id
      WHERE m.id = $1 AND c.owner_id = $2`,
        [moduleId, userId]
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
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { lang, title, summary } = (body ?? {}) as {
        lang?: unknown; title?: unknown; summary?: unknown;
    };

    if (!isLang(lang)) return NextResponse.json({ error: "Invalid lang" }, { status: 400 });

    const ttl = String(title ?? "").trim();
    if (!ttl) return NextResponse.json({ error: "Title required" }, { status: 400 });

    const sum = String(summary ?? "");

    try {
        if (!(await ensureOwnerByModule(id, userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // уникальный ключ: (module_id, lang)
        const ins = await pool.query(
            `INSERT INTO module_locale (module_id, lang, title, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (module_id, lang) DO NOTHING
       RETURNING module_id, lang`,
            [id, lang, ttl.slice(0, 120), sum.slice(0, 4000)]
        );
        if (ins.rowCount === 0) {
            return NextResponse.json({ error: "Locale exists" }, { status: 409 });
        }

        return NextResponse.json({ ok: true }, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
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
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { lang, title, summary } = (body ?? {}) as {
        lang?: unknown; title?: unknown; summary?: unknown;
    };

    if (!isLang(lang)) return NextResponse.json({ error: "Invalid lang" }, { status: 400 });

    try {
        if (!(await ensureOwnerByModule(id, userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const r = await pool.query(
            `UPDATE module_locale
          SET title   = COALESCE($3, title),
              summary = COALESCE($4, summary)
        WHERE module_id = $1 AND lang = $2`,
            [id, lang, typeof title === "string" ? title.slice(0, 120) : null,
                typeof summary === "string" ? summary.slice(0, 4000) : null]
        );

        if (!r.rowCount) {
            return NextResponse.json({ error: "Locale not found" }, { status: 404 });
        }

        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
    }
}
