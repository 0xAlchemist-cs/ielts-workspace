# IELTS Active Learning

### The IELTS system that remembers what you actually know.

---

## The problem

Most IELTS products track what you **complete**: questions answered, lessons finished, words "learned", streaks. Completion is not ability. You can finish a thousand exercises and still freeze in speaking; you can "learn" a word and be unable to produce it a week later.

This system is built on the opposite assumption:

> Learning is not complete when you have seen something.
> Learning is complete when you can **retrieve it, use it, transfer it, and retain it.**

## How it works: one loop, not many modules

Every day runs the same loop — modules are just environments the loop passes through:

```
Learn  →  Retrieve  →  Use  →  Retain
(input)   (from memory)  (produce)  (keep)
```

## Personal Learning Memory — the core difference

The system remembers what actually happened and lets it decide what happens next:

- You made the *"discuss about"* mistake **7 times** → it keeps returning in new contexts until it's dead.
- You retrieved *"play a crucial role"* successfully → it's scheduled differently from the ones you fumbled.
- You understood something in reading but never produced it → classified as **passive knowledge**, pushed toward production.
- You haven't used an expression for 30 days → a **retention check** appears.
- Every recommendation shows its reason: *"Seen 5 times. Retrieved once. Last failed 6 days ago."* — never a vague "recommended for you".

## Evidence, not scores

Progress is the honest funnel, and a number only moves down when you produce English from memory:

**Exposed → Understood → Retrieved → Used → Retained**

见过 ≠ 会检索 ≠ 会用 ≠ 已保留。This distinction is the product's core idea — the homepage shows today's funnel every day.

## A day looks like this

1. Open **Today** — the system names one focus and *why* (three concrete evidence points), plus what this session will change.
2. Run the mission: read/listen real Cambridge material → notice expressions in context → retrieve them closed-book → produce them in writing & speaking.
3. Mistakes land in **Your Recurring Mistakes** and return as parallel drills in new contexts.
4. End of day: the evidence funnel updates; trends shift; tomorrow's plan changes accordingly.

## Bring your own materials

Your English isn't only in Cambridge books — it's in PDFs you saved, podcast episodes, interview recordings, articles in Word. Drop any of it into the Library: PDF, Word, text, Markdown, subtitles, a photo of a page, an MP3 you recorded. It becomes a real learning resource — analysed, deduped, and wired straight into the same daily loop as the built-in corpus. Everything runs locally on your machine; nothing is uploaded anywhere. Imported reading gets an honest difficulty level (AI-analysed, or explicitly "not analyzed yet" — never a guess), and material a little above your level says so instead of hiding it.

## The environments

| | |
| --- | --- |
| **External practice** | Real exams happen on external sites (IELTSCB for reading/full papers, your AI coach for speaking/listening); paste the report link back in and it becomes learning evidence |
| **Reading** | Guess-first word cards, 8-dimension sentence analysis, article-first workbench |
| **Listening** | Real Cambridge audio, segment-level control, connected-speech annotation, shadowing |
| **Writing** | Task → Plan → Write (instant local feedback + AI examiner) → Rewrite → Transfer |
| **Speaking** | Your external coach (ChatGPT GPT); the workspace stores what happened and feeds it back into the loop |
| **Review** | "Think first" — produce from memory, never flip flashcards |

## Under the hood

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle + SQLite (local-first, WAL) · zod-validated AI adapter (deterministic Mock offline / any OpenAI-compatible endpoint live, silent fallback) · Web Speech + MediaRecorder · Apple-inspired calm design system, bilingual 中英/沉浸, dark mode.

## Install

```bash
npm ci
curl -L -o data/ecdict.csv   https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o data/lemma.en.txt https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt
npm run db:push && npm run db:seed && npm run db:dict
npm run start        # production, binds 127.0.0.1:3000
```

AI key (optional, unlocks deep analysis): in-app **Settings → AI Provider**, or `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` in `.env.local`.

## Corpus (v1-corpus-complete)

Listening **249 sections / 2267 questions** (Cambridge 5–20, transcript-verified) · Reading **234 exams / 3147 questions** · Writing **T1 315 + T2 259** · 37 bilingual model essays · 657 graded contents · 8413 vocabulary entries · 23 contrast grammar patterns. All importers idempotent (`npm run db:*`). Third-party material is personal-use only.

## Tests

`npm run verify:all` — lint + typecheck + all suites (smoke / pm / engine / rotation / loop / planner / exam / import / writing-gate / input-gates), all self-cleaning.

## Development workflow (read this before your first push)

**Every `git push` runs the full gate** (`verify:all`, ~3–4 min) via the versioned
`.githooks/pre-push` hook (`git config core.hooksPath .githooks` — repo-level, binds
every contributor and agent on this machine). A red gate aborts the push.

- **Push rejected?** Fix the failing suite — don't reach for `--no-verify`. That flag
  skips the gate; if you use it, you own the breakage it lets through.
- **One push, one gate run**: push master and tags together
  (`git push origin master <tag>`) — each push refires the gate.
- **Commits are not gated** (by design, speed). The gate protects what enters the
  remote, not the local history — don't let broken work linger unpushed.
- **The running app is NOT the repo**: `npm run start` serves the last
  `npm run build`. After changing code, rebuild + restart or you are testing a
  stale build against fresh tests.
- **DB importers (`npm run db:*`) write `data/app.db` directly** and are outside the
  gate — every importer carries its own idempotency/count assertions; keep them true.

## Security & backup

Single-user, loopback-only (`127.0.0.1`) · SSRF-guarded AI calls · input gates on every POST route · security headers. Daily 09:30 OneDrive backup: git bundle (full history) + consistent DB snapshot, 14-day rotation.
