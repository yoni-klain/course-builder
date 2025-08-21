export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Lang = "ru" | "en" | "he";
const ALLOWED = new Set<Lang>(["ru", "en", "he"]);
const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

type OutlineItem = {
    id: string;
    order_index: number;
    has_locale: boolean;
    title: string | null;
};

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params;
    const lang = (req.nextUrl.searchParams.get("lang") || "ru") as Lang;
    if (!isUUID(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (!ALLOWED.has(lang)) return NextResponse.json({ error: "Invalid lang" }, { status: 400 });

    try {
        const { rows } = await pool.query(
            `
      SELECT m.id, m.order_index,
             (ml.module_id IS NOT NULL) AS has_locale,
             ml.title
      FROM module m
      LEFT JOIN module_locale ml
        ON ml.module_id = m.id AND ml.lang = $2
      WHERE m.course_id = $1
      ORDER BY m.order_index ASC
      `,
            [id, lang]
        );

        const data: OutlineItem[] = rows.map((r) => ({
            id: String(r.id),
            order_index: Number(r.order_index),
            has_locale: Boolean(r.has_locale),
            title: r.title ?? null,
        }));

        return NextResponse.json({ lang, items: data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
    }
}
