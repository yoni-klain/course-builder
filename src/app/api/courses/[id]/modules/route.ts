// src/app/api/courses/[id]/modules/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params; // id курса
    if (!isUUID(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const userId = process.env.DEV_USER_ID;
    if (!userId) return NextResponse.json({ error: "No DEV_USER_ID" }, { status: 401 });

    try {
        // курс есть?
        const cr = await pool.query<{ owner_id: string }>(
            `SELECT owner_id FROM course WHERE id=$1`,
            [id]
        );
        if (cr.rowCount === 0) return NextResponse.json({ error: "Course not found" }, { status: 404 });

        // это твой курс?
        if (cr.rows[0].owner_id !== userId) {
            return NextResponse.json({ error: "Forbidden: not your course" }, { status: 403 });
        }

        // следующий order_index = max+1
        const maxQ = await pool.query<{ max: number }>(
            `SELECT COALESCE(MAX(order_index), 0) AS max FROM module WHERE course_id=$1`,
            [id]
        );
        const nextOrder = Number(maxQ.rows[0].max) + 1;

        const ins = await pool.query(
            `INSERT INTO module (course_id, order_index)
       VALUES ($1, $2)
       RETURNING id, order_index`,
            [id, nextOrder]
        );

        return NextResponse.json(
            { id: String(ins.rows[0].id), order_index: Number(ins.rows[0].order_index) },
            { status: 201 }
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 });
    }
}
