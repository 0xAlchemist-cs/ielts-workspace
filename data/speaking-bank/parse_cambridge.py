# -*- coding: utf-8 -*-
"""Extract official speaking prompts from the clean Cambridge 4 question paper md.

Output: data/speaking-bank/cambridge-4-speaking.json
  { part1: [{topic, questions[]}], part2: [{cue, hints[]}], part3: [{topic, questions[]}] }
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = Path(r"D:\雅思\ielts-workspace\data\md-corpus\zeeklog\cambridge-4.md")
OUT = Path(r"D:\雅思\ielts-workspace\data\speaking-bank\cambridge-4-speaking.json")

t = SRC.read_text(encoding="utf-8")

part1, part2, part3 = [], [], []

# ── Part 1: "#### EXAMPLE {Topic}" + bullet questions ───────────────────────
for m in re.finditer(r"####\s*EXAMPLE\s+([^\n*#]+)((?:\s*\*\*·\*\*(?:(?!\*\*·\*\*)[^\n])+)+)", t):
    topic = m.group(1).strip()
    qs = [re.sub(r"\s+", " ", q).strip() for q in re.findall(r"\*\*·\*\*((?:(?!\*\*·\*\*).)+)", m.group(2), re.S)]
    qs = [q for q in qs if q.endswith("?") and len(q) > 12]
    if topic and qs:
        part1.append({"topic": topic, "questions": qs})

# ── Part 2: "Describe X. You should say: ... and explain Y." ────────────────
for m in re.finditer(r"Describe ([^.]+?)\.\s*You should say:(.*?)and explain (.*?)(?:\.|You will have to talk)", t, re.S):
    cue = "Describe " + re.sub(r"\s+", " ", m.group(1)).strip() + "."
    hints_raw = re.sub(r"\s+", " ", m.group(2)).strip()
    hints = [h.strip() for h in re.split(r"\s(?=what\b|where\b|who\b|when\b|why\b|how\b|which\b)", hints_raw) if len(h.strip()) > 3]
    explain = re.sub(r"\s+", " ", m.group(3)).strip().rstrip(".")
    hints.append("and explain " + explain)
    part2.append({"cue": cue, "hints": hints[:4]})

# ── Part 3: "*Discussion topics:* **Topic** *Example questions:* Q1 Q2 ..." ─
for m in re.finditer(r"\*\*([^*]+)\*\*\s*\*?Example questions:?\*?(.*?)(?=\*\*[A-Z]|\Z)", t, re.S):
    topic = m.group(1).strip()
    body = m.group(2)
    qs = [re.sub(r"\s+", " ", q).strip() for q in re.findall(r"([A-Z][^?.]*\?)", body)]
    qs = [q for q in qs if len(q) > 15][:5]
    if topic and len(topic) < 80 and qs:
        part3.append({"topic": topic, "questions": qs})

print(f"part1 sets: {len(part1)}, part2 cues: {len(part2)}, part3 topics: {len(part3)}")
OUT.write_text(json.dumps({"part1": part1, "part2": part2, "part3": part3}, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
for p in part1[:2]: print("P1:", p["topic"], "->", p["questions"][:2])
for p in part2[:2]: print("P2:", p["cue"][:70], "| hints:", p["hints"])
for p in part3[:2]: print("P3:", p["topic"], "->", p["questions"][:2])
