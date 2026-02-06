import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import { ASSESSMENT_SYSTEM_PROMPT, ASSESSMENT_GREETING_USER_PROMPT } from './prompts/assessment';
import { ANALYSIS_SYSTEM_MESSAGE, getAnalysisPrompt } from './prompts/analysis';

// ============================================
// Caresma AI Assistant
// ============================================
const CARESMA_TTS_VOICE = 'onyx' as const;

// ============================================
// Caresma Routes
// ============================================
const caresmaRoutes = new Hono()
	// Initial greeting when user starts a session: AI asks the first question (text + TTS stream)
	// Protocol: first line is JSON {"text":"..."}\n, remaining bytes = MP3
	.post('/greeting', async (c) => {
		try {
			const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

			const completion = await openai.chat.completions.create({
				model: 'gpt-5-mini',
				messages: [
					{ role: 'system', content: ASSESSMENT_SYSTEM_PROMPT },
					{ role: 'user', content: ASSESSMENT_GREETING_USER_PROMPT }
				],
				max_completion_tokens: 150
			});

			const responseText =
				completion.choices[0]?.message?.content?.trim() ||
				"How has your day been so far? I'd love to hear about it.";

			const ttsResponse = await openai.audio.speech.create({
				model: 'tts-1',
				voice: CARESMA_TTS_VOICE,
				input: responseText,
				speed: 0.95
			});

			const encoder = new TextEncoder();
			const textLine = encoder.encode(JSON.stringify({ text: responseText }) + '\n');
			const ttsBody = ttsResponse.body as ReadableStream<Uint8Array> | null;

			const responseStream = new ReadableStream<Uint8Array>({
				async start(controller) {
					controller.enqueue(textLine);
					if (ttsBody) {
						const reader = ttsBody.getReader();
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								controller.enqueue(value);
							}
						} finally {
							reader.releaseLock();
						}
					}
					controller.close();
				}
			});

			return new Response(responseStream, {
				headers: {
					'Content-Type': 'application/octet-stream',
					'Cache-Control': 'no-cache'
				}
			});
		} catch (error) {
			console.error('Greeting error:', error);
			const message = error instanceof Error ? error.message : 'Failed to get greeting';
			return c.json({ error: message, success: false }, 500);
		}
	})
	// All-in-one: transcribe audio + chat + TTS in a single request (eliminates round-trip)
	// Accepts FormData with 'audio' file and 'messages' JSON string
	// Protocol: first line is JSON {"text":"...","transcript":"..."}\n, remaining bytes = MP3
	.post('/process-audio', async (c) => {
		try {
			const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

			const formData = await c.req.formData();
			const audioFile = formData.get('audio') as File | null;
			const messagesJson = formData.get('messages') as string | null;

			if (!audioFile) {
				return c.json({ error: 'No audio file provided' }, 400);
			}

			const previousMessages: Array<{ role: string; content: string }> = messagesJson
				? JSON.parse(messagesJson)
				: [];

			// Step 1: Transcribe with Whisper
			const transcription = await openai.audio.transcriptions.create({
				file: audioFile,
				model: 'whisper-1',
				language: 'en',
				response_format: 'text'
			});

			const transcript = typeof transcription === 'string' ? transcription : String(transcription);

			if (!transcript.trim()) {
				// Empty transcription — return immediately, no TTS needed
				const encoder = new TextEncoder();
				return new Response(encoder.encode(JSON.stringify({ text: '', transcript: '' }) + '\n'), {
					headers: { 'Content-Type': 'application/octet-stream' }
				});
			}

			// Step 2: LLM chat (stream to collect text fast) — using gpt-5-mini for quality + speed + cost
			const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: 'system', content: ASSESSMENT_SYSTEM_PROMPT },
				...previousMessages.map((m) => ({
					role: m.role as 'user' | 'assistant' | 'system',
					content: m.content
				})),
				{ role: 'user' as const, content: transcript }
			];

			const completionStream = await openai.chat.completions.create({
				model: 'gpt-5-mini',
				messages: fullMessages,
				max_completion_tokens: 300,
				stream: true
			});

			let responseText = '';
			for await (const chunk of completionStream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) responseText += delta;
			}

			if (!responseText) {
				responseText = 'I apologize, I had trouble understanding. Could you please repeat that?';
			}

			// Step 3: TTS — stream audio through without server-side buffering
			const ttsResponse = await openai.audio.speech.create({
				model: 'tts-1',
				voice: CARESMA_TTS_VOICE,
				input: responseText,
				speed: 0.95
			});

			// Build streaming response: JSON text line first, then raw MP3 bytes
			const encoder = new TextEncoder();
			const textLine = encoder.encode(JSON.stringify({ text: responseText, transcript }) + '\n');

			const ttsBody = ttsResponse.body as ReadableStream<Uint8Array> | null;

			const responseStream = new ReadableStream<Uint8Array>({
				async start(controller) {
					controller.enqueue(textLine);

					if (ttsBody) {
						const reader = ttsBody.getReader();
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								controller.enqueue(value);
							}
						} finally {
							reader.releaseLock();
						}
					}

					controller.close();
				}
			});

			return new Response(responseStream, {
				headers: {
					'Content-Type': 'application/octet-stream',
					'Cache-Control': 'no-cache'
				}
			});
		} catch (error) {
			console.error('Process-audio error:', error);
			const message = error instanceof Error ? error.message : 'Processing failed';
			return c.json({ error: message, success: false }, 500);
		}
	})
	// Analyze a transcript for cognitive indicators (for report generation)
	.post('/analyze', zValidator('json', z.object({ transcript: z.string() })), async (c) => {
		try {
			const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
			const { transcript } = c.req.valid('json');

			const completion = await openai.chat.completions.create({
				model: 'gpt-5.2',
				messages: [
					{ role: 'system', content: ANALYSIS_SYSTEM_MESSAGE },
					{ role: 'user', content: getAnalysisPrompt(transcript) }
				],
				max_completion_tokens: 1000,
				response_format: { type: 'json_object' }
			});

			const analysisText = completion.choices[0]?.message?.content || '{}';
			const analysis = JSON.parse(analysisText);

			return c.json({
				analysis,
				success: true
			});
		} catch (error) {
			console.error('Analysis error:', error);
			const message = error instanceof Error ? error.message : 'Analysis failed';
			return c.json({ error: message, success: false }, 500);
		}
	});

// ============================================
// Main routes
// ============================================
const routes = new Hono().route('/caresma', caresmaRoutes);

// ============================================
// Main App with Middleware
// ============================================
const app = new Hono();
app.use('*', logger());
app.use('*', cors());
app.route('/', routes);

// 404 handler
app.notFound((c) => {
	return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// Error handler
app.onError((err, c) => {
	console.error('API Error:', err);
	return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Export app for server, and routes type for RPC client
export default app;
export type AppType = typeof routes;
