/**
 * Prompts for transcript analysis (cognitive health indicators, report generation).
 */

export const ANALYSIS_SYSTEM_MESSAGE =
	'You are a clinical AI assistant that analyzes conversations for cognitive health indicators. Always respond with valid JSON.';

const ANALYSIS_PROMPT_TEMPLATE = `Analyze this conversation transcript between an AI assistant and an elderly user for signs of cognitive impairment. Provide a structured assessment.

TRANSCRIPT:
{{TRANSCRIPT}}

Provide your analysis in the following JSON format:
{
  "memory": {
    "score": <1-10>,
    "observations": ["observation1", "observation2"],
    "concerns": ["concern1"] or []
  },
  "language": {
    "score": <1-10>,
    "observations": ["observation1"],
    "concerns": []
  },
  "attention": {
    "score": <1-10>,
    "observations": [],
    "concerns": []
  },
  "orientation": {
    "score": <1-10>,
    "observations": [],
    "concerns": []
  },
  "executiveFunction": {
    "score": <1-10>,
    "observations": [],
    "concerns": []
  },
  "overallSeverity": "normal" | "mild" | "moderate" | "significant",
  "summary": "Brief 2-3 sentence summary",
  "recommendations": ["recommendation1", "recommendation2"]
}

Score guide: 10 = no concerns, 7-9 = minor observations, 4-6 = moderate concerns, 1-3 = significant concerns.`;

/**
 * Builds the user prompt for transcript analysis with the given transcript.
 */
export function getAnalysisPrompt(transcript: string): string {
	return ANALYSIS_PROMPT_TEMPLATE.replace('{{TRANSCRIPT}}', transcript);
}
