"use client";

import { useEffect, useState } from "react";

type CourseCard = {
    id: string;
    lang: "ru" | "en" | "he";
    title: string;
    description: string | null;
    status: string;
    supported_langs: string[];
    updated_at: string;
};

const LANGS = ["ru", "en", "he"] as const;

export default function LibraryPage() {
    const [lang, setLang] = useState<"ru" | "en" | "he">("he");
    const [items, setItems] = useState<CourseCard[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // New course form
    const [newTitle, setNewTitle] = useState("");
    const [creating, setCreating] = useState(false);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/courses?lang=${lang}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as CourseCard[];
            setItems(data);
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [lang]);

    async function createCourse() {
        setCreating(true);
        setErr(null);
        try {
            const res = await fetch("/api/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang, title: newTitle || undefined }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.detail || j.error || `HTTP ${res.status}`);
            }
            setNewTitle("");
            await load(); // refresh list
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setCreating(false);
        }
    }

    return (
        <main dir={lang === "he" ? "rtl" : "ltr"}>
            <h1 className="mb-4 text-2xl font-semibold">Библиотека</h1>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2">
                    <span className="text-sm text-gray-400">Язык контента</span>
                    <select className="select" value={lang} onChange={(e) => setLang(e.target.value as any)}>
                        {LANGS.map((L) => <option key={L} value={L}>{L}</option>)}
                    </select>
                </label>

                <div className="inline-flex items-center gap-2">
                    <input
                        className="input min-w-[220px]"
                        placeholder={lang === "ru" ? "Название курса" : lang === "he" ? "שם הקורס" : "Course title"}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                    />
                    <button className="btn" onClick={createCourse} disabled={creating}>
                        {creating ? "Создаю…" : "Создать курс"}
                    </button>
                </div>
            </div>

            {loading && <div>Загрузка…</div>}
            {err && <div className="text-red-400">Ошибка: {err}</div>}

            <div className="grid gap-3">
                {items.map((c) => (
                    <article key={c.id} className="card p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span>id: {c.id}</span>
                            <span className="badge">lang: {c.lang}</span>
                            <span className="badge">status: {c.status}</span>
                        </div>
                        <h3 className="mb-2 text-lg font-medium">{c.title}</h3>
                        <p className="m-0 text-gray-200">{c.description}</p>
                        <div className="mt-3">
                            <a className="btn" href={`/course/${c.id}?lang=${lang}`}>Открыть</a>
                        </div>
                    </article>
                ))}
                {!loading && !err && items.length === 0 && <div className="text-gray-400">Нет курсов для этого языка.</div>}
            </div>
        </main>
    );

}
