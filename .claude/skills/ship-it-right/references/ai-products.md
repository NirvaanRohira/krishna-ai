# Products that use AI

## Safety and integrity

**Prompt injection**
- MUST: treat all user input, retrieved documents, web pages, emails and tool outputs as **data, not instructions**. Delimit them clearly, and tell the model so in the system prompt.
- MUST: never let the client supply conversation history, system prompts or "assistant" turns. Load history server-side.
- MUST: give tools least privilege. Require confirmation for actions with side effects (send, pay, delete). Never pass model output straight into SQL, shell, `eval`, or URLs to fetch (SSRF).
- MUST: test with known injection strings, such as "ignore previous instructions", fake system tags, and instructions hidden in retrieved content.

**Output handling**
- MUST: render model output as text (XSS); validate structured output against a schema before use; never trust model-produced IDs, prices or permissions.

**Guardrails for sensitive domains**
- MUST: classify and route crisis, medical, legal and financial requests; fixed, reviewed responses for crisis, with local helplines; no professional advice the product isn't licensed to give; fail **safe**: an unknown classification is treated as the most protective category.

**Evals before model or prompt changes**
- MUST: a fixed question set covering:
  - typical use
  - edge cases
  - each supported language
  - safety traps (jailbreaks, impersonation, fake facts or citations)
- Score each candidate with a rubric (LLM judge plus human review of the low scores), record cost and latency, and block the change if safety regresses.

## Disclosure ("no proof of AI" is a liability)

- MUST: tell people plainly that they're talking to an AI, at onboarding and persistently in the UI (EU AI Act transparency, FTC deception rules, India's synthetic-content labelling).
- MUST: **label AI-generated media** (avatars, voices, images, video) visibly, and embed provenance metadata (C2PA / content credentials) where feasible.
- MUST: keep generation logs (what was generated, when, by which model, for whom; minimise content) as **proof** that content was AI-generated and as evidence in disputes.
- MUST: never let an AI persona impersonate a real person, deity, professional or brand without rights, and never claim abilities it lacks. Watch marketing copy too ("certified", "accurate", "therapist").

## Publish an AI policy (a page users can read)

- what the AI does and doesn't do
- which providers and models process their data
- whether data is used for training (prefer **no**, and choose providers or settings with zero retention or no training)
- human oversight and how to report bad outputs
- known limitations, and the age policy

## Data and providers

- MUST: a DPA and data-retention terms with each AI provider; prefer zero-retention or no-training options; for routers (e.g. OpenRouter), restrict routing to hosts that don't store or train on prompts.
- MUST: know where the data is processed (cross-border rules); minimise what you send (no unnecessary PII in prompts).
- MUST: cap every paid call (input length, history length, output tokens), meter tokens per user, set plan quotas, and alert on spend.

## Voice and likeness

- MUST: synthetic voices and faces need a **written licence** from the real person they're based on (personality rights, BIPA, EU AI Act deepfake labelling). Cloning a celebrity or actor without one is a lawsuit.
- MUST: microphone and camera only with explicit, purpose-specific permission and consent; process on-device where possible; don't store raw audio or video unless needed and disclosed.
- MUST: **face recognition or face ID requires separate explicit consent** (biometric data). Avoid it unless essential.

## Quality and cost hygiene

- Static system prompt first, so provider prompt caching works; per-user context after it.
- Measure p50/p95 latency to first token; stream responses; show progress.
- Keep a model fallback chain, with timeouts tuned so the fallback actually fires.
