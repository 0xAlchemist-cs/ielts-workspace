"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Language display modes (stored as legacy immersion levels 1–4 in the DB):
 *  levels 1–2 → BILINGUAL (English + Chinese assistance)
 *  levels 3–4 → IMMERSION (English only; Chinese hidden unless essential) */
export const ImmersionContext = createContext<number>(1);

export function ImmersionProvider({ level, children }: { level: number; children: ReactNode }) {
  return <ImmersionContext.Provider value={level}>{children}</ImmersionContext.Provider>;
}

export function useImmersion(): number {
  return useContext(ImmersionContext);
}

/** true when Chinese assistance should be shown. */
export function useBilingual(): boolean {
  return useContext(ImmersionContext) <= 2;
}

/** Bilingual UI label: English always; Chinese subtitle in bilingual mode only.
 *  The zh span INHERITS the parent colour (white on blue banners, ink on cards)
 *  at reduced opacity — never hardcode a grey, or it clashes on tinted surfaces.
 *  `stack` renders zh as a second line instead of inline — for narrow chips
 *  where "Retrieve 提取" would otherwise truncate.
 *  en/zh accept ReactNode so a highlighted word can sit inside the sentence. */
export function T({
  en,
  zh,
  className,
  stack,
}: {
  en: ReactNode;
  zh?: ReactNode;
  className?: string;
  stack?: boolean;
}) {
  const bilingual = useBilingual();
  if (zh && bilingual) {
    if (stack) {
      return (
        <span className={`flex flex-col items-center leading-tight ${className ?? ""}`}>
          {en}
          <span className="text-[10px] font-medium tracking-normal opacity-[0.72]">{zh}</span>
        </span>
      );
    }
    return (
      <span className={className}>
        {en}
        <span className="ml-2 text-[12px] font-medium tracking-normal opacity-[0.72]">{zh}</span>
      </span>
    );
  }
  return <span className={className}>{en}</span>;
}
