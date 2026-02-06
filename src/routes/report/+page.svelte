<script lang="ts">
	import { tick } from 'svelte';
	import { conversation } from '$lib/stores/conversation.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';

	interface CognitiveScore {
		score: number;
		observations: string[];
		concerns: string[];
	}

	interface AnalysisResult {
		memory: CognitiveScore;
		language: CognitiveScore;
		attention: CognitiveScore;
		orientation: CognitiveScore;
		executiveFunction: CognitiveScore;
		overallSeverity: 'normal' | 'mild' | 'moderate' | 'significant';
		summary: string;
		recommendations: string[];
	}

	let transcript = $state(conversation.getTranscript() ?? '');
	let isAnalyzing = $state(false);
	let analysisResult = $state<AnalysisResult | null>(null);
	let error = $state<string | null>(null);
	let assessmentHeading = $state<HTMLHeadingElement | null>(null);

	function setAssessmentHeading(element: HTMLHeadingElement) {
		assessmentHeading = element;
		return () => {
			if (assessmentHeading === element) {
				assessmentHeading = null;
			}
		};
	}

	async function analyzeTranscript() {
		if (!transcript.trim()) {
			error = 'Please enter a transcript to analyze.';
			return;
		}

		isAnalyzing = true;
		error = null;
		analysisResult = null;

		try {
			const response = await fetch('/api/caresma/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transcript })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Analysis failed');
			}

			const data = await response.json();
			analysisResult = data.analysis;
			await tick();
			assessmentHeading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
		} finally {
			isAnalyzing = false;
		}
	}

	function getScoreColor(score: number): string {
		if (score >= 8) return 'text-green-600';
		if (score >= 5) return 'text-amber-600';
		return 'text-red-600';
	}

	function getScoreBarColor(score: number): string {
		if (score >= 8) return 'bg-green-500';
		if (score >= 5) return 'bg-amber-500';
		return 'bg-red-500';
	}

	function getSeverityVariant(
		severity: string
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (severity) {
			case 'normal':
				return 'secondary';
			case 'mild':
				return 'outline';
			case 'moderate':
				return 'default';
			case 'significant':
				return 'destructive';
			default:
				return 'secondary';
		}
	}

	function getSeverityLabel(severity: string): string {
		switch (severity) {
			case 'normal':
				return 'No Significant Concerns';
			case 'mild':
				return 'Mild Concerns Noted';
			case 'moderate':
				return 'Moderate Concerns';
			case 'significant':
				return 'Significant Concerns';
			default:
				return severity;
		}
	}

	function getSeverityBorderColor(severity: string): string {
		switch (severity) {
			case 'normal':
				return 'border-l-green-500';
			case 'mild':
				return 'border-l-lime-500';
			case 'moderate':
				return 'border-l-amber-500';
			case 'significant':
				return 'border-l-red-500';
			default:
				return 'border-l-muted';
		}
	}

	const domains = [
		{ key: 'memory', label: 'Memory', icon: '🧠' },
		{ key: 'language', label: 'Language', icon: '💬' },
		{ key: 'attention', label: 'Attention', icon: '👁️' },
		{ key: 'orientation', label: 'Orientation', icon: '🧭' },
		{ key: 'executiveFunction', label: 'Executive Function', icon: '⚙️' }
	] as const;

	function loadSampleTranscript() {
		transcript = `User: Good morning! How are you today?

Caro: Good morning! I'm doing well, thank you for asking. How has your morning been so far?

User: Oh, it's been... what day is it again? I think it's Tuesday?

Caro: Today is actually Thursday. What did you have for breakfast this morning?

User: I had... I think I had toast. Yes, toast with... the thing you spread. You know, the yellow thing.

Caro: Butter?

User: Yes! Butter. I couldn't remember the word for a moment there.

Caro: That's alright. Tell me, do you have any plans for the weekend?

User: Weekend? Let me think... My daughter is coming. Or was that last week? She visits on Sundays usually. We go to that place... the one with the good soup.

Caro: That sounds nice. What's your daughter's name?

User: Sarah. She's a wonderful girl. Always takes care of me. She works at the... the place where they help sick people.

Caro: A hospital?

User: Yes, a hospital! She's a nurse there. Has been for many years now.`;
	}

	function clearAll() {
		transcript = '';
		analysisResult = null;
		error = null;
	}
</script>

<svelte:head>
	<title>Cognitive Assessment Report - Caro</title>
</svelte:head>

