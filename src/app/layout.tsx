import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser, getActiveExam } from "@/server/current-user";
import { AppShell } from "@/components/shell/app-shell";
import { ImmersionProvider } from "@/components/i18n";
import { Toaster } from "@/components/motion";
import { FONT_ZOOM_SCRIPT, THEME_SCRIPT } from "@/components/theme";
import { isLiveConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "IELTS Active Learning Workspace",
  description:
    "Build a real second-language system: input → noticing → deep processing → retrieval → output → feedback → reuse.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cu = await getCurrentUser();
  const exam = await getActiveExam();
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">
        {/* set theme class + font zoom before first paint — no flash of wrong mode */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: FONT_ZOOM_SCRIPT }} />
        <ImmersionProvider level={cu?.profile.immersionLevel ?? 1}>
          {cu ? (
            <AppShell userName={cu.user.name} aiLive={isLiveConfigured()} examProfile={exam}>
              {children}
            </AppShell>
          ) : (
            <main className="min-h-screen">{children}</main>
          )}
          <Toaster />
        </ImmersionProvider>
      </body>
    </html>
  );
}
