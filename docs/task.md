# Design and prototype a conversational AI for early dementia detection in elderly users

## 📋 Objective

We want to assess your ability to design and prototype AI-powered applications aligned with Caresma's mission. In this case, we're focusing on a **voice-driven, humanlike assistant** that:

- Interacts with an older adult
- Assesses cognitive health using AI
- Creates a follow-up care plan

---

## ✳️ Scope

### Part 1 – System Design (Conceptual / Written)

Design a modular system that:

- Lets an older adult speak with a humanlike assistant (mic/camera)
- Uses AI to assess for signs of dementia
- Summarizes key indicators into a diagnostic-style output across key pillars (e.g., memory, language, attention)
- Auto-schedules recurring support sessions (based on severity level)
- Sends calendar invites

#### 🧠 Deliverable

- **1-2 page architecture diagram** (with explanation)
- **Bullet points on:**
  - Models/services used (e.g., OpenAI, Deepgram, Google Calendar API)
  - Frontend/backend stack proposal
  - Where/how LLM is used
  - What you would fine-tune (and how)
  - How data is captured and stored securely

---

### Part 2 – Prototype / Code Sample (Working MVP)

#### 💡 Build a basic functional prototype of one core element

**A working frontend + backend** where the user talks to an avatar, and the assistant replies via speech using GPT + text-to-speech (no camera needed):

- The user talks into the mic
- The agent (on-screen avatar) responds
- The agent has an animated presence
- No need for real-time video feedback from the user (i.e., no webcam input)

**A sample post-session report generator:** user inputs a dummy transcript (or uploads one) -> AI generates structured dementia feedback based on 3-5 criteria -> recommends a severity level.

- **Tech stack:** up to you (React, Python, Node, etc.)

---

### Part 3 – Short Loom Walkthrough (5–10 min)

Record a Loom walkthrough where you:

1. Present your thought process
2. Show the prototype
3. Reflect on what worked and what you'd improve

---

## ⏱ Timeline

- **Total time expected:** ~8-10 hours
- **Deadline:** within 5 calendar days from assignment

---

## 📦 What to submit

| Item                       | Format                        |
| -------------------------- | ----------------------------- |
| System design doc (Part 1) | PDF                           |
| Code (Part 2)              | GitHub repo or zipped project |
| Part 3 & discussion        | Loom link (live)              |

---

## 🎯 What we're looking for

- Practical creativity and execution under constraints
- Ability to think holistically, even when prototyping just one part
- Comfort with AI model integration, logic design, basic UX
- Bias toward action, clarity of thought, care for the user
