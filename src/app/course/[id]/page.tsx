// src/app/course/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Lang = "ru" | "en" | "he";
const LANGS: readonly Lang[] = ["ru", "en", "he"] as const;

type CourseResp = {
    id: string;
    status: string;
    supported_langs: string[];
    updated_at: string;
    available_langs: Lang[];
    requested_lang: Lang;
    missing: boolean;
    locale: null | { lang: Lang; title: string; description: string | null };
};

function isLang(v: string): v is Lang {
    return (LANGS as readonly string[]).includes(v);
}

function isCourseResp(u: unknown): u is CourseResp {
    if (typeof u !== "object" || u === null) return false;
    const o = u as Record<string, unknown>;
    const okString = (x: unknown) => typeof x === "string";
    const okBool = (x: unknown) => typeof x === "boolean";
    const okLang = (x: unknown) => typeof x === "string" && isLang(x);
    const okLangArray = (x: unknown) =>
        Array.isArray(x) && x.every((i) => typeof i === "string" && isLang(i));
    const okStrArray = (x: unknown) => Array.isArray(x) && x.every((i) => typeof i === "string");
    const okLocale =
        o.locale === null ||
        (typeof o.locale === "object" &&
            o.locale !== null &&
            okLang((o.locale as Record<string, unknown>).lang) &&
            okString((o.locale as Record<string, unknown>).title));
    return (
        okString(o.id) &&
        okString(o.status) &&
        okStrArray(o.supported_langs) &&
        okString(o.updated_at) &&
        okLangArray(o.available_langs) &&
        okLang(o.requested_lang) &&
        okBool(o.missing) &&
        okLocale
    );
}

function LocaleEditor(props: {
    cid: string;
    lang: Lang;
    titleInit: string;
    descInit: string;
    dir: "rtl" | "ltr";
}) {
    const { cid, lang, titleInit, descInit, dir } = props;
    const [title, setTitle] = useState<string>(titleInit);
    const [desc, setDesc] = useState<string>(descInit);
    const [saving, setSaving] = useState<boolean>(false);

    async function save(): Promise<void> {
        setSaving(true);
        try {
            const res = await fetch(`/api/courses/${cid}/locale`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang, title, description: desc }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `HTTP ${res.status}`);
            }
            alert("Сохранено");
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid max-w-2xl gap-3">
            <label>
                <div className="mb-1 text-sm text-gray-400">Заголовок</div>
                <input
                    dir={dir}
                    value={title}
                    onChange={(ev) => setTitle(ev.target.value)}
                    className="input w-full"
                />
            </label>
            <label>
                <div className="mb-1 text-sm text-gray-400">Описание</div>
                <textarea
                    dir={dir}
                    value={desc}
                    onChange={(ev) => setDesc(ev.target.value)}
                    rows={6}
                    className="input w-full font-inherit"
                />
            </label>
            <div>
                <button onClick={save} disabled={saving} className="btn">
                    {saving ? "Сохраняю…" : "Сохранить"}
                </button>
            </div>
        </div>
    );
}

export default function CoursePage() {
    const params = useParams<{ id: string | string[] }>();
    const courseId = useMemo<string | null>(() => {
        const raw = params.id;
        if (!raw) return null;
        return Array.isArray(raw) ? raw[0] : raw;
    }, [params.id]);

    const search = useSearchParams();
    const initialLang = (() => {
        const q = search.get("lang");
        return q && isLang(q) ? q : "ru";
    })();

    const [lang, setLang] = useState<Lang>(initialLang);
    const [data, setData] = useState<CourseResp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (!courseId) return;
        let cancel = false;
        (async () => {
            setLoading(true);
            setErr(null);
            try {
                const res = await fetch(`/api/courses/${courseId}?lang=${lang}`, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const j: unknown = await res.json();
                if (!isCourseResp(j)) throw new Error("Unexpected response shape");
                if (!cancel) setData(j);
            } catch (e: unknown) {
                if (!cancel) setErr(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => {
            cancel = true;
        };
    }, [courseId, lang]);

    const dir: "rtl" | "ltr" = lang === "he" ? "rtl" : "ltr";

    return (
        <main dir={dir}>
            <a href="/library" className="mb-3 inline-block text-sm text-gray-400 hover:text-gray-200">
                ← Назад
            </a>
            <h1 className="mt-0 text-2xl font-semibold">Курс</h1>

            <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2">
                    <span className="text-sm text-gray-400">Язык контента</span>
                    <select
                        className="select"
                        value={lang}
                        onChange={(ev: React.ChangeEvent<HTMLSelectElement>) => {
                            const v = ev.target.value;
                            setLang(isLang(v) ? v : "ru");
                        }}
                    >
                        {LANGS.map((L) => (
                            <option key={L} value={L}>
                                {L}
                            </option>
                        ))}
                    </select>
                </label>

                {data && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="badge">status: {data.status}</span>
                        <span className="text-gray-400">
                            доступно: {data.available_langs.join(", ") || "—"}
                        </span>
                    </div>
                )}
            </div>

            {loading && <div className="mt-4">Загрузка…</div>}
            {err && <div className="mt-4 text-red-400">Ошибка: {err}</div>}

            {data && (
                <section className="mt-4 card p-4">
                    {data.missing ? (
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                Для языка <b>{lang}</b> нет карточки.
                            </div>
                            <button
                                className="btn"
                                onClick={async () => {
                                    const t = prompt(
                                        lang === "he"
                                            ? "כותרת לקורס"
                                            : lang === "en"
                                                ? "Course title"
                                                : "Название курса"
                                    );
                                    if (!t || !t.trim()) return;
                                    const res = await fetch(`/api/courses/${data.id}/locale`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ lang, title: t }),
                                    });
                                    if (!res.ok) {
                                        const text = await res.text().catch(() => "");
                                        alert(text || `HTTP ${res.status}`);
                                        return;
                                    }
                                    // обновим страницу в выбранной локали
                                    window.location.href = `/course/${data.id}?lang=${lang}`;
                                }}
                            >
                                Создать версию для {lang}
                            </button>
                        </div>
                    ) : (
                        <>
                            <h2 className="mb-2 text-lg font-medium">{data.locale!.title}</h2>
                            <p className="m-0 mb-4 whitespace-pre-wrap">{data.locale!.description}</p>
                            <LocaleEditor
                                cid={data.id}
                                lang={lang}
                                titleInit={data.locale!.title}
                                descInit={data.locale!.description ?? ""}
                                dir={dir}
                            />
                        </>
                    )}
                </section>
            )}
        </main>
    );
}
