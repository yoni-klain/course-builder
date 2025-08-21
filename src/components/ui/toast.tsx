// src/components/ui/toast.tsx
"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { createPortal } from "react-dom";

type Variant = "success" | "error" | "info";
export type ToastInput = {
    title?: string;
    message?: string;
    variant?: Variant;
    durationMs?: number; // default 2200
};
type Toast = Required<ToastInput> & { id: string };

type Ctx = {
    push: (t: ToastInput) => string;
    remove: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);
export function useToast(): Ctx {
    const ctx = useContext(ToastCtx);
    if (!ctx) throw new Error("useToast must be used within <ToastProvider/>");
    return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [mounted, setMounted] = useState(false);
    const [container, setContainer] = useState<HTMLElement | null>(null);

    // Маунтимся только в браузере
    useEffect(() => {
        setMounted(true);
        // доступ к document только в эффекте (клиент)
        setContainer(document.body);
    }, []);

    const remove = useCallback((id: string) => {
        setToasts((xs) => xs.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((input: ToastInput): string => {
        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2);
        const toast: Toast = {
            id,
            title: input.title ?? "",
            message: input.message ?? "",
            variant: input.variant ?? "info",
            durationMs: input.durationMs ?? 2200,
        };
        setToasts((xs) => [...xs, toast]);
        return id;
    }, []);

    // авто-скрытие только в браузере
    useEffect(() => {
        if (!mounted) return;
        const timers = toasts.map((t) => window.setTimeout(() => remove(t.id), t.durationMs));
        return () => timers.forEach(clearTimeout);
    }, [toasts, remove, mounted]);

    const value = useMemo(() => ({ push, remove }), [push, remove]);

    return (
        <ToastCtx.Provider value={value}>
            {children}
            {mounted && container
                ? createPortal(
                    <div
                        className="pointer-events-none fixed inset-x-0 top-4 z-[1000] flex justify-center sm:inset-auto sm:right-4 sm:left-auto sm:flex-col sm:gap-2"
                        aria-live="polite"
                        role="status"
                    >
                        {toasts.map((t) => (
                            <div
                                key={t.id}
                                className="pointer-events-auto mb-2 w-[min(92vw,380px)] rounded-xl border border-gray-700 bg-gray-900/95 p-3 shadow-lg backdrop-blur sm:mb-0"
                            >
                                <div className="flex items-start gap-3">
                                    <span
                                        className={
                                            "mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full " +
                                            (t.variant === "success"
                                                ? "bg-green-400"
                                                : t.variant === "error"
                                                    ? "bg-red-400"
                                                    : "bg-blue-400")
                                        }
                                    />
                                    <div className="min-w-0">
                                        {t.title && <div className="text-sm font-medium">{t.title}</div>}
                                        {t.message && (
                                            <div className="break-words text-sm text-gray-300">{t.message}</div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => remove(t.id)}
                                        className="ml-auto -mr-1 rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                                        aria-label="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>,
                    container
                )
                : null}
        </ToastCtx.Provider>
    );
}
