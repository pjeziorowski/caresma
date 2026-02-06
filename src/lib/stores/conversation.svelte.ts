import type { ChatMessage } from '$lib/components/ChatHistory.svelte';
import type { AvatarState } from '$lib/components/Avatar.svelte';

function createConversationStore() {
	let messages = $state<ChatMessage[]>([]);
	let avatarState = $state<AvatarState>('idle');
	let isProcessing = $state(false);
	let isSessionActive = $state(false);
	let error = $state<string | null>(null);
	let sessionId = $state(crypto.randomUUID());

	// Audio playback
	let currentAudio: HTMLAudioElement | null = null;

	function startSession() {
		isSessionActive = true;
		avatarState = 'thinking';
		error = null;
		requestGreeting();
	}

	/**
	 * Fetch initial AI greeting (first question), add to messages, and play TTS.
	 * Same stream protocol as process-audio: first line JSON { text }, then MP3 bytes.
	 */
	async function requestGreeting() {
		try {
			const response = await fetch('/api/caresma/greeting', { method: 'POST' });
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to get greeting');
			}
			const body = response.body;
			if (!body) throw new Error('No response body');

			const reader = body.getReader();
			let textByteChunks: Uint8Array[] = [];
			let firstAudioChunk: Uint8Array | null = null;
			let foundDelimiter = false;

			while (!foundDelimiter) {
				const { done, value } = await reader.read();
				if (done) break;
				const nlIndex = value.indexOf(0x0a);
				if (nlIndex !== -1) {
					foundDelimiter = true;
					if (nlIndex > 0) textByteChunks.push(value.slice(0, nlIndex));
					if (nlIndex + 1 < value.length) firstAudioChunk = value.slice(nlIndex + 1);
				} else {
					textByteChunks.push(value);
				}
			}

			const decoder = new TextDecoder();
			const textLine =
				textByteChunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
			const parsed = JSON.parse(textLine);
			const responseText: string = parsed.text || '';

			if (responseText.trim()) {
				addMessage('assistant', responseText);
			}

			avatarState = 'speaking';
			await playStreamingAudio(reader, firstAudioChunk);
		} catch (err) {
			console.error('Greeting error:', err);
			error = err instanceof Error ? err.message : 'Could not start conversation';
			// Still add a fallback message so the user has something to respond to
			addMessage('assistant', "How has your day been so far? I'd love to hear about it.");
		} finally {
			avatarState = isSessionActive ? 'listening' : 'idle';
		}
	}

	function endSession() {
		isSessionActive = false;
		isProcessing = false;
		avatarState = 'idle';
		stopSpeaking();
	}

	function addMessage(role: 'user' | 'assistant', content: string) {
		const message: ChatMessage = {
			id: crypto.randomUUID(),
			role,
			content,
			timestamp: new Date()
		};
		messages = [...messages, message];
		return message;
	}

	// ─── Progressive audio playback ───────────────────────────────────

	/**
	 * Play audio from a stream reader, starting playback as soon as first bytes arrive.
	 * Uses MediaSource for progressive playback (Chrome/Safari/Edge),
	 * falls back to blob-based playback (Firefox).
	 */
	async function playStreamingAudio(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		firstChunk: Uint8Array | null
	): Promise<void> {
		if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')) {
			return playWithMediaSource(reader, firstChunk);
		}
		return playWithBlob(reader, firstChunk);
	}

	/** Progressive playback via MediaSource — audio starts almost immediately */
	async function playWithMediaSource(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		firstChunk: Uint8Array | null
	): Promise<void> {
		const mediaSource = new MediaSource();

		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}

		currentAudio = new Audio();
		const objectUrl = URL.createObjectURL(mediaSource);
		currentAudio.src = objectUrl;

		// Wait for sourceopen
		await new Promise<void>((resolve) => {
			mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
		});

		const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');

		const appendBuffer = (data: Uint8Array): Promise<void> => {
			const buffer = new Uint8Array(data).buffer as ArrayBuffer;
			return new Promise((resolve, reject) => {
				if (sourceBuffer.updating) {
					sourceBuffer.addEventListener(
						'updateend',
						() => {
							try {
								sourceBuffer.appendBuffer(buffer);
								sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
							} catch (e) {
								reject(e);
							}
						},
						{ once: true }
					);
				} else {
					try {
						sourceBuffer.appendBuffer(buffer);
						sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
					} catch (e) {
						reject(e);
					}
				}
			});
		};

		// Append first chunk and start playback right away
		if (firstChunk && firstChunk.length > 0) {
			await appendBuffer(firstChunk);
		}

		// Start playback (browser will buffer minimally before starting)
		currentAudio.play().catch(() => {});

		// Continue appending chunks as they stream in
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				await appendBuffer(value);
			}
		} catch (e) {
			console.warn('MediaSource streaming error, audio may still play:', e);
		}

		// Signal end of stream
		if (mediaSource.readyState === 'open') {
			try {
				mediaSource.endOfStream();
			} catch {
				// Ignore if already closed
			}
		}

		// Wait for playback to finish
		return new Promise<void>((resolve) => {
			if (!currentAudio) {
				URL.revokeObjectURL(objectUrl);
				resolve();
				return;
			}

			const audio = currentAudio;

			const cleanup = () => {
				URL.revokeObjectURL(objectUrl);
				if (currentAudio === audio) currentAudio = null;
				resolve();
			};

			if (audio.ended) {
				cleanup();
				return;
			}

			audio.addEventListener('ended', cleanup, { once: true });
			audio.addEventListener('error', cleanup, { once: true });
		});
	}

	/** Fallback: collect all audio chunks then play via Audio element */
	async function playWithBlob(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		firstChunk: Uint8Array | null
	): Promise<void> {
		const audioChunks: Uint8Array[] = [];
		if (firstChunk && firstChunk.length > 0) {
			audioChunks.push(firstChunk);
		}

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			audioChunks.push(value);
		}

		if (audioChunks.length === 0) return;

		const audioBlob = new Blob(audioChunks as BlobPart[], { type: 'audio/mpeg' });
		return playAudioBlob(audioBlob);
	}

	/** Play a complete audio blob */
	function playAudioBlob(audioBlob: Blob): Promise<void> {
		const audioUrl = URL.createObjectURL(audioBlob);

		return new Promise((resolve, reject) => {
			if (currentAudio) {
				currentAudio.pause();
				currentAudio = null;
			}

			currentAudio = new Audio(audioUrl);
			currentAudio.playbackRate = 1.0;

			currentAudio.onended = () => {
				URL.revokeObjectURL(audioUrl);
				currentAudio = null;
				resolve();
			};

			currentAudio.onerror = () => {
				URL.revokeObjectURL(audioUrl);
				currentAudio = null;
				reject(new Error('Audio playback failed'));
			};

			currentAudio.play().catch(reject);
		});
	}

	// ─── Main processing ──────────────────────────────────────────────

	/**
	 * Process a user utterance in a single API call:
	 * audio → transcribe → LLM → TTS, all streamed back.
	 *
	 * Text is parsed the moment the delimiter arrives (instant message feedback).
	 * Audio playback starts progressively via MediaSource.
	 */
	async function processUserAudio(audioBlob: Blob) {
		if (isProcessing) return;

		isProcessing = true;
		error = null;
		avatarState = 'thinking';

		try {
			// Prepare existing messages for LLM context
			const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));

			// Single API call: transcribe + chat + TTS
			const formData = new FormData();
			formData.append('audio', audioBlob, 'recording.webm');
			formData.append('messages', JSON.stringify(chatMessages));

			const response = await fetch('/api/caresma/process-audio', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Processing failed');
			}

			const body = response.body;
			if (!body) throw new Error('No response body');

			const reader = body.getReader();

			// Phase 1: Read until we find the \n delimiter (text line)
			let textByteChunks: Uint8Array[] = [];
			let firstAudioChunk: Uint8Array | null = null;
			let foundDelimiter = false;

			while (!foundDelimiter) {
				const { done, value } = await reader.read();
				if (done) break;

				const nlIndex = value.indexOf(0x0a);
				if (nlIndex !== -1) {
					foundDelimiter = true;
					if (nlIndex > 0) {
						textByteChunks.push(value.slice(0, nlIndex));
					}
					if (nlIndex + 1 < value.length) {
						firstAudioChunk = value.slice(nlIndex + 1);
					}
				} else {
					textByteChunks.push(value);
				}
			}

			// Parse text IMMEDIATELY — user sees messages right away
			const decoder = new TextDecoder();
			const textLine =
				textByteChunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
			const parsed = JSON.parse(textLine);

			const transcript: string = parsed.transcript || '';
			const responseText: string = parsed.text || '';

			if (!transcript.trim()) {
				// Empty transcription — go back to listening
				avatarState = isSessionActive ? 'listening' : 'idle';
				isProcessing = false;
				return;
			}

			// Add both messages right now (instant text feedback)
			addMessage('user', transcript);
			addMessage('assistant', responseText);

			// Phase 2: Play audio progressively (starts almost immediately)
			avatarState = 'speaking';
			await playStreamingAudio(reader, firstAudioChunk);

			// Done — back to listening
			avatarState = isSessionActive ? 'listening' : 'idle';
		} catch (err) {
			console.error('Processing error:', err);
			error = err instanceof Error ? err.message : 'An error occurred';
			avatarState = isSessionActive ? 'listening' : 'idle';
		} finally {
			isProcessing = false;
		}
	}

	function stopSpeaking() {
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
		if (avatarState === 'speaking') {
			avatarState = isSessionActive ? 'listening' : 'idle';
		}
	}

	function reset() {
		endSession();
		messages = [];
		avatarState = 'idle';
		isProcessing = false;
		error = null;
		sessionId = crypto.randomUUID();
	}

	function getTranscript(): string {
		return messages.map((m) => `${m.role === 'user' ? 'User' : 'Caro'}: ${m.content}`).join('\n\n');
	}

	return {
		get messages() {
			return messages;
		},
		get avatarState() {
			return avatarState;
		},
		get isProcessing() {
			return isProcessing;
		},
		get isSessionActive() {
			return isSessionActive;
		},
		get error() {
			return error;
		},
		get sessionId() {
			return sessionId;
		},
		startSession,
		endSession,
		processUserAudio,
		stopSpeaking,
		reset,
		getTranscript
	};
}

export const conversation = createConversationStore();