<main class="relative min-h-dvh px-4 py-6 sm:px-6">
	<!-- Header -->
	<header class="mx-auto mb-8 max-w-3xl">
		<Button variant="link" href="/" class="mb-4 px-0 text-base">← Back to Caro</Button>
		<h1 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
			Cognitive Assessment Report
		</h1>
		<p class="mt-2 text-lg text-muted-foreground">
			Analyze conversation transcripts for cognitive health indicators
		</p>
	</header>

	<div class="mx-auto flex max-w-3xl flex-col gap-6">
		<!-- Input Section -->
		<Card>
			<CardHeader>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<CardTitle class="text-xl">Conversation Transcript</CardTitle>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={loadSampleTranscript}>Load Sample</Button>
						<Button variant="outline" size="sm" onclick={clearAll}>Clear</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<Textarea
					bind:value={transcript}
					placeholder="Paste your conversation transcript here, or load a sample to see how the analysis works..."
					rows={12}
					class="text-base leading-relaxed"
				/>
				<Button
					class="w-full py-6 text-lg font-medium"
					onclick={analyzeTranscript}
					disabled={isAnalyzing}
				>
					{#if isAnalyzing}
						<span
							class="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"
						></span>
						Analyzing...
					{:else}
						Generate Report
					{/if}
				</Button>
			</CardContent>
		</Card>

		<!-- Error Display -->
		{#if error}
			<Alert variant="destructive">
				<AlertDescription class="text-base">{error}</AlertDescription>
			</Alert>
		{/if}

		<!-- Results Section -->
		{#if analysisResult}
			<div class="flex flex-col gap-6">
				<h2 class="text-2xl font-bold text-foreground" {@attach setAssessmentHeading}>
					Assessment Results
				</h2>

				<!-- Overall Severity -->
				<Card class="border-l-4 {getSeverityBorderColor(analysisResult.overallSeverity)}">
					<CardContent class="p-6">
						<Badge
							variant={getSeverityVariant(analysisResult.overallSeverity)}
							class="mb-3 px-4 py-2 text-base"
						>
							{getSeverityLabel(analysisResult.overallSeverity)}
						</Badge>
						<p class="text-base leading-relaxed text-muted-foreground">
							{analysisResult.summary}
						</p>
					</CardContent>
				</Card>

				<!-- Domain Scores -->
				<div class="grid gap-4 sm:grid-cols-2">
					{#each domains as domain (domain.key)}
						{@const data = analysisResult[domain.key as keyof AnalysisResult] as CognitiveScore}
						<Card>
							<CardContent class="p-5">
								<div class="mb-3 flex items-center gap-2.5">
									<span class="text-2xl" role="img" aria-hidden="true">{domain.icon}</span>
									<span class="text-lg font-semibold text-foreground">{domain.label}</span>
								</div>
								<div class="mb-2 text-3xl font-bold {getScoreColor(data.score)}">
									{data.score}/10
								</div>
								<div class="mb-4 h-2.5 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full transition-all duration-500 {getScoreBarColor(
											data.score
										)}"
										style:width="{data.score * 10}%"
									></div>
								</div>
								{#if data.observations.length > 0}
									<div class="mt-3">
										<p class="text-sm font-semibold text-muted-foreground">Observations</p>
										<ul
											class="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground"
										>
											{#each data.observations as obs (obs)}
												<li>{obs}</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if data.concerns.length > 0}
									<div class="mt-3">
										<p class="text-sm font-semibold text-destructive">Concerns</p>
										<ul class="mt-1 list-inside list-disc space-y-0.5 text-sm text-destructive/80">
											{#each data.concerns as concern (concern)}
												<li>{concern}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</CardContent>
						</Card>
					{/each}
				</div>

				<!-- Recommendations -->
				{#if analysisResult.recommendations.length > 0}
					<Card>
						<CardHeader>
							<CardTitle class="text-xl">Recommendations</CardTitle>
						</CardHeader>
						<CardContent>
							<ul
								class="list-inside list-disc space-y-1.5 text-base leading-relaxed text-muted-foreground"
							>
								{#each analysisResult.recommendations as rec (rec)}
									<li>{rec}</li>
								{/each}
							</ul>
						</CardContent>
					</Card>
				{/if}

				<!-- Disclaimer -->
				<Alert>
					<AlertTitle class="text-base font-semibold">Important</AlertTitle>
					<AlertDescription class="text-sm leading-relaxed">
						This assessment is for informational purposes only and should not be considered a
						medical diagnosis. Please consult a healthcare professional for proper evaluation and
						care planning.
					</AlertDescription>
				</Alert>
			</div>
		{/if}
	</div>
</main>
