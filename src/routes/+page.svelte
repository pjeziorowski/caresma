<script lang="ts">
	import { gsap } from 'gsap';
	import Avatar from '$lib/components/Avatar.svelte';
	import VoiceRecorder from '$lib/components/VoiceRecorder.svelte';
	import ChatHistory from '$lib/components/ChatHistory.svelte';
	import { conversation } from '$lib/stores/conversation.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { cn } from '$lib/utils';

	let isChatCollapsed = $state(true);

	function handleStartSession() {
		conversation.startSession();
	}

	function handleEndSession() {
		conversation.endSession();
	}

	async function handleRecordingComplete(audioBlob: Blob) {
		await conversation.processUserAudio(audioBlob);
	}

	function handleSessionError(_message: string) {
		conversation.endSession();
	}

	function toggleChat() {
		isChatCollapsed = !isChatCollapsed;
	}

	function handleReset() {
		conversation.reset();
	}

	const stateLabels: Record<string, string> = {
		idle: 'Ready to chat',
		listening: 'Listening - speak freely',
		thinking: 'Caro is thinking...',
		speaking: 'Caro is speaking...'
	};

	const motionAllowed = () =>
		typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const pageIntro = (node: HTMLElement) => {
		if (!motionAllowed()) {
			return;
		}

		const targets = Array.from(node.querySelectorAll('[data-animate]'));
		const avatar = node.querySelector('[data-animate-avatar]');
		const timeline = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.6 } });

		timeline.from(targets, { autoAlpha: 0, y: 16, stagger: 0.08 });

		if (avatar) {
			timeline.from(avatar, { scale: 0.96, autoAlpha: 0, duration: 0.5 }, '<0.1');
		}

		return () => {
			timeline.kill();
		};
	};

	const revealOnMount =
		({
			y = 6,
			duration = 0.4,
			scale = 1
		}: { y?: number; duration?: number; scale?: number } = {}) =>
		(node: HTMLElement) => {
			if (!motionAllowed()) {
				return;
			}

			const tween = gsap.fromTo(
				node,
				{ autoAlpha: 0, y, scale },
				{ autoAlpha: 1, y: 0, scale: 1, duration, ease: 'power2.out' }
			);

			return () => {
				tween.kill();
			};
		};
</script>

<svelte:head>
	<title>Caro - Your Cognitive Health Companion</title>
	<meta name="description" content="A friendly AI assistant for cognitive health conversations" />
</svelte:head>

<main
	class="relative flex min-h-dvh flex-col items-center overflow-x-hidden px-4 py-8 sm:px-8 sm:py-12"
	{@attach pageIntro}
