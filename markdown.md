# ClarityAI — AI Context File for Developers

> Purpose: This file instructs the AI-related components and guides developers and AI engineers on precisely how the AI should behave inside the ClarityAI webapp. It contains feature requirements, exact I/O shapes, prompt templates, processing pipelines, safety rules, evaluation metrics, and a step-by-step implementation guide so the model behavior can be implemented predictably and safely.

---

## Table of contents

1. Short project summary
2. AI responsibilities (per feature)
3. Input & output formats (JSON schemas)
4. Prompt templates (system + user) for each feature
5. Document processing pipeline (map-reduce chunking)
6. Postprocessing, validation & sanitization rules
7. Token / cost management & batching best practices
8. Error handling, retries, and fallback logic
9. Security, privacy & sensitive-data rules
10. Logging, telemetry & metrics to collect
11. Evaluation & acceptance criteria (how to grade the AI outputs)
12. Step-by-step developer implementation guide (7-day focused steps)
13. Example API payloads & expected responses
14. Testing dataset examples and test plan
15. Appendix: short prompt library and quick checks

---

## 1. Short project summary

ClarityAI is an AI-driven web app with four primary AI-powered features: **Explain Anything**, **Roadmap Generator**, **Rewrite Text**, **Document Summarizer & Converter**. The AI must produce short, helpful, shareable outputs. The app supports email/password authentication and persists saved items.

The AI layer must be reliable, deterministic where possible (structured JSON outputs), safe (no leaking of user secrets), and cost-aware. Document processing must be asynchronous for large files.

---

## 2. AI responsibilities (per feature)

For each feature below, the AI must follow an exact role and output format.

### 2.1 Explain Anything

* Role: concise teacher
* Responsibilities:

  * Produce a one-paragraph 60–120 word summary.
  * Provide exactly 3 short real-world examples.
  * Provide 5 bullet-point key takeaways.
  * Provide a 5-question MCQ (4 options each) with correct answer indices.
  * Provide 6–10 keywords.
* Tone: clear, neutral, non-technical-first (explain for beginners but include one advanced note).

### 2.2 Roadmap Generator

* Role: career/learning coach
* Responsibilities:

  * Produce a JSON `weeks[]` of length `timeframe_weeks` with each week: `week_number`, `tasks[]`, `estimated_hours`, `milestone`.
  * Provide `resources[]` (1–3 links with short labels).
  * Provide `confidence` score (0.0–1.0) representing how realistic the timeframe is.
* Tone: motivational and pragmatic.

### 2.3 Rewrite Text

* Role: professional copy editor
* Responsibilities:

  * Return exactly 3 variations matching requested tone.
  * Provide a short subject line (for email) and a 10–12 word social caption.
  * Provide `confidence` score and `changes_summary` (brief note of what was changed).
* Tone: as requested (formal/friendly/short/long/assertive).

### 2.4 Document Summarizer & Converter

* Role: technical summarizer and converter
* Responsibilities:

  * Extract full text from uploaded files (OCR if required).
  * Produce `summary_short` (60–120 words), `highlights[]`, `action_items[]`, `keywords[]`.
  * Optionally produce `generated_roadmap` if requested (e.g., study roadmap from lecture notes).
  * Output `extracted_text` or a pointer to the stored extracted text file in S3.
* Performance: Chunk and map-reduce for long docs. Return partial results progressively if possible.

---

## 3. Input & output formats (JSON Schemas)

All AI endpoints must return (or be transformed into) structured JSON. If the LLM returns text, a postprocessor must validate and transform into the schema.

### 3.1 Explain Schema

```json
{
  "summary": "string",
  "examples": ["string","string","string"],
  "bullets": ["string",...],
  "keywords": ["string",...],
  "quiz": [{"q":"string","options":["string","string","string","string"],"answer":0}]
}
```

### 3.2 Roadmap Schema

```json
{
  "weeks": [{"week_number":1, "tasks":["string"], "estimated_hours":10, "milestone":"string"}],
  "resources": [{"title":"string","url":"string"}],
  "confidence": 0.87
}
```

### 3.3 Rewrite Schema

```json
{
  "rewrites": [{"tone":"formal","text":"..."}, ...],
  "subject_suggestions": ["string"],
  "caption":"string",
  "changes_summary":"string",
  "confidence":0.9
}
```

### 3.4 Document Schema

```json
{
  "extracted_text_path":"s3://...",
  "summary_short":"string",
  "highlights":["string"],
  "action_items":["string"],
  "keywords":["string"],
  "generated_roadmap": { ... roadmap schema ... }
}
```

---

## 4. Prompt templates (system + user) for each feature

Use short authoritative system prompts and concise user prompts with placeholders. Always ask the model to return JSON only.

### 4.1 Global system prompt (use for all requests)

```
System: You are an expert assistant. Return output in valid JSON only with keys exactly as requested. Do not include extra commentary.
```

