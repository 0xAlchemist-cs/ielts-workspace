"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Moon, PlugZap, Sun, Trash2 } from "lucide-react";
import {
  clearAIProviderConfigAction,
  saveAIProviderConfigAction,
  setDailyMinutesAction,
  setImmersionLevelAction,
  testAIProviderConfigAction,
} from "@/app/actions";
import { T } from "@/components/i18n";
import { btn, inputCls } from "@/components/ui";
import { applyTheme } from "@/components/theme";

/* ── Settings view — quiet cards, one decision per row ────────────────────── */

function Row({
  titleEn,
  titleZh,
  descEn,
  descZh,
  children,
}: {
  titleEn: string;
  titleZh: string;
  descEn?: string;
  descZh?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-ink">
          <T en={titleEn} zh={titleZh} />
        </div>
        {descEn && descZh && (
          <div className="mt-0.5 max-w-md text-[12px] leading-relaxed text-ink-3">
            <T en={descEn} zh={descZh} />
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: V; label: React.ReactNode; title?: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-lg bg-surface-2 p-0.5 transition-opacity duration-150 ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
      role="group"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`press inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const IMMERSION = [
  { value: 1, label: "中英", title: "Bilingual — English + Chinese assistance 中英辅助" },
  { value: 4, label: "沉浸", title: "Immersion — English only 纯英文环境" },
];

const MINUTES = [15, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m}′` }));

type AIStatus = {
  live: boolean;
  baseUrl?: string;
  model?: string;
  keyMask?: string;
  source: "settings" | "env" | "none";
};

/** AI provider card — fill the key here; no .env.local editing, no restart. */
function AIProviderCard({ status }: { status: AIStatus }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(status.model && status.model !== "glm-4.6" ? status.model : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  const keyPlaceholder = status.live
    ? `Saved ${status.keyMask} — enter a new key to replace（已保存，输入新 Key 可替换）`
    : "sk-…（API Key，只保存在本机数据库）";

  const save = () =>
    startSave(async () => {
      setMsg(null);
      const r = await saveAIProviderConfigAction({ baseUrl, apiKey, model });
      if (r.ok) {
        setApiKey("");
        setMsg({ ok: true, text: "Saved — every AI feature now uses this provider. 已保存，全站 AI 立即生效。" });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "Save failed" });
      }
    });

  const test = () =>
    startTest(async () => {
      setMsg(null);
      // Test what's in the form; fall back to the saved config for empty fields.
      const r = await testAIProviderConfigAction({
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        model: model.trim() || undefined,
      });
      // A passing test on unsaved form values is NOT a connection yet — remind.
      const unsaved = apiKey.trim() !== "" || baseUrl.trim() !== (status.baseUrl ?? "");
      setMsg(
        r.ok
          ? {
              ok: true,
              text: `✓ Connection passed 连接通过 — ${r.message}${
                unsaved
                  ? " · Not saved yet — click Save & activate to keep it. 尚未保存，点「保存并启用」才会生效。"
                  : ""
              }`,
            }
          : { ok: false, text: r.message },
      );
    });

  const remove = () =>
    startSave(async () => {
      setMsg(null);
      setConfirmRemove(false);
      await clearAIProviderConfigAction();
      setApiKey("");
      setMsg({ ok: true, text: "Removed — back to Mock AI (or .env.local if present). 已移除，回到 Mock 模式。" });
      router.refresh();
    });

  return (
    <section className="card-specular rounded-card bg-surface">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <span className="t-overline">
          <T en="AI Provider" zh="AI 提供商" />
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium ${
            status.live ? "bg-ok/12 text-ok-text" : "bg-warn/12 text-warn-text"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.live ? "bg-ok" : "bg-warn"}`} />
          {status.live ? "Live" : "Mock"}
        </span>
      </div>

      <div className="space-y-4 px-6 py-5">
        <p className="text-[12px] leading-relaxed text-ink-3">
          {status.live ? (
            <T
              en={`Connected${status.source === "env" ? " via .env.local" : ""} — all feedback is real AI. Saved credentials stay in this machine's local database.`}
              zh={`已连接${status.source === "env" ? "（来自 .env.local）" : ""} — 所有反馈均为真实模型。凭据只保存在本机数据库。`}
            />
          ) : (
            <T
              en="Running on offline Mock AI — feedback is template-grade. Paste any OpenAI-compatible endpoint (GLM, OpenAI, DeepSeek, …) below; it takes effect immediately, no restart."
              zh="当前为离线 Mock AI — 反馈是模板级的。在下方填入任意 OpenAI 兼容端点（智谱 GLM、OpenAI、DeepSeek 等），保存后立即生效，无需重启。"
            />
          )}
        </p>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-3">
            <T en="Base URL" zh="接口地址" />
          </span>
          <input
            className={inputCls}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://open.bigmodel.cn/api/paas/v4"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-3">
            <T en="API Key" zh="API Key" />
          </span>
          <input
            className={inputCls}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyPlaceholder}
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-3">
            <T en="Model (optional)" zh="模型（可选）" />
          </span>
          <input
            className={inputCls}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="glm-4.6"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button type="button" onClick={save} disabled={saving || !baseUrl.trim() || !apiKey.trim()} className={btn.primary}>
            <KeyRound size={14} strokeWidth={1.9} />
            {saving ? <T en="Saving…" zh="保存中…" /> : <T en="Save & activate" zh="保存并启用" />}
          </button>
          <button type="button" onClick={test} disabled={testing || (!status.live && !baseUrl.trim())} className={btn.secondary}>
            <PlugZap size={14} strokeWidth={1.9} />
            {testing ? <T en="Testing…" zh="测试中…" /> : <T en="Test connection" zh="测试连接" />}
          </button>
          {status.source === "settings" && (
            <button
              type="button"
              onClick={() => {
                // two-step confirm — one stray click must not wipe the key
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return;
                }
                remove();
              }}
              onBlur={() => setConfirmRemove(false)}
              disabled={saving}
              className={`${btn.danger} ${confirmRemove ? "bg-err/15 text-err-text" : ""}`}
            >
              <Trash2 size={13} strokeWidth={1.9} />
              {confirmRemove ? (
                <T en="Confirm remove?" zh="确认移除？" />
              ) : (
                <T en="Remove" zh="移除" />
              )}
            </button>
          )}
        </div>

        {msg && (
          <p className={`text-[12px] leading-relaxed ${msg.ok ? "text-ok-text" : "text-err-text"}`}>{msg.text}</p>
        )}
      </div>
    </section>
  );
}

