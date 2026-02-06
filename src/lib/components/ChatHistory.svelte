<script lang="ts">
	import { cn } from '$lib/utils';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import * as Collapsible from '$lib/components/ui/collapsible';

	export interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
	}

	interface Props {
		messages?: ChatMessage[];
		isCollapsed?: boolean;
		onToggle?: () => void;
		class?: string;
	}

	let { messages = [], isCollapsed = false, onToggle, class: className }: Props = $props();

	let scrollAreaRef: HTMLDivElement | null = null;

	function setScrollAreaRef(node: HTMLDivElement) {
		scrollAreaRef = node;
		return () => {
			if (scrollAreaRef === node) {
				scrollAreaRef = null;
			}
		};
	}

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (messages.length && scrollAreaRef && !isCollapsed) {
			scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
		}
	});

	function handleToggle() {
		onToggle?.();
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<Collapsible.Root open={!isCollapsed} class={cn('w-full', className)}>
	<Card class="overflow-hidden border-border/60 bg-card/95 shadow-md backdrop-blur-sm">
		<CardHeader class="border-b border-border/40 px-5 py-2.5">
			<button
				type="button"
				onclick={handleToggle}
				class="flex w-full items-center justify-start gap-2.5 rounded-none bg-transparent py-1 text-base font-normal text-muted-foreground transition-colors hover:text-foreground"
				aria-expanded={!isCollapsed}
			>
				<svg
					class={cn('h-4 w-4 transition-transform duration-200', !isCollapsed && 'rotate-180')}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="18 15 12 9 6 15" />
				</svg>
				<span class="text-lg">Conversation ({messages.length})</span>
			</button>
		</CardHeader>

		<Collapsible.Content>
			<CardContent class="p-0">
				<div
					class="max-h-[350px] overflow-y-auto scroll-smooth px-5 pt-4 pb-5"
					{@attach setScrollAreaRef}
				>
					{#if messages.length === 0}
						<p class="py-8 text-center text-base text-muted-foreground italic">
							Your conversation will appear here.
						</p>
					{:else}
						<div class="flex flex-col gap-4">
							{#each messages as message (message.id)}
								<div
									class={cn(
										'max-w-[85%] rounded-2xl px-5 py-4',
										message.role === 'user'
											? 'ml-auto rounded-br-md bg-primary text-primary-foreground'
											: 'mr-auto rounded-bl-md bg-muted text-foreground'
									)}
								>
									<div
										class={cn(
											'mb-1.5 flex items-center justify-between text-xs',
											message.role === 'user'
												? 'text-primary-foreground/80'
												: 'text-muted-foreground'
										)}
									>
										<span class="text-sm font-semibold">
											{message.role === 'user' ? 'You' : 'Caro'}
										</span>
										<span class="text-xs">{formatTime(message.timestamp)}</span>
									</div>
									<p class="m-0 text-base leading-relaxed">{message.content}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</CardContent>
		</Collapsible.Content>
	</Card>
</Collapsible.Root>
