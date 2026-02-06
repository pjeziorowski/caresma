<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cn } from '$lib/utils';

	export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

	interface Props {
		avatarState?: AvatarState;
		size?: number;
		class?: string;
		riveSrc: string;
	}

	let {
		avatarState = 'idle',
		size = 280,
		class: className,
		riveSrc = '/avatars/assistant.riv'
	}: Props = $props();

	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let riveInstance: any = null;
	let useRive = $state(false);

	let riveInputs = $state<{
		talk: any;
		hear: any;
		check: any;
	} | null>(null);

	const stateRingColors = {
		idle: 'ring-slate-200',
		listening: 'ring-emerald-300',
		thinking: 'ring-amber-400',
		speaking: 'ring-blue-400'
	};

	const stateGlowColors = {
		idle: 'rgba(148, 163, 184, 0.1)',
		listening: 'rgba(134, 239, 172, 0.18)',
		thinking: 'rgba(251, 191, 36, 0.2)',
		speaking: 'rgba(96, 165, 250, 0.2)'
	};

	onMount(async () => {
		if (!canvasRef || !riveSrc) return;

		try {
			// Dynamic import to avoid SSR issues
			const rive = await import('@rive-app/canvas');
			const { Rive } = rive;

			riveInstance = new Rive({
				src: riveSrc,
				canvas: canvasRef,
				autoplay: true,
				stateMachines: 'State Machine 1',
				onLoad: () => {
					useRive = true;
					riveInstance?.resizeDrawingSurfaceToCanvas();

					// Initialize inputs immediately when Rive loads
					try {
						const inputs = riveInstance?.stateMachineInputs('State Machine 1');
						if (inputs && inputs.length > 0) {
							riveInputs = {
								talk: inputs.find((i: any) => i.name === 'Talk'),
								hear: inputs.find((i: any) => i.name === 'Hear'),
								check: inputs.find((i: any) => i.name === 'Check')
							};
						}
					} catch {
						// Rive inputs unavailable — animation will use fallback
					}
				},
				onLoadError: () => {
					useRive = false;
				}
			});
		} catch {
			useRive = false;
		}
	});

	onDestroy(() => {
		if (riveInstance) {
			riveInstance.cleanup();
			riveInstance = null;
		}
	});

	// Update Rive state when avatarState changes
	$effect(() => {
		const currentState = avatarState;

		if (!riveInputs) return;

		// Reset all boolean inputs first
		if (riveInputs.talk) riveInputs.talk.value = false;
		if (riveInputs.hear) riveInputs.hear.value = false;
		if (riveInputs.check) riveInputs.check.value = false;

		// Set the appropriate input based on state
		switch (currentState) {
			case 'listening':
				if (riveInputs.hear) riveInputs.hear.value = true;
				break;
			case 'thinking':
				if (riveInputs.check) riveInputs.check.value = true;
				break;
			case 'speaking':
				if (riveInputs.talk) riveInputs.talk.value = true;
				break;
		}
	});
</script>

<div
	class={cn('relative flex flex-col items-center justify-center gap-5', className)}
	data-state={avatarState}
	role="img"
	aria-label={`Caro assistant - ${avatarState}`}
>
	<!-- Main avatar container -->
	<div class="relative" style:width="{size}px" style:height="{size}px">
		<!-- Outer glow effect -->
		<div
			class={cn(
				'absolute inset-0 rounded-full blur-2xl transition-all duration-700',
				avatarState !== 'idle' && 'animate-gentle-glow'
			)}
			style:background={stateGlowColors[avatarState]}
		></div>

		<!-- Subtle pulse ring for active states -->
		{#if avatarState === 'listening' || avatarState === 'speaking'}
			<div
				class={cn(
					'animate-pulse-ring-subtle absolute inset-1 rounded-full border opacity-0',
					avatarState === 'listening' ? 'border-emerald-300/60' : 'border-blue-400/60'
				)}
			></div>
		{/if}

		<!-- Main avatar with ring -->
		<div
			class={cn(
				'relative z-10 overflow-hidden rounded-full bg-linear-to-b from-sky-100 to-sky-200 ring-4 transition-all duration-500',
				stateRingColors[avatarState]
			)}
			style:width="{size}px"
			style:height="{size}px"
		>
			<!-- Rive Canvas (hidden if not loaded) -->
			<canvas
				bind:this={canvasRef}
				class={cn('h-full w-full', !useRive && 'hidden')}
				width={size * 2}
				height={size * 2}
			></canvas>

			<!-- Fallback Image Avatar -->
		</div>
	</div>
</div>

<style>
	@keyframes gentle-glow {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.05);
		}
	}

	@keyframes pulse-ring-subtle {
		0% {
			transform: scale(0.98);
			opacity: 0.4;
		}
		100% {
			transform: scale(1.08);
			opacity: 0;
		}
	}

	:global(.animate-gentle-glow) {
		animation: gentle-glow 3s ease-in-out infinite;
	}

	:global(.animate-pulse-ring-subtle) {
		animation: pulse-ring-subtle 2.5s ease-out infinite;
	}
</style>
