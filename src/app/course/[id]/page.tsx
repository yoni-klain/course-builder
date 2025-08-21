// src/app/course/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { readError } from "@/lib/http";

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

type OutlineItem = {
  id: string;
  order_index: number;
  has_locale: boolean;
  title: string | null;
};
type OutlineResp = { lang: Lang; items: OutlineItem[] };

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
function isOutlineResp(u: unknown): u is OutlineResp {
  if (typeof u !== "object" || u === null) return false;
  const o = u as Record<string, unknown>;
  const items = o.items as unknown;
  const okItem = (x: unknown) =>
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).id === "string" &&
    typeof (x as Record<string, unknown>).order_index === "number" &&
    typeof (x as Record<string, unknown>).has_locale === "boolean";
  return (
    (o.lang === "ru" || o.lang === "en" || o.lang === "he") &&
    Array.isArray(items) &&
    items.every(okItem)
  );
}

/* =====================  Reusable Modal  ===================== */

function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  submitting?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const { open, title, children, submitting = false, submitLabel = "Сохранить", onClose, onSubmit } =
    props;
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            aria-label="Close"
            className="btn text-sm"
            onClick={onClose}
            disabled={submitting}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-3">{children}</div>
        {onSubmit && (
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={onClose} disabled={submitting} type="button">
              Отмена
            </button>
            <button className="btn" onClick={onSubmit} disabled={submitting} type="button">
              {submitting ? "Сохраняю…" : submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ======= Inline editor for course locale ======= */

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
  const { push } = useToast(); // ✅ внутри компонента

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${cid}/locale`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, title, description: desc }),
      });
      if (!res.ok) {
        push({
          variant: "error",
          title: "Не сохранилось",
          message: await readError(res),
          durationMs: 4000,
        });
        return;
      }
      push({ variant: "success", title: "Сохранено" });
    } catch (e: unknown) {
      push({
        variant: "error",
        title: "Ошибка сети",
        message: e instanceof Error ? e.message : String(e),
        durationMs: 4000,
      });
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

/* =====================  Page  ===================== */

export default function CoursePage() {
  const { push } = useToast(); // ✅ внутри компонента

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

  const [outline, setOutline] = useState<OutlineResp | null>(null);
  const [outlineErr, setOutlineErr] = useState<string | null>(null);
  const [outlineLoading, setOutlineLoading] = useState<boolean>(false);

  // Modals state
  const [moduleModal, setModuleModal] = useState<{
    open: boolean;
    mode: "create" | "rename";
    moduleId: string;
    initialTitle: string;
    initialSummary: string;
    submitting: boolean;
  }>({ open: false, mode: "create", moduleId: "", initialTitle: "", initialSummary: "", submitting: false });

  const [courseModal, setCourseModal] = useState<{
    open: boolean;
    submitting: boolean;
    initialTitle: string;
    initialDescription: string;
  }>({ open: false, submitting: false, initialTitle: "", initialDescription: "" });

  async function loadOutline(course: string, lng: Lang): Promise<void> {
    setOutlineLoading(true);
    setOutlineErr(null);
    try {
      const res = await fetch(`/api/courses/${course}/outline?lang=${lng}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: unknown = await res.json();
      if (!isOutlineResp(j)) throw new Error("Unexpected outline shape");
      setOutline(j);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutlineErr(msg);
      push({ variant: "error", title: "Ошибка загрузки outline", message: msg, durationMs: 4000 });
    } finally {
      setOutlineLoading(false);
    }
  }

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
        if (!cancel) {
          setData(j);
          void loadOutline(courseId, lang);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancel) setErr(msg);
        push({ variant: "error", title: "Не удалось загрузить курс", message: msg, durationMs: 4000 });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [courseId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (courseId) void loadOutline(courseId, lang);
  }, [courseId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const dir: "rtl" | "ltr" = lang === "he" ? "rtl" : "ltr";

  /* ========= handlers for module locale ========= */

  function openCreateModuleLocale(moduleId: string): void {
    setModuleModal({
      open: true,
      mode: "create",
      moduleId,
      initialTitle: "",
      initialSummary: "",
      submitting: false,
    });
  }
  function openRenameModuleLocale(moduleId: string, currentTitle: string | null): void {
    setModuleModal({
      open: true,
      mode: "rename",
      moduleId,
      initialTitle: currentTitle ?? "",
      initialSummary: "",
      submitting: false,
    });
  }
  async function submitModuleLocale(): Promise<void> {
    if (!data) return;
    setModuleModal((m) => ({ ...m, submitting: true }));
    try {
      const body =
        moduleModal.mode === "create"
          ? { lang, title: moduleModal.initialTitle, summary: moduleModal.initialSummary }
          : { lang, title: moduleModal.initialTitle, summary: moduleModal.initialSummary || undefined };

      const res = await fetch(`/api/modules/${moduleModal.moduleId}/locale`, {
        method: moduleModal.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        push({ variant: "error", title: "Не удалось", message: await readError(res), durationMs: 4000 });
        return;
      }
      await loadOutline(data.id, lang);
      push({
        variant: "success",
        title: moduleModal.mode === "create" ? "Модуль назван" : "Переименовано",
      });
      setModuleModal((m) => ({ ...m, open: false }));
    } catch (e: unknown) {
      push({
        variant: "error",
        title: "Ошибка сети",
        message: e instanceof Error ? e.message : String(e),
        durationMs: 4000,
      });
    } finally {
      setModuleModal((m) => ({ ...m, submitting: false }));
    }
  }

  /* ========= handlers for course locale create ========= */

  function openCreateCourseLocale(): void {
    setCourseModal({ open: true, submitting: false, initialTitle: "", initialDescription: "" });
  }
  async function submitCourseLocale(): Promise<void> {
    if (!data) return;
    setCourseModal((c) => ({ ...c, submitting: true }));
    try {
      const res = await fetch(`/api/courses/${data.id}/locale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          title: courseModal.initialTitle,
          description: courseModal.initialDescription,
        }),
      });
      if (!res.ok) {
        push({
          variant: "error",
          title: "Не создалась версия",
          message: await readError(res),
          durationMs: 4000,
        });
        return;
      }
      push({ variant: "success", title: "Версия создана", message: lang.toUpperCase() });
      window.location.href = `/course/${data.id}?lang=${lang}`;
    } catch (e: unknown) {
      push({
        variant: "error",
        title: "Ошибка сети",
        message: e instanceof Error ? e.message : String(e),
        durationMs: 4000,
      });
    } finally {
      setCourseModal((c) => ({ ...c, submitting: false }));
    }
  }

  return (
    <main dir={dir}>
      <a href="/library" className="mb-3 inline-block text-sm text-gray-400 hover:text-gray-200">
        ← Назад
      </a>
      <h1 className="mt-0 text-2xl font-semibold">Курс</h1>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2">
          <span className="text-sm text-gray-400">Язык контента</span>
          <select
            className="select"
            value={lang}
            onChange={(ev: ChangeEvent<HTMLSelectElement>) => {
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px,1fr]">
        {/* Outline */}
        <aside className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-medium">Модули</h3>
            {data && (
              <button
                className="btn"
                onClick={async () => {
                  const res = await fetch(`/api/courses/${data.id}/modules`, { method: "POST" });
                  if (!res.ok) {
                    push({
                      variant: "error",
                      title: "Ошибка создания модуля",
                      message: await readError(res),
                      durationMs: 4000,
                    });
                    return;
                  }
                  push({ variant: "success", title: "Модуль добавлен" });
                  await loadOutline(data.id, lang);
                }}
              >
                + Модуль
              </button>
            )}
          </div>

          {outlineLoading && <div className="text-sm text-gray-400">Загрузка…</div>}
          {outlineErr && <div className="text-sm text-red-400">Ошибка: {outlineErr}</div>}

          <ol className="m-0 list-decimal pl-5">
            {outline?.items.map((m) => (
              <li key={m.id} className="mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={m.has_locale ? "" : "text-gray-400"}>
                    {m.title ?? "(без названия)"}{" "}
                    <span className="text-xs opacity-60">#{m.order_index}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {!m.has_locale && <span className="badge">нет {lang}</span>}
                    {m.has_locale ? (
                      <button
                        className="btn text-xs"
                        onClick={() => openRenameModuleLocale(m.id, m.title)}
                        title="Переименовать"
                      >
                        ✏️
                      </button>
                    ) : (
                      <button
                        className="btn text-xs"
                        onClick={() => openCreateModuleLocale(m.id)}
                        title={`Создать версию ${lang}`}
                      >
                        + {lang}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {outline && outline.items.length === 0 && (
              <li className="text-gray-400">(пусто)</li>
            )}
          </ol>
        </aside>

        {/* Правая панель — карточка курса/редактор локали */}
        <section>
          {loading && <div className="mt-4">Загрузка…</div>}
          {err && <div className="mt-4 text-red-400">Ошибка: {err}</div>}

          {data && (
            <div className="card p-4">
              {data.missing ? (
                <div className="flex items-center justify-between gap-3">
                  <div>Для языка <b>{lang}</b> нет карточки курса.</div>
                  <button className="btn" onClick={openCreateCourseLocale}>
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
            </div>
          )}
        </section>
      </div>

      {/* ==== Module Locale Modal ==== */}
      <Modal
        open={moduleModal.open}
        title={
          moduleModal.mode === "create"
            ? `Заголовок модуля (${lang})`
            : `Переименовать модуль (${lang})`
        }
        submitting={moduleModal.submitting}
        onClose={() => setModuleModal((m) => ({ ...m, open: false }))}
        onSubmit={() => void submitModuleLocale()}
        submitLabel="Сохранить"
      >
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void submitModuleLocale();
          }}
          className="grid gap-3"
        >
          <label>
            <div className="mb-1 text-sm text-gray-400">Заголовок</div>
            <input
              className="input w-full"
              value={moduleModal.initialTitle}
              onChange={(ev) =>
                setModuleModal((m) => ({ ...m, initialTitle: ev.target.value }))
              }
              required
              maxLength={120}
              dir={dir}
            />
          </label>
          <label>
            <div className="mb-1 text-sm text-gray-400">Краткое описание (опционально)</div>
            <textarea
              className="input w-full font-inherit"
              rows={4}
              value={moduleModal.initialSummary}
              onChange={(ev) =>
                setModuleModal((m) => ({ ...m, initialSummary: ev.target.value }))
              }
              maxLength={4000}
              dir={dir}
            />
          </label>
        </form>
      </Modal>

      {/* ==== Course Locale Create Modal ==== */}
      <Modal
        open={courseModal.open}
        title={`Новая версия курса (${lang})`}
        submitting={courseModal.submitting}
        onClose={() => setCourseModal((c) => ({ ...c, open: false }))}
        onSubmit={() => void submitCourseLocale()}
        submitLabel="Создать"
      >
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void submitCourseLocale();
          }}
          className="grid gap-3"
        >
          <label>
            <div className="mb-1 text-sm text-gray-400">Заголовок</div>
            <input
              className="input w-full"
              value={courseModal.initialTitle}
              onChange={(ev) =>
                setCourseModal((c) => ({ ...c, initialTitle: ev.target.value }))
              }
              required
              maxLength={120}
              dir={dir}
            />
          </label>
          <label>
            <div className="mb-1 text-sm text-gray-400">Описание</div>
            <textarea
              className="input w-full font-inherit"
              rows={6}
              value={courseModal.initialDescription}
              onChange={(ev) =>
                setCourseModal((c) => ({ ...c, initialDescription: ev.target.value }))
              }
              maxLength={4000}
              dir={dir}
            />
          </label>
        </form>
      </Modal>
    </main>
  );
}
