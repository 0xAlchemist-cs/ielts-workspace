import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ieltscbImports } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { T } from "@/components/i18n";
import { ArrowRight, FileText } from "lucide-react";

/* ── External reading reports entry — the durable home for imported IELTSCB
 *    attempts. Without this the report page is reachable exactly once (at
 *    import time); now every import stays one click from the IELTS page. */

export async function ExternalReportsCard() {
  const cu = await requireUser();
  const rows = await db
    .select()
    .from(ieltscbImports)
    .where(eq(ieltscbImports.userId, cu.user.id))
    .orderBy(desc(ieltscbImports.updatedAt))
    .limit(12);

  if (!rows.length) return null;

  return (
    <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10">
            <FileText size={16} strokeWidth={1.8} className="text-accent-text" />
          </span>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
            <T en="External reading reports" zh="外部阅读报告" />
          </h3>
        </div>
        <Link href="/library?add=1" className="press text-[12px] font-medium text-accent-text">
          <T en="Import another →" zh="再导入一篇 →" />
        </Link>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        <T
          en="Real-exam passages you did on ieltscb.com — weakness analysis and attempt history live here."
          zh="你在 ieltscb.com 做的真题——弱项分析与多次答题记录都在这里。"
        />
      </p>
      <div className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={r.attemptId ? `/ielts/report/${r.attemptId}` : "/library?add=1"}
            className="group flex items-center gap-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink group-hover:text-accent-text">{r.title}</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-3">
                {r.breadcrumb ?? "IELTSCB"} ·{" "}
                {new Date(r.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </span>
            <ArrowRight size={14} className="shrink-0 text-ink-3 group-hover:text-accent-text" />
          </Link>
        ))}
      </div>
    </div>
  );
}
