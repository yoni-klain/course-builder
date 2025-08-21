// src/lib/http.ts
export async function readError(res: Response): Promise<string> {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        try {
            const j = (await res.json()) as { error?: unknown; detail?: unknown; message?: unknown };
            const msg = j.detail ?? j.error ?? j.message;
            return msg ? String(msg) : `HTTP ${res.status}`;
        } catch {
            /* ignore */
        }
    }
    const text = await res.text().catch(() => "");
    return text ? `HTTP ${res.status}\n${text.slice(0, 200)}` : `HTTP ${res.status}`;
}
