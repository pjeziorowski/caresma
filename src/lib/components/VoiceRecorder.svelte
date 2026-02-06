<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		/** Whether a conversation session is currently active */
		sessionActive?: boolean;
		/** Whether Caro is processing/speaking (pause listening during this) */
		paused?: boolean;
		/** Whether to show status text under the mic indicator */
		showStatusText?: boolean;
		/** Called with recorded audio when VAD detects end of speech */
		onRecordingComplete?: (audioBlob: Blob) => void;
		/** Called when mic stream is first acquired successfully */
		onSessionReady?: () => void;
		/** Called if mic acquisition or recording fails */
		onError?: (message: string) => void;
		class?: string;
	}

	let {
		sessionActive = false,
		paused = false,
		showStatusText = true,
		onRecordingComplete,
		onSessionReady,
		onError,
		class: className
	}: Props = $props();

	// Internal state (reactive for UI only)
	let isListening = $state(false);
	let audioLevel = $state(0);
	let hasPermission = $state<boolean | null>(null);
	let isSendingSilence = $state(false);

	// Persistent mic resources (alive for entire session)
	let stream: MediaStream | null = null;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let animationFrame: number | null = null;

	// Per-turn recording
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];

	// Guards against race conditions
	let awaitingResponse = false; // true after VAD sends, prevents premature restart
	let startingTurn = false; // prevents double startTurn calls

	// VAD config
	let silenceStart: number | null = null;
	let turnStartTime = 0;
	let hasSpeechStarted = false;
	const SILENCE_THRESHOLD = 5;
	const SILENCE_TIMEOUT = 2000;
	const WARMUP_PERIOD = 1500;
	const MIN_RECORDING_MS = 500;

	onMount(async () => {
		try {
			const permissionStatus = await navigator.permissions.query({
				name: 'microphone' as PermissionName
			});
			hasPermission = permissionStatus.state === 'granted';
			permissionStatus.addEventListener('change', () => {
				hasPermission = permissionStatus.state === 'granted';
			});
		} catch {
			hasPermission = null;
		}
	});

	onDestroy(() => {
		teardownSession();
	});

	/**
	 * Core reactive effect — ONLY tracks sessionActive and paused (external props).
	 * Internal state (isListening, awaitingResponse) is read via untrack() to avoid
	 * unintended re-runs that cause race conditions with MediaRecorder.
	 */
	$effect(() => {
		// Track ONLY these two external props
		const active = sessionActive;
		const isPaused = paused;

		// Everything else is untracked to prevent the effect from re-running
		// when internal state changes (e.g. isListening set in startTurn/stopTurn)
		untrack(() => {
			if (active && !isPaused) {
				// Session active, not paused → should be listening
				if (!isListening && !awaitingResponse && !startingTurn) {
					startTurn();
				}
			} else if (active && isPaused) {
				// Caro is processing/speaking → pause recording
				awaitingResponse = false; // processing has begun, clear the flag
				if (isListening) {
					stopTurn(false);
				}
			} else if (!active) {
				// Session ended
				teardownSession();
			}
		});
	});

	/** Acquire mic stream and audio analyser (once per session) */
	async function acquireMic(): Promise<boolean> {
		if (stream) return true;

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					sampleRate: 44100
				}
			});
			hasPermission = true;

			audioContext = new AudioContext();
			analyser = audioContext.createAnalyser();
			const source = audioContext.createMediaStreamSource(stream);
			source.connect(analyser);
			analyser.fftSize = 256;

			onSessionReady?.();
			return true;
		} catch (err) {
			console.error('Mic acquisition error:', err);
			if (err instanceof DOMException && err.name === 'NotAllowedError') {
				hasPermission = false;
				onError?.(
					'Microphone access denied. Please allow microphone access in your browser settings.'
				);
			} else {
				onError?.('Could not access microphone. Please check your device settings.');
			}
			return false;
		}
	}

	/** Start a new recording turn within the session */
	async function startTurn() {
		if (isListening || startingTurn) return;
		startingTurn = true;

		try {
			if (!stream) {
				const ok = await acquireMic();
				if (!ok) {
					startingTurn = false;
					return;
				}
			}

			audioChunks = [];
			silenceStart = null;
			hasSpeechStarted = false;
			isSendingSilence = false;
			turnStartTime = Date.now();

			const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
				? 'audio/webm;codecs=opus'
				: 'audio/webm';

			mediaRecorder = new MediaRecorder(stream!, { mimeType });

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onerror = () => {
				onError?.('Recording failed. Please try again.');
				mediaRecorder = null;
				isListening = false;
				startingTurn = false;
			};

			mediaRecorder.start(100);
			isListening = true;
			startLevelMonitoring();
		} finally {
			startingTurn = false;
		}
	}

	/**
	 * Stop the current recording turn.
	 * When sendAudio=true (VAD triggered), we capture chunks locally so they
	 * survive even if startTurn() clears the module-level audioChunks.
	 */
	function stopTurn(sendAudio: boolean) {
		stopLevelMonitoring();
		isListening = false;
		audioLevel = 0;
		silenceStart = null;
		isSendingSilence = false;

		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			if (sendAudio) {
				// Capture references locally BEFORE anything can clear them
				const capturedChunks = audioChunks;
				const capturedSpeech = hasSpeechStarted;
				const recorder = mediaRecorder;

				awaitingResponse = true; // prevent effect from restarting a turn

				recorder.onstop = () => {
					if (capturedChunks.length > 0 && capturedSpeech) {
						const audioBlob = new Blob(capturedChunks, { type: 'audio/webm' });
						onRecordingComplete?.(audioBlob);
					}
				};
				recorder.stop();
			} else {
				// Discard — override onstop so it doesn't fire completion
				const recorder = mediaRecorder;
				recorder.onstop = () => {};
				recorder.stop();
			}
		}

		mediaRecorder = null;
	}

	/** Tear down the entire session — release mic, stop everything */
	function teardownSession() {
		stopLevelMonitoring();
		isListening = false;
		audioLevel = 0;
		silenceStart = null;
		isSendingSilence = false;
		hasSpeechStarted = false;
		awaitingResponse = false;
		startingTurn = false;

		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			const recorder = mediaRecorder;
			recorder.onstop = () => {};
			recorder.stop();
		}
		mediaRecorder = null;

		if (audioContext) {
			audioContext.close();
			audioContext = null;
			analyser = null;
		}
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
	}

	function startLevelMonitoring() {
		if (!analyser) return;
		const dataArray = new Uint8Array(analyser.frequencyBinCount);

		const updateLevel = () => {
			if (!analyser || !isListening) return;
			analyser.getByteFrequencyData(dataArray);
			const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
			audioLevel = Math.min(100, (average / 128) * 100);

			// VAD: detect silence and auto-send
			const elapsed = Date.now() - turnStartTime;
			if (audioLevel >= SILENCE_THRESHOLD) {
				hasSpeechStarted = true;
				silenceStart = null;
				isSendingSilence = false;
			}
			if (hasSpeechStarted && elapsed > WARMUP_PERIOD && elapsed > MIN_RECORDING_MS) {
				if (audioLevel < SILENCE_THRESHOLD) {
					if (!silenceStart) {
						silenceStart = Date.now();
					} else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
						isSendingSilence = false;
						stopTurn(true); // VAD triggered — send audio
						return;
					} else if (Date.now() - silenceStart > SILENCE_TIMEOUT * 0.5) {
						isSendingSilence = true;
					}
				}
			}

			animationFrame = requestAnimationFrame(updateLevel);
		};

		animationFrame = requestAnimationFrame(updateLevel);
	}

	function stopLevelMonitoring() {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}
