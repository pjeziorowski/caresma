# Prototype — How This Demo Works

This document describes the working prototype in this repository: what it demonstrates, how the pieces fit together, and key technical decisions.

---

## What It Does

Two functional screens that demonstrate the core of the Caresma system design:

1. **Conversation page** (`/`) — The user starts a session and speaks into their mic. An animated avatar ("Caro") listens, thinks, and replies with voice. Conversation history appears in real-time. No buttons to press between turns — voice activity detection handles turn-taking automatically.

2. **Report page** (`/report`) — Paste a conversation transcript (or use the one from your session) and generate a structured cognitive assessment. The AI scores 5 domains (memory, language, attention, orientation, executive function), assigns an overall severity level, and lists recommendations.

---

## Architecture

```
 Browser
 ┌──────────────────────────────────────────────────────────┐
 │  VoiceRecorder ──► VAD (silence detection) ──► WebM blob │
 │  Avatar (Rive) ◄── avatarState (idle/listen/think/speak) │
 │  ChatHistory ◄── messages[]                              │
 │  conversation store (Svelte 5 runes) orchestrates all    │
 └────────────────────────┬─────────────────────────────────┘
                          │ single POST per turn
                          ▼
 SvelteKit Server (Hono API)
 ┌──────────────────────────────────────────────────────────┐
 │  POST /api/caresma/process-audio                        │
 │    1. Whisper STT (audio → transcript)                  │
 │    2. GPT-5-nano (transcript → reply text, streamed)     │
 │    3. OpenAI TTS (reply text → MP3 audio stream)        │
 │    Response: JSON line {"text","transcript"}\n + MP3     │
 │                                                          │
 │  POST /api/caresma/analyze                              │
 │    GPT-5.2 + response_format:json_object → 5-domain JSON│
 └──────────────────────────────────────────────────────────┘
```

### Single-request pipeline

The biggest technical decision: **one HTTP request handles the entire voice turn** (STT → LLM → TTS). The server streams the response using a simple protocol — the first line is a JSON object with the text, followed by raw MP3 bytes. The client:

1. Parses the JSON line immediately → user sees both messages in the chat
2. Feeds the MP3 bytes into `MediaSource` for progressive audio playback (blob fallback for Firefox)

This eliminates three network round-trips compared to calling transcribe/chat/speak separately.

### Model choice for conversation reply

We use **GPT-5-nano** for transcript → reply text. It’s the fastest model in the GPT-5 family at $0.05/1M input and $0.40/1M output. Optimized for lowest latency in voice conversation turns.

### Client-side VAD

The `VoiceRecorder` component keeps the mic stream open for the entire session. An `AnalyserNode` monitors audio levels on every animation frame. When:

- Speech is detected (level > threshold after warmup)
- Then 2 seconds of silence follows

...the recording is automatically sent. No "stop talking" button. The user just speaks and pauses naturally.

### Avatar state machine

The Rive animation has 4 states controlled by boolean inputs:

- **idle** — all inputs false (gentle breathing)
- **listening** — `Hear = true` (attentive posture)
- **thinking** — `Check = true` (processing animation)
- **speaking** — `Talk = true` (talking animation)

State transitions are driven by the conversation store: `idle → listening → thinking → speaking → listening → ...`

---

## File Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Avatar.svelte            Rive avatar with 4 animation states
│   │   ├── VoiceRecorder.svelte     Session-based mic + VAD + MediaRecorder
│   │   └── ChatHistory.svelte       Collapsible message log with auto-scroll
│   ├── stores/
│   │   └── conversation.svelte.ts   Central state: messages, processing, audio playback
│   └── server/api/
│       └── index.ts                 Hono routes: transcribe, chat, TTS, analyze
├── routes/
│   ├── +page.svelte                 Main conversation UI
│   ├── report/+page.svelte          Post-session cognitive assessment report
│   └── api/[...path]/+server.ts     SvelteKit → Hono bridge (exposed API)
```

---

## Tech Stack

| Layer       | Technology                                                    |
| ----------- | ------------------------------------------------------------- |
| Frontend    | SvelteKit 2 + Svelte 5 (runes) + Tailwind CSS + shadcn-svelte |
| Avatar      | Rive (`@rive-app/canvas`)                                     |
| Backend API | Hono with Zod validation, running on SvelteKit server routes  |
| STT         | OpenAI Whisper (`whisper-1`)                                  |
| LLM         | GPT-5-nano (conversation turns) / GPT-5.2 (report analysis)   |
| TTS         | OpenAI TTS (`tts-1`, voice: `onyx`, speed: 0.95)              |

---

## What This Prototype Demonstrates vs. Full System Design

| Feature              | Prototype                                | System Design (MVP)                    |
| -------------------- | ---------------------------------------- | -------------------------------------- |
| Voice conversation   | Whisper (batch per turn)                 | Deepgram Nova-2 (real-time streaming)  |
| Animated avatar      | Rive 4-state machine                     | + lip-sync, emotion states             |
| Cognitive assessment | Post-session report from transcript      | Real-time scoring during conversation  |
| Audio pipeline       | Single-request STT→LLM→TTS               | Same approach, with Deepgram streaming |
| Progressive playback | MediaSource + blob fallback              | Same                                   |
| Session scheduling   | Not implemented (designed in system doc) | Google Calendar API + SendGrid         |
| Vision analysis      | Not in scope                             | GPT-4V face engagement (phase 2)       |
| Data persistence     | In-memory (session only)                 | Neon PostgreSQL + Cloudflare R2        |
| Authentication       | None                                     | OAuth 2.0 / magic-link                 |
