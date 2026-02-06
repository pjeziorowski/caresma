/**
 * Prompts and schema for transcript analysis (cognitive health indicators, report generation).
 */

import { z } from 'zod';

const scoreSchema = z
	.number()
	.min(1)
	.max(10)
	.describe(
		'Domain score from 1 to 10: 10 = no concerns, 7-9 = minor observations, 4-6 = moderate concerns, 1-3 = significant concerns.'
	);

export const CognitiveDomainSchema = z.object({
	score: scoreSchema,
	observations: z
		.array(z.string())
		.describe(
			'Specific, factual observations from the conversation that relate to this cognitive domain. Write in second person ("you/your") since the report is shown to the person assessed (e.g. "You were uncertain about the day" not "The user was uncertain"). One short sentence per item; use empty array if none.'
		),
	concerns: z
		.array(z.string())
		.describe(
			'Signs of impairment or risk in this domain suggested by the conversation. Write in second person ("you/your") since the report is shown to the person assessed (e.g. "Your confusion about the day" not "The user\'s confusion"). One short sentence per item; use empty array if none.'
		)
});

export const CognitiveAssessmentSchema = z.object({
	memory: CognitiveDomainSchema.describe(
		'Recall, recent vs remote memory, repetition, forgetting names or events mentioned in the conversation.'
	),
	language: CognitiveDomainSchema.describe(
		'Word-finding, fluency, comprehension, naming, grammar, or coherence of speech.'
	),
	attention: CognitiveDomainSchema.describe(
		'Focus, distractibility, staying on topic, or need for repetition during the conversation.'
	),
	orientation: CognitiveDomainSchema.describe(
		'Awareness of time, place, or person; confusion about context or situation.'
	),
	executiveFunction: CognitiveDomainSchema.describe(
		'Planning, reasoning, sequencing, judgment, or organization evident in the conversation.'
	),
	overallSeverity: z
		.enum(['normal', 'mild', 'moderate', 'significant'])
		.describe(
			'Overall level of cognitive concern: normal = no concerning signs; mild = minor observations only; moderate = clear but limited concerns; significant = multiple or serious indicators.'
		),
	summary: z
		.string()
		.describe(
			'Brief 2-3 sentence summary of the assessment for the person being assessed. Use second person ("you/your") throughout—e.g. "You showed clear time disorientation" not "The user showed". Key findings, overall impression, and main areas of concern or reassurance.'
		),
	recommendations: z
		.array(z.string())
		.describe(
			'Concrete, actionable recommendations written FOR THE ELDER OR THEIR FAMILY/CAREGIVERS (e.g. "Consider a hearing check", "Talk to your GP if you notice repeated forgetfulness", "Try brief memory exercises at home"). One recommendation per string. Do NOT write recommendations for the app developer (e.g. avoid "Gather more samples", "Use probing questions in the app").'
		)
});

export type CognitiveAssessment = z.infer<typeof CognitiveAssessmentSchema>;

export const ANALYSIS_SYSTEM_MESSAGE =
	'You are a clinical AI assistant that analyzes conversations for cognitive health indicators. The report is shown to the person being assessed (the elder). Use second person ("you/your") in summary, observations, and concerns—never refer to "the user". Recommendations must be for the elder or their family/caregivers, not the app or developer.';

const ANALYSIS_PROMPT_TEMPLATE = `Analyze this conversation transcript between an AI assistant and an elderly user for signs of cognitive impairment. Provide a structured assessment for memory, language, attention, orientation, and executive function.

TRANSCRIPT:
{{TRANSCRIPT}}

Score guide: 10 = no concerns, 7-9 = minor observations, 4-6 = moderate concerns, 1-3 = significant concerns. Overall severity: normal, mild, moderate, or significant.

Voice: The report is shown to the person who had the conversation (the elder). Write the summary, all observations, and all concerns in second person—use "you" and "your" (e.g. "You were uncertain about the day", "Your word-finding improved with a cue"). Do NOT use "the user" or "the participant".

Recommendations: Write each recommendation FOR THE ELDER OR THEIR FAMILY/CAREGIVERS—actionable advice they can follow (e.g. "Consider a hearing check if conversations feel unclear", "If you or a family member notice more forgetfulness, talk to your GP", "Try simple memory exercises like recalling the day's events"). Do NOT include recommendations for the app or developer (e.g. do not suggest gathering more samples, changing the app, or using different prompts).`;

/**
 * Builds the user prompt for transcript analysis with the given transcript.
 */
export function getAnalysisPrompt(transcript: string): string {
	return ANALYSIS_PROMPT_TEMPLATE.replace('{{TRANSCRIPT}}', transcript);
}