</script>

<div class={cn('flex flex-col items-center gap-4', className)}>
	<!-- Mic indicator (reserves space during entire session) -->
	{#if sessionActive}
		<div class="flex h-14 w-14 items-center justify-center">
			{#if isListening}
				<div
					class="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-emerald-300 to-emerald-400 shadow-md shadow-emerald-300/30 transition-all duration-200"
				>
					<svg class="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
						<rect x="9" y="2" width="6" height="14" rx="3" />
						<path
							d="M5 10a7 7 0 0014 0"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
						<line
							x1="12"
							y1="19"
							x2="12"
							y2="22"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					<!-- Audio level glow -->
					<div
						class="absolute inset-0 rounded-full bg-emerald-300/20 transition-transform duration-100"
						style:transform="scale({1 + audioLevel / 350})"
					></div>
					<!-- Pulse rings -->
					<div
						class="animate-mic-ring absolute -inset-1.5 rounded-full border-[1.5px] border-emerald-300/60"
					></div>
					<div
						class="animate-mic-ring animation-delay-1000 absolute -inset-1.5 rounded-full border-[1.5px] border-emerald-300/60"
					></div>
				</div>
			{/if}
		</div>
	{/if}

	{#if showStatusText}
		<div class="min-h-6 text-center">
			{#if isSendingSilence}
				<p class="text-sm font-medium text-amber-600">Sending your message...</p>
			{:else if isListening}
				<p class="text-sm font-medium text-emerald-500">Your turn — speak freely</p>
			{:else if paused}
				<p class="text-sm font-medium text-muted-foreground">Caro is responding...</p>
			{/if}
		</div>
	{/if}

	<!-- Microphone permission hint (only before session starts) -->
	{#if !sessionActive && hasPermission === false}
		<p class="text-base font-medium text-amber-600">
			Microphone access is needed to start a session
		</p>
	{/if}
</div>

<style>
	@keyframes mic-ring {
		0% {
			transform: scale(1);
			opacity: 0.7;
		}
		100% {
			transform: scale(1.4);
			opacity: 0;
		}
	}

	:global(.animate-mic-ring) {
		animation: mic-ring 2s ease-out infinite;
	}

	:global(.animation-delay-1000) {
		animation-delay: 1s;
	}
</style>