### 4.2 Explain — user prompt

```
User: Explain the topic below for a student and professional audience.
Topic: <<topic>>
Detail level: <<short|detailed>>
Return JSON keys: summary, examples, bullets, keywords, quiz.
```

### 4.3 Roadmap — user prompt

```
User: Create a <<timeframe_weeks>>-week roadmap for the goal: <<goal>> at experience level <<level>>.
Return JSON keys: weeks, resources, confidence.
```

### 4.4 Rewrite — user prompt

```
User: Rewrite the following text in the requested tone: <<tone>>. Provide 3 variations, subject suggestions, a 10-12 word caption, and a brief changes_summary. Text: <<text>>. Return JSON.
```

### 4.5 Document summarization (map prompt)

```
User: Summarize the following chunk (<=2000 tokens). Return JSON: {"chunk_summary":"...","chunk_action_items":[...],"chunk_keywords":[...]}
Chunk:
<<chunk text>>
```

### 4.6 Document summarization (reduce prompt)

```
User: Combine the following chunk summaries into a final summary, deduplicate action items, create global keywords, and optionally produce a 6-8 week study roadmap. Input: <<list of chunk results>>. Return JSON keys: summary_short, highlights, action_items, keywords, generated_roadmap?
```

---

## 5. Document processing pipeline (map-reduce chunking)

1. Extract raw text (OCR / PDF parse / DOCX parse). Store raw extracted text to S3 and create request row.
2. Clean text: remove headers/footers, normalize whitespace, remove obvious boilerplate.
3. Chunk text into ~1500–2000 token windows with 100–200 token overlap.
4. Parallelize map calls: for each chunk, call the map summarization prompt.
5. Store intermediate chunk summaries.
6. Call the reduce prompt with all chunk summaries (or an iterative reducer if summaries exceed token budget).
7. Postprocess the reducer output and store final outputs.

Notes:

* If document is small (<2000 tokens), skip map-reduce and call summarization directly.
* Keep intermediate caches to avoid re-OCR when user re-requests.

---

## 6. Postprocessing, validation & sanitization rules