>
	<!-- Header -->
	<header class="mb-6 text-center sm:mb-8" data-animate>
		<p class="text-xs font-semibold tracking-[0.3em] text-muted-foreground/70 uppercase">Caro</p>
		<h1 class="mt-2 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
			Your Cognitive Health Companion
		</h1>
		<p class="mt-2 text-base text-muted-foreground sm:text-lg">
			A calm, private space to talk and reflect.
		</p>
	</header>

	<!-- Main content area -->
	<div
		class="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-6 sm:px-10 sm:py-8"
		data-animate
	>
		<!-- Avatar section -->
		<section class="flex items-center justify-center">
			<div class="rounded-full shadow-[0_30px_70px_-45px_rgba(15,23,42,0.6)]" data-animate-avatar>
				<Avatar avatarState={conversation.avatarState} size={280} />
			</div>
		</section>

		<!-- Session status badge (always visible during active session) -->
		{#if conversation.isSessionActive}
			<div
				class="flex items-center gap-2.5 rounded-full border border-border/60 bg-card/80 px-5 py-2 text-sm font-medium text-foreground shadow-sm"
				{@attach revealOnMount({ y: -6, duration: 0.4 })}
			>
				<span
					class={cn(
						'inline-block h-2 w-2 rounded-full',
						{
							'bg-emerald-400/80': conversation.avatarState === 'listening',
							'bg-amber-400/85': conversation.avatarState === 'thinking',
							'bg-blue-400/80': conversation.avatarState === 'speaking',
							'bg-slate-300/80':
								!['listening', 'thinking', 'speaking'].includes(conversation.avatarState)
						},
						conversation.isProcessing && 'animate-pulse'
					)}
				></span>
				{stateLabels[conversation.avatarState] ?? stateLabels['idle']}
			</div>
		{/if}

		<!-- Welcome message (before session starts) -->
		{#if !conversation.isSessionActive && conversation.messages.length === 0}
			<section
				class="flex flex-col items-center gap-4"
				{@attach revealOnMount({ y: 6, duration: 0.4 })}
			>
				<div class="mx-auto max-w-sm text-center">
					<p class="text-lg leading-relaxed text-pretty text-foreground sm:text-xl">
						Hello, I'm Caro!
					</p>
					<p class="mt-2 text-base text-pretty text-muted-foreground">
						Start a session and just talk. I'll listen.
					</p>
				</div>
				<div class="h-px w-32 rounded-full bg-foreground/10"></div>
			</section>
		{/if}

		<!-- Error message -->
		{#if conversation.error}
			<div {@attach revealOnMount({ y: 6, duration: 0.4 })}>
				<Alert variant="destructive" class="mx-auto max-w-sm text-base">
					<AlertDescription class="text-base">
						{conversation.error}
					</AlertDescription>
					<Button variant="destructive" size="sm" class="mt-3" onclick={() => conversation.reset()}>
						Try Again
					</Button>
				</Alert>
			</div>
		{/if}

		<!-- Voice recorder (session-based, always mounted when active) -->
		<section class="mt-2">
			<VoiceRecorder
				sessionActive={conversation.isSessionActive}
				paused={conversation.isProcessing}
				showStatusText={false}
				onRecordingComplete={handleRecordingComplete}
				onError={handleSessionError}
			/>
		</section>

		<!-- Start / End Session button -->
		{#key conversation.isSessionActive}
			<section
				class="flex flex-wrap items-center justify-center gap-3"
				{@attach revealOnMount({ y: 6, duration: 0.4 })}
			>
				{#if !conversation.isSessionActive}
					{#if conversation.messages.length > 0}
						<Button variant="outline" size="lg" onclick={handleReset}>Start Again</Button>
						<Button href="/report" size="lg">View Assessment Report</Button>
					{:else}
						<Button
							size="lg"
							class="h-12 gap-2.5 rounded-full px-6 text-base font-semibold shadow-md hover:bg-primary hover:brightness-95 sm:h-14 sm:gap-3 sm:px-8 sm:text-lg [&_svg]:size-5 sm:[&_svg]:size-5"
							onclick={handleStartSession}
						>
							<svg viewBox="0 0 24 24" fill="currentColor">
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
							Start Session
						</Button>
					{/if}
				{:else}
					<Button
						variant="destructive"
						size="lg"
						class="h-12 gap-2.5 rounded-full px-6 text-base font-semibold sm:h-14 sm:gap-3 sm:px-8 sm:text-lg [&_svg]:size-5 sm:[&_svg]:size-5"
						onclick={handleEndSession}
					>
						<svg viewBox="0 0 24 24" fill="currentColor">
							<rect x="4" y="4" width="16" height="16" rx="2" />
						</svg>
						End Session
					</Button>
				{/if}
			</section>
		{/key}
	</div>

	<!-- Chat history panel -->
	{#key conversation.messages.length}
		<section class="mt-8 w-full max-w-3xl" {@attach revealOnMount({ y: 8, duration: 0.35 })}>
			<ChatHistory
				messages={conversation.messages}
				isCollapsed={isChatCollapsed}
				onToggle={toggleChat}
			/>
		</section>
	{/key}

	<!-- Footer with status -->
	<footer class="mt-8 flex flex-col items-center gap-3" data-animate>
		<p class="text-sm text-muted-foreground">Your conversation is private and secure.</p>
	</footer>
</main>