export function SettingsView({
  userName,
  immersionLevel,
  dailyMinutes,
  aiStatus,
}: {
  userName: string;
  immersionLevel: number;
  dailyMinutes: number;
  aiStatus: AIStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate current theme once
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-display">
          <T en="Settings" zh="设置" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T en="Tune the workspace to your habits." zh="按你的习惯调整工作台。" />
        </p>
      </header>
      <section className="card-specular rounded-card bg-surface">
        <div className="border-b border-line px-6 py-4">
          <span className="t-overline">
            <T en="Appearance" zh="外观" />
          </span>
        </div>
        <Row
          titleEn="Theme"
          titleZh="主题"
          descEn="Light for daytime focus, dark for evening calm."
          descZh="白天用浅色专注，夜晚用深色沉静。"
        >
          {theme && (
            <Segmented<"light" | "dark">
              value={theme}
              onChange={(v) => {
                setTheme(v);
                applyTheme(v === "dark");
              }}
              options={[
                {
                  value: "light",
                  label: (
                    <>
                      <Sun size={13} strokeWidth={1.8} />
                      <T en="Light" zh="浅色" />
                    </>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <>
                      <Moon size={13} strokeWidth={1.8} />
                      <T en="Dark" zh="深色" />
                    </>
                  ),
                },
              ]}
            />
          )}
        </Row>
      </section>

      <section className="card-specular rounded-card bg-surface">
        <div className="border-b border-line px-6 py-4">
          <span className="t-overline">
            <T en="Language" zh="语言" />
          </span>
        </div>
        <Row
          titleEn="Immersion level"
          titleZh="沉浸等级"
          descEn="How much Chinese support the workspace shows. Rise slowly — comprehension first."
          descZh="界面展示多少中文支持。慢慢升 — 先保证理解。"
        >
          <Segmented<number>
            value={immersionLevel <= 2 ? 1 : 4}
            disabled={pending}
            onChange={(v) =>
              start(async () => {
                await setImmersionLevelAction(v);
                router.refresh();
              })
            }
            options={IMMERSION}
          />
        </Row>
      </section>

      <section className="card-specular rounded-card bg-surface">
        <div className="border-b border-line px-6 py-4">
          <span className="t-overline">
            <T en="Study" zh="学习节奏" />
          </span>
        </div>
        <Row
          titleEn="Daily time budget"
          titleZh="每日时间预算"
          descEn="Mission length adapts: lite core on tight days, full loop when you have room."
          descZh="任务长度自适应：紧张日精简核心，宽裕日完整闭环。"
        >
          <Segmented<number>
            value={dailyMinutes}
            disabled={pending}
            onChange={(v) =>
              start(async () => {
                await setDailyMinutesAction(v);
                router.refresh();
              })
            }
            options={MINUTES}
          />
        </Row>
      </section>

      <AIProviderCard status={aiStatus} />

      <p className="pb-4 text-center text-[12px] text-ink-3">
        {userName} · IELTS Workspace · <T en="Learning Science > Feature Quantity" zh="学习科学 > 功能数量" />
      </p>
    </div>
  );
}
