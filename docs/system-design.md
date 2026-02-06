# Caresma: Conversational AI for Early Dementia Detection

## System Design Document

**Version**: 1.0  
**Date**: February 2026  

---

## 1. Executive Summary

This document outlines the architecture for a voice-driven AI assistant that interacts with elderly users, assesses cognitive health across five clinical domains, generates structured diagnostic reports, and auto-schedules follow-up sessions based on severity. The system prioritizes warmth and accessibility over clinical feel, data privacy from day one, and best-in-class AI at every integration point.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Microphone  │  │    Camera    │  │   Rive       │  │   Calendar   │   │
│  │  + VAD       │  │  (periodic  │  │   Avatar     │  │    Widget    │   │
│  │              │  │   snapshots)│  │              │  │              │   │
│  └──────┬───────┘  └──────┬──────┘  └──────▲───────┘  └──────▲──────┘   │
└─────────┼─────────────────┼────────────────┼─────────────────┼───────────┘
          │                 │                │                 │
          ▼                 ▼                │                 │
┌─────────────────────────────────────────────────────────────────────────────┐
│          HONO API (modular monolith, exposed as SvelteKit API route)       │
│                                                                             │
│  Middleware: Auth (Clerk) · Rate Limiter · CORS / CSP                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─      │
│                                                                             │
│  ┌────────────┐    ┌─────────────────┐    ┌──────────────┐                 │
│  │ Deepgram   │───►│ LLM Orchestrator│───►│ ElevenLabs   │                 │
│  │ Nova-2 STT │    │ (GPT-5.2+)      │    │ TTS          │                 │
│  │ (streaming)│    │                 │    │ (streaming)  │                 │
│  └────────────┘    └────────┬────────┘    └──────────────┘                 │
│                             │                                               │
│  ┌──────────────────────────┼──────────────────────────────────────┐        │
│  │              ASSESSMENT ENGINE                                  │        │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ │        │
│  │  │ Memory   │ │ Language │ │ Attention│ │Orientat° │ │Exec. │ │        │
│  │  │ Scoring  │ │ Scoring  │ │ Scoring  │ │ Scoring  │ │Func. │ │        │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────┘ │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                             │                                               │
│             ┌───────────────┼───────────────┐                               │
│             ▼               ▼               ▼                               │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                  │
│  │ Report         │ │ Session        │ │ Notification   │                  │
│  │ Generator      │►│ Scheduler      │►│ Service        │                  │
│  │ (JSON → PDF)   │ │ (severity →    │ │ (email + SMS)  │                  │
│  │                │ │  frequency)    │ │                │                  │
│  └────────────────┘ └────────────────┘ └────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────┐  ┌──────────────────────────────────────┐
│          DATA LAYER               │  │      EXTERNAL INTEGRATIONS           │
│                                   │  │                                      │
│  ┌──────────────┐                 │  │  ┌────────────────┐                  │
│  │ Neon         │                 │  │  │ iCal invites   │                  │
│  │ PostgreSQL   │                 │  │  │ (via Resend)   │                  │
│  │ (users,      │                 │  │  └────────────────┘                  │
│  │  sessions,   │                 │  │  ┌────────────────┐                  │
│  │  reports)    │                 │  │  │ Twilio         │                  │
│  ├──────────────┤                 │  │  │ (SMS)          │                  │
│  │ Cloudflare   │                 │  │  └────────────────┘                  │
│  │ R2 (audio)   │                 │  │  ┌────────────────┐                  │
│  ├──────────────┤                 │  │  │ Resend         │                  │
│  │ Upstash      │                 │  │  │ (email)        │                  │
│  │ Redis (cache)│                 │  │  └────────────────┘                  │
│  └──────────────┘                 │  │  ┌────────────────┐                  │
│                                   │  │  │ GPT-4V (vision │                  │
│                                   │  │  │ analysis)      │                  │
│                                   │  │  └────────────────┘                  │
└───────────────────────────────────┘  └──────────────────────────────────────┘
```

**How a single voice turn works:** The user speaks → client-side VAD detects end of speech → audio streams to the server → Deepgram transcribes in real-time → the LLM generates an empathetic reply while silently updating cognitive domain scores → ElevenLabs streams synthesized speech back to the avatar. Text appears in the UI immediately; audio starts playing before the full response is generated. After the session ends, a full-transcript analysis produces a structured report, and the scheduler determines the next session based on severity.

**Backend architecture:** The entire backend is a single Hono application structured as a modular monolith — auth, conversation, assessment, reports, scheduling, and notifications are organized as separate Hono route modules. It's mounted as a SvelteKit API route (`/api/[...path]`) for zero-friction deployment as part of the web app. Because Hono is runtime-agnostic, this same app can be extracted into a standalone Cloudflare Worker, Bun server, or Node service with no code changes when scaling requires it.

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Speech-to-Text** | Deepgram Nova-2 | Best-in-class real-time streaming STT (<300ms latency). Strong accuracy with elderly speech patterns — pauses, hesitation, soft voice. Alternatives worth evaluating: AssemblyAI (stronger LLM integration), Google Cloud STT (medical vocabulary). Requires hands-on benchmarking with real elderly speech samples before committing. |
| **LLM** | OpenAI GPT-5.2 (or latest at build time) | The LLM landscape moves fast — GPT-4o is being retired Feb 2026. We use whatever is the strongest general-purpose model at time of build for: nuanced cognitive assessment, structured JSON output, and complex system-prompt following. Anthropic Claude and Google Gemini are also strong contenders; the right choice depends on benchmarking for empathetic conversation quality and structured output reliability. |
| **Text-to-Speech** | ElevenLabs v3 (initial choice) | Natural prosody, voice cloning for a consistent "Caro" persona, adjustable speed for elderly listeners, streaming output. However, this space is evolving rapidly — Cartesia Sonic 3 offers 40ms time-to-first-audio, and Inworld TTS-1.5 leads quality benchmarks at lower cost. Requires comparative evaluation with real users before final vendor commitment. |
| **Vision Analysis** | GPT-4V (tentative) | Periodic webcam snapshots analyzed for engagement level, eye contact, facial affect, and attention drift. Non-invasive — no continuous video stream. **Note:** I have no direct experience with vision-based engagement analysis. This choice came from initial research and needs deeper evaluation — accuracy with elderly faces, lighting conditions, ethical considerations, and whether it meaningfully improves assessment quality vs. voice-only. |
| **Frontend** | SvelteKit + Tailwind CSS | My preference for a small team. Smallest bundle size of any meta-framework (~40KB vs ~90KB+ for Next.js). Simpler mental model, less boilerplate, faster development velocity. Fast SSR, accessibility-first — ideal for elderly users on older devices. **Tradeoff vs. Next.js:** Next.js has a larger ecosystem, more 3rd-party integrations, and a bigger hiring pool, but comes with more complexity, slower iteration (especially without heavy library reliance), larger bundles, and more opinionated conventions. For a 2-3 person team optimizing for speed and performance, SvelteKit is the stronger choice. |
| **Avatar** | Rive (`@rive-app/canvas`) — MVP only | GPU-accelerated state-machine animation for the initial build. 60fps on low-end hardware, sub-100KB asset. States: idle, listening, thinking, speaking. **Beyond MVP:** Rive doesn't support lip-sync or emotion-reactive expressions. The next step is a 3D avatar with viseme-based lip-sync driven by the TTS audio stream — likely Ready Player Me + Three.js (Agora has a proven pipeline with <50ms audio-to-visual latency and ARKit blend shapes), or D-ID for a fully managed AI avatar with real-time conversation support. |
| **Backend** | Hono on SvelteKit server routes | Type-safe API layer with Zod validation. Initially deployed as SvelteKit server routes for simplicity — one repo, one deploy. Hono is framework-agnostic, so the API can be extracted into a standalone service (Cloudflare Worker, Bun, Node) with zero rewrite when scaling demands it. Built-in OpenAPI schema generation via `@hono/zod-openapi` makes it trivial to auto-generate typed HTTP clients for future mobile apps or IoT devices. Edge-deployed globally for <50ms TTFB. |
| **Auth** | Clerk | HIPAA-eligible. Magic-link login for elderly users (no passwords). Caregiver role management built-in. |
| **Database** | Neon PostgreSQL (serverless) | HIPAA-eligible, encrypted at rest, auto-scaling. Stores users, sessions, reports, scores, scheduling data. |
| **Cache** | Upstash Redis | Serverless Redis for conversation state, session context between turns, and rate limiting. |
| **Object Storage** | Cloudflare R2 | S3-compatible. AES-256 encryption. Zero egress fees. Stores encrypted audio recordings. |
| **Calendar** | iCal email invites (MVP) → Google Calendar API | For the MVP, we send `.ics` calendar attachments via Resend — this works universally (Google Calendar, Outlook, Apple Calendar) with zero OAuth complexity. If we later need to programmatically manage, update, or cancel events, we upgrade to the Google Calendar API with full OAuth. The email-first approach is simpler, more portable, and covers 90% of the use case. |
| **Notifications** | Twilio (SMS) + Resend (email) | Session reminders, caregiver alerts, clinician referrals. Resend has a clean developer API, React Email templates, and straightforward pricing. |
| **Monitoring** | Sentry + PostHog | Sentry for error tracking and performance monitoring. PostHog for product analytics — session replays, funnels, feature flags, and A/B testing. Both self-hostable if needed for compliance. |
| **Deployment** | Cloudflare Workers/Pages | Global edge network, automatic SSL, GDPR-compliant region selection. |

---

## 4. Where & How the LLM Is Used

### 4.1 Conversation Orchestration
The LLM acts as the conversation controller, guided by a detailed system prompt that structures dialogue to naturally cover all five cognitive domains. It maintains full conversation context, adapts its questioning based on the user's responses, and ensures assessment coverage without ever feeling clinical. It decides when to probe deeper on a domain and when to move on.

### 4.2 Response Generation
Generates empathetic, elderly-friendly responses with:
- Simple vocabulary and short sentence structure
- Patience with repetition, pauses, and confusion
- Warm, encouraging tone that celebrates small wins
- Natural topic transitions (daily routines, family, hobbies, meals, weather)
- Gentle redirection when the user becomes confused — never draws attention to mistakes

### 4.3 Real-Time Cognitive Analysis
During each conversation turn, the LLM silently evaluates the user's response for:
- **Memory indicators**: Recall accuracy, temporal confusion, repetition patterns, autobiographical consistency
- **Language indicators**: Word-finding difficulty, circumlocution, syntax errors, verbal fluency
- **Attention indicators**: Topic drift, response relevance, follow-through on multi-part questions
- **Orientation indicators**: Time/place/person awareness, awareness of current events or season
- **Executive function**: Problem-solving approach, planning ability, abstract reasoning, judgment

### 4.4 Report Synthesis
Post-session, the LLM analyzes the complete transcript and produces a structured JSON report:
- Per-domain scores (1-10) with specific examples from the conversation
- Observations and concerns for each domain
- Overall severity classification (Normal / Mild / Moderate / Significant)
- Plain-language summary for caregivers
- Actionable recommendations and suggested follow-up frequency

---

## 5. Fine-Tuning Strategy

### 5.1 Honest Starting Point: Prompt Engineering First

For the first several months, **we don't fine-tune anything.** Modern frontier models (GPT-5.2, Claude, Gemini) are strong enough that careful system prompt engineering — with clinical guidelines, conversation examples, and scoring rubrics baked into the prompt — will cover our needs for empathetic conversation, assessment coverage, and structured scoring.

Fine-tuning is premature until we have:
- Real conversation data from actual elderly users (not synthetic data we imagined)
- Clear evidence that the base model consistently fails at something specific
- Enough volume to identify patterns worth training on

### 5.2 When Fine-Tuning Becomes Relevant

After the pilot, with hundreds of real sessions to analyze, fine-tuning may make sense for:

1. **Cost reduction** — If we can get a smaller, cheaper model (e.g. GPT-5.2-mini or an open-weight model) to match the frontier model's quality for our specific conversation style, fine-tuning pays for itself at scale. A fine-tuned small model at 1/10th the cost per turn is a real business advantage.
2. **Consistency** — If the base model is sometimes too clinical, sometimes too casual, or occasionally drifts from the assessment protocol despite prompt engineering, fine-tuning can lock in the exact tone and behavior we want.
3. **Latency** — A fine-tuned smaller model will be faster than a frontier model with a large system prompt. For a voice conversation, shaving 200-300ms off LLM response time is noticeable.

### 5.3 What Fine-Tuning Would NOT Fix

- **Elderly speech recognition** — This is a Speech-to-Text problem (Deepgram/AssemblyAI), not an LLM problem. By the time the LLM sees input, it's already text. If Deepgram mishears "butter" as "better," fine-tuning the LLM won't help.
- **Clinical accuracy beyond the training data** — A fine-tuned model isn't a clinician. The assessment scoring must be validated by geriatric specialists regardless of whether we fine-tune.

### 5.4 How (When We Get There)

1. **Dataset** — Real anonymized transcripts from pilot sessions (informed consent) + expert annotations by geriatric specialists marking good/bad model responses. Synthetic data only to supplement gaps.
2. **Training** — OpenAI fine-tuning API for their latest small model, or an open-weight model (Llama, Mistral) hosted on Together AI for full control and cost predictability.
3. **Validation** — A/B test fine-tuned model vs. base model on real conversations. Metrics: assessment coverage, scoring accuracy vs. specialist consensus, user comfort (session duration, return rate).


---

## 6. Data Capture & Security

### 6.1 Data Flow
Audio captured client-side → encrypted in transit (TLS 1.3) → Deepgram transcribes → transcript stored with de-identified session ID (SHA-256 hash) → audio blob stored in R2 (AES-256 at rest) → PII stored in a separate database table with strict row-level security.

### 6.2 PHI Handling
- Audio recordings stored with de-identified patient IDs — no PII in the same table
- Automatic PII redaction in transcripts before storage or model input
- Zero PHI in application logs, error reports, or monitoring dashboards

### 6.3 Access Control
- Role-based access control (RBAC): patient, caregiver, clinician, admin
- Multi-factor authentication for administrative and clinician access
- Audit logging for all data access events
- Principle of least privilege enforced at every layer

### 6.4 Compliance
- **HIPAA**: Business Associate Agreements with Cloudflare, Neon, OpenAI, Deepgram, ElevenLabs, Clerk, Twilio, Resend
- **GDPR**: Explicit consent flows, right to deletion, data portability, regional data residency

### 6.5 Data Retention
- Configurable retention periods (default: 7 years per HIPAA)
- Automated secure deletion workflows
- User-initiated deletion with 30-day recovery window
- Anonymized data retained for model improvement (only with explicit consent)

---

## 7. Auto-Scheduling & Calendar Invites

### 7.1 Severity-Based Scheduling

| Severity Level | Score Range | Follow-up Frequency | Action |
|---|---|---|---|
| Normal | 8-10 | Every 3 months | Calendar invite to user |
| Mild Concern | 5-7 | Every 2 weeks | Invite + caregiver CC |
| Moderate Concern | 3-4 | Weekly | Invite + caregiver alert (email + SMS) |
| Significant Concern | 1-2 | Immediate + weekly | Caregiver + clinician notification; urgent referral |

### 7.2 Scheduling Flow
1. Session completes → full-transcript report generated
2. Severity level determined from composite cognitive scores
3. Next session date calculated based on frequency tier
4. Calendar invite sent (see approach comparison below)
5. Twilio SMS + Resend email confirmation to user and caregiver
6. Automated reminders at 24h and 1h before next session

### 7.3 Calendar Integration: iCal Emails vs. Google Calendar API

| | **iCal email invites (.ics via Resend)** | **Google Calendar API** |
|---|---|---|
| **Complexity** | Minimal — generate an .ics file, attach to email, done | High — OAuth 2.0 consent flow, token refresh, scope management |
| **Works with** | Everything — Google Calendar, Outlook, Apple Calendar, any email client | Google Calendar only |
| **Update/cancel events** | Awkward — must send a new email with updated .ics with same UID | Clean — programmatically update or delete events by ID |
| **Recurring events** | Supported via iCal RRULE spec | Supported natively |
| **User friction** | Zero — user just opens an email | Requires OAuth consent popup (confusing for elderly users) |
| **Reminders** | We send our own via Resend/Twilio (full control) | Can use Google's built-in reminders, but less control |
| **Caregiver CC** | Trivial — add to email recipients | Need caregiver's Google account or fall back to email anyway |
| **Two-way sync** | No — we can't see if the user accepted or deleted | Yes — can check event status, detect conflicts |
| **Offline/device support** | Works on any device with email | Needs Google Calendar app or web access |

**Recommendation:** Start with iCal email invites. It's simpler, universal, zero-friction for elderly users, and covers the core need (getting a session on their calendar). Upgrade to Google Calendar API only if we need two-way sync (checking if user accepted, detecting scheduling conflicts) — and even then, keep iCal as the fallback for non-Google users.

---


## 9. Cognitive Assessment Domains

### Memory
- Immediate recall (word lists, object names)
- Delayed recall (5-10 minute gaps within conversation)
- Recognition vs. free recall
- Autobiographical memory consistency

### Language
- Naming ability (confrontational naming embedded in conversation)
- Verbal fluency (category and letter tasks framed as games)
- Sentence comprehension
- Narrative coherence

### Attention
- Sustained attention (conversation length before drift)
- Selective attention (filtering distractions, staying on topic)
- Divided attention (multi-part questions)

### Orientation
- Temporal orientation (date, time, season, day of week)
- Spatial orientation (location awareness, describing surroundings)
- Person orientation (self, family, caregiver recognition)

### Executive Function
- Planning and sequencing (describing how to do a task)
- Abstract reasoning (proverbs, similarities)
- Judgment and decision-making
- Cognitive flexibility (adapting to topic changes)

---

_Prepared for Caresma technical evaluation._
