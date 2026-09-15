import Link from "next/link";
import { T } from "@/components/i18n";

/* Global 404 — dead links happen when material is deleted from another tab or
 * an old report card outlives its content. Never a blank wall: say what
 * happened and give the way back. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col justify-center px-6">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink text-pretty">
        <T en="This page isn't here." zh="这个页面不存在。" />
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        <T
          en="The material may have been removed from your library. Everything else is right where you left it."
          zh="这份材料可能已从你的库中移除。其余内容都还在原来的地方。"
        />
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="btn-apple press inline-flex h-10 items-center rounded-lg px-5 text-[13.5px] font-medium text-white"
        >
          <T en="Back to Today" zh="回到今日" />
        </Link>
        <Link
          href="/library"
          className="press inline-flex h-10 items-center rounded-lg bg-surface-2 px-5 text-[13.5px] font-medium text-ink-2 hover:text-ink"
        >
          <T en="Open Library" zh="打开内容库" />
        </Link>
      </div>
    </div>
  );
}
