# IELTS Active Learning Workspace

A local-first personal English training OS — not a quiz app, not a word memoriser.

**Core loop:** `Input → Comprehension → Noticing → Deep Processing → Retrieval → Output → Feedback → Reuse`

Every feature exists to serve one goal: turn "I know these words" into "I can think and speak in English" — building **Concept → English** directly, without passing through Chinese.

## Quick start

```bash
npm install

# 1. Download the ECDICT corpus (one-time, ~68 MB)
curl -L -o data/ecdict.csv      https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o data/lemma.en.txt    https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt

# 2. Create schema + seed corpus + import dictionary
npm run db:push
npm run db:seed
npm run db:dict

# 3. Run
npm run dev          # http://localhost:3000
```

First visit goes to onboarding (baseline, weak spots, immersion level) — then Today's Mission is generated automatically.

## AI provider (optional but recommended)

The app runs fully offline with a deterministic **Mock provider** (labelled "⚙︎ Mock AI" wherever it's used). To upgrade every analysis to a real LLM, copy `.env.local.example` to `.env.local` and fill in any OpenAI-compatible endpoint:

```bash
# GLM example
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_API_KEY=your-key
AI_MODEL=glm-4.6
```

One config unlocks: contextual word analysis, full 8-dimension sentence analysis, examiner-grade writing feedback, conversation coaching, and AI-graded retrieval. If the live provider ever fails, the app silently falls back to Mock.

## What's inside

| Module | Route | What it trains |
| --- | --- | --- |
| Today's Mission | `/` | The whole loop, orchestrated daily |
| Input Library | `/library` | Comprehensible input (6 readings + 4 listenings, B1–B2) |
| Active Reading | `/read/[id]` | English-first word cards (ECDICT), sentence deep-analysis, chunk noticing |
| Listening Lab | `/listen/[id]` | Blind listen → recall → transcript with connected-speech annotations (gonna, linking, weak forms) |
| Chunk Bank + Lexical Network | `/chunks` | Expressions as units; convince↔persuade-type contrast networks |
| Language Lab | `/lab` | 8-dimension analysis of any sentence: meaning · structure · why · native logic · alternatives · differences · collocations · transfer |
| Retrieval | `/review` | Chinese cue → produce English from memory (SM-2 variant, production-weighted) |
| Speaking Lab | `/speaking` | Coach that makes YOU talk; P1–P5 correction discipline; shadowing A/B compare |
| Writing & Paraphrase | `/writing` | Original→Better→diagnosis, then YOU rewrite; one meaning → many Englishes |
| IELTS Engine | `/ielts` | Transfer today's chunks into Part 2/3 format |
| Error Bank | `/errors` | Every P1/P2 correction auto-banked; returns in retrieval until killed |
| Learning Profile | `/profile` | Honest numbers: Active/Passive vocab, retrieval accuracy, 5-level funnel |

## The anti-illusion principle

The dashboard never says "you learned N words". It shows the real funnel:

**Exposed → Understood → Retrieved → Used → Retained**

Only producing English from memory moves numbers below the first row. Strength grows through retrieval and use, never through re-reading.

## Data & scripts

- All data lives in `data/app.db` (SQLite, WAL). Delete the file to reset.
- **One-click export**: Profile 页右上「⤓ 导出学习数据」or `GET /api/export` downloads everything as JSON.
- **Use on your phone** (commute review sessions): restart exposed to your LAN, then open `http://<PC-IP>:3000` on a phone on the same WiFi:
  ```bash
  npm run start -- -H 0.0.0.0   # PC IP via ipconfig → IPv4 Address
  ```
- Dictionary corpus: [ECDICT](https://github.com/skywind3000/ECDICT) (Apache-2.0) — 48k common words with English definitions, Chinese translations, BNC/COCA ranks, plus 102k inflection→base mappings.
- `npm run db:push` · `npm run db:seed` · `npm run db:dict` — schema, learning corpus, dictionary
- `npm run test:smoke` — end-to-end learning-loop test (25 checks, self-cleaning)
- `npx tsx scripts/verify-pm.ts` — PM-review fixes verification (16 checks, self-cleaning)

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Drizzle ORM + better-sqlite3 · zod · Web Speech API (STT/TTS) + MediaRecorder · Apple-style design system following Emil Kowalski's motion principles (custom easing curves, vibrancy materials, press feedback, spring-like drawer).

## Roadmap (V1 → V3)

- **V1**: live AI everywhere · full 3-round listening · Part-3-style conversation escalation · lexical network graph
- **V2**: FSRS scheduling · error-driven scenario generation · i+1 content generation · phoneme-level pronunciation analysis
- **V3**: long-term analytics · PWA · optional cloud sync / multi-user