* **JSON validation:** Always parse LLM output and validate required keys. If invalid, attempt to re-prompt with a stricter instruction (e.g., return in a code block with ````json```). If still invalid after N retries (N=2), return a clear error.
* **Length limits:** Truncate `extracted_text` pointers only; do not truncate `summary_short` below 40 words—if output too long, generate a short summary additionally.
* **Sanitize outputs:** Remove potential secrets (API keys, long token-looking strings) using regex before returning to user.
* **Link detection:** If resources/URLs are provided, validate URL format and avoid private/internal addresses (no `localhost`, `127.0.0.1`, internal IP ranges).

---

## 7. Token / cost management & batching best practices

* **Limit prompt context:** only send necessary context (user instructions + current chunk). Avoid sending large histories.
* **Batching:** For many small requests, batch them where possible, especially map calls for chunks.
* **Confidence scoring:** Ask the model to provide a `confidence` scalar; use it to decide whether to auto-run a second pass (lower confidence → re-run with clarifying prompt).
* **Truncation strategy:** If response too long for budget, request a 2-level output: `summary_short` and `summary_long_url` (store long text in S3 and return pointer).

---

## 8. Error handling, retries, and fallback logic

* **Transient API errors:** Retry up to 3 times with exponential backoff for model API errors (429, 5xx). Log all failures.
* **Invalid JSON:** Attempt a quick corrective re-prompt (ask LLM to only return JSON; if repeated, call lighter local model or return a fallback error message to user with `status: partial` and partial results).
* **OCR failures:** If OCR returns <20 characters per page, mark page as image-heavy and perform image-extraction + OCR again (increase DPI threshold) or fall back to Google Vision if Tesseract fails.
* **Timeouts:** For long document processing, use async worker and return `202 Accepted` with `request_id` to poll.

---

## 9. Security, privacy & sensitive-data rules

* **Never** send user passwords, refresh tokens, secret keys, or any PII that is not necessary to the model.
* **Strip** patterns that look like credentials (`AKIA`, long hex strings, `-----BEGIN PRIVATE KEY-----`) before sending text to LLM; replace with `[REDACTED_SECRET]`.
* **Data retention**: obey user delete requests by removing S3 objects and DB references.
* **Access control**: signed, time-limited S3 URLs; only authenticated users can access saved items. Anonymous users store results locally only.

---

## 10. Logging, telemetry & metrics to collect

Collect these per-request metrics for monitoring and grading:

* `feature_type` (explain/roadmap/rewrite/document)
* `user_id` (nullable)
* `request_id`
* `start_time`, `end_time`, `duration_ms`
* `model_provider`, `model_version`
* `prompt_tokens`, `completion_tokens`, `total_tokens`
* `status` (success/partial/fail)
* `confidence` (if provided)
* `ocr_page_count`, `extracted_chars`

Use these metrics to tune costs and detect regressions.

---

## 11. Evaluation & acceptance criteria

Set measurable thresholds for acceptance of outputs during testing:

* **Explain**: ≥80% human agreement on accuracy over a 50-sample test.
* **Roadmap**: ≥70% judged feasible by a human reviewer for timeframes ≤12 weeks.
* **Rewrite**: ≥85% grammatical correctness (automated grammar checks) and ≥75% style match.
* **Document summarizer**: ROUGE-1 F1 > 0.45 on the sample dataset, and human judge scoring ≥3/5 for usefulness.

Also collect manual feedback from users via `/api/feedback` and track acceptance rates.

---

## 12. Step-by-step developer implementation guide (7-day plan oriented to AI integration)

This guide assumes the frontend skeleton and auth are in place (Day 1). The focus here is the AI integration tasks per day.

### Day A (backend + prompt manager)

* Implement `prompt_manager` module that accepts: `feature_type`, `user_params`, `context_text(optional)` and returns a `prompt` string plus metadata (max_tokens_budget, stop sequences).
* Implement `model_adapter` with: `call_model(prompt, max_tokens)` and retries/backoff. Log tokens.
* Create wrapper endpoints for `POST /api/explain` and `POST /api/rewrite` that call prompt_manager → model_adapter → postprocessor.

### Day B (explain + rewrite done; unit tests)

* Implement explain & rewrite endpoints with strict JSON postprocessing validators.
* Add unit tests that mock model responses and validate the JSON schema.
* Add client-side UI to call these endpoints and render results.

### Day C (roadmap)

* Implement roadmap prompt template and endpoint `/api/roadmap`.
* Add `confidence` normalization (map LLM-generated confidence to 0–1 float).
* Build frontend roadmap viewer (accordion weeks) and export-to-image backend helper.

### Day D (document upload & OCR pipeline)

* Implement `POST /api/document/upload` storing file to S3 and create request row (status=pending).
* Implement worker skeleton (Redis queue + worker) that downloads file and performs OCR/parse.
* Implement OCR using Tesseract for POC, and wire Google Vision as higher-quality optional provider.

### Day E (chunking + map-reduce summarization)

* Implement text chunker and map calls to model for each chunk.
* Store chunk summaries; implement reduce stage to consolidate.
* Implement result persistence and `GET /api/request/{id}` for polling.

### Day F (postprocessing & sanitization)

* Implement JSON validation, sanitization (secrets redaction), link validation, URL whitelisting for resources.
* Add fallback prompts for invalid output.
* Integrate save-to-db and S3 for final outputs (notes PDF generation using HTML→PDF).

### Day G (testing, logging, polishing)

* Implement metrics logging and cost accounting (tokens per feature).
* Run smoke tests on sample docs and tune prompts & chunk sizes.
* Add feedback endpoint and hook saving flows to frontend.

---

## 13. Example API payloads & expected responses

### Explain request

`POST /api/explain` body:

```json
{ "topic": "Normalization in DBMS", "detail_level": "short", "include_quiz": true }
```

Expected response (200):

```json
{ "status":"ok", "result": {"summary":"...","examples":["...","...","..."],"bullets":["..."],"keywords":["..."],"quiz":[{"q":"...","options":["a","b","c","d"],"answer":2}]}}
```

### Document upload

`POST /api/document/upload` multipart `{file, mode:"summarize"}` → returns `202 Accepted` with `{request_id}`. Poll `GET /api/request/{request_id}` until status=`complete` and `result` contains the document schema.

---

## 14. Testing dataset examples and test plan

Provide a small dataset (50 items) covering:

* Short explanatory topics (ACID, Polymorphism, OAuth)
* Roadmap seeds ("Learn React in 8 weeks")
* Rewriting samples (emails, chat messages)
* Documents: lecture notes (PDF), scanned handwritten notes (images), DOCX lecture slides

**Test plan:** Run automated scripts to call endpoints and assert schema conformance, correctness heuristics (no secret patterns returned), and timeouts.

---

## 15. Appendix: short prompt library and quick checks

* Always include the global system prompt requesting JSON-only output.
* If model returns non-JSON, re-prompt with: "You returned invalid JSON. Please return only JSON in a single code block." Then apply a second-level simple parser (strip leading text, find first '{' and last '}' and parse).
* Sample quick-check regexes:

  * Secrets: `AKIA[0-9A-Z]{16}` | `-----BEGIN PRIVATE KEY-----` | `(?i)password\s*[:=]` → redact
  * URL: `https?://[\w\-._~:/?#[\]@!$&'()*+,;=]+`

---

### End of context file

This file is written to be machine-usable and developer-actionable. Use it as the primary spec for implementing, testing, and validating the AI components of ClarityAI.