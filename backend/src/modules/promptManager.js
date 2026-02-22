/**
 * Prompt Manager - Deterministic Structured Output Engine
 * Strict JSON enforcement. Zero tolerance for schema drift.
 */

const SYSTEM_PROMPT = `You are ClarityAI.

You must strictly follow the user's instructions and output requirements.

NON-NEGOTIABLE RULES:

1. OUTPUT FORMAT
- Your entire response MUST be a single valid JSON object.
- Do NOT include markdown.
- Do NOT include code blocks.
- Do NOT include commentary, explanations, reasoning, or notes.
- Do NOT prepend or append any text.
- The first character MUST be {
- The last character MUST be }
- No trailing commas.
- All keys must use double quotes.
- All string values must use double quotes.
- Escape special characters properly.

2. STRICT COMPLIANCE
- Follow the exact structure requested.
- Do NOT add extra fields.
- Do NOT remove required fields.
- Do NOT rename fields.
- Do NOT change data types.
- If a number is required, return a number.
- If an array count is specified, match it exactly.
- Enforce numeric ranges strictly.

3. CONTENT CONTROL
- Only include information explicitly requested.
- Do NOT add introductions or conclusions unless required by schema.
- Do NOT expand beyond scope.
- Do NOT infer additional structure.

4. INTERNAL VALIDATION (MANDATORY BEFORE OUTPUT)
- Validate JSON syntax.
- Verify all brackets and braces are properly closed.
- Confirm numeric fields are numeric.
- Confirm required counts match exactly.

Precision overrides creativity.
`;

class PromptManager {
  generatePrompt(featureType, userParams, contextText = '') {
    let userPrompt = '';
    let metadata = {
      maxTokens: 2000,
      stopSequences: ['\n}\n', '\n}', '}\n', '}', '```'],
      feature: featureType
    };

    switch (featureType) {
      case 'explain':
        userPrompt = this._generateExplainPrompt(userParams);
        metadata.maxTokens = userParams.detailLevel === 'detailed' ? 3000 : 1800;
        break;

      case 'roadmap':
        userPrompt = this._generateRoadmapPrompt(userParams);
        metadata.maxTokens = 2800;
        break;

      case 'rewrite':
        userPrompt = this._generateRewritePrompt(userParams);
        metadata.maxTokens = 1800;
        break;

      case 'document':
        userPrompt = this._generateDocumentPrompt(userParams, contextText);
        metadata.maxTokens = 3000;
        break;

      default:
        throw new Error(`Unknown feature type: ${featureType}`);
    }

    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      metadata
    };
  }

  _generateExplainPrompt(params) {
    const { topic, detailLevel = 'short' } = params;
    const deepDiveCount = detailLevel === 'detailed' ? 5 : 3;

    return `Explain the topic strictly according to schema.

TOPIC: "${topic}"
DETAIL_LEVEL: "${detailLevel}"

REQUIRED JSON STRUCTURE:

{
  "title": "string",
  "summary": {
    "for_beginner": "string",
    "for_expert": "string"
  },
  "deep_dive": [
    {
      "concept": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "key_takeaways": ["string"],
  "quiz": [
    {
      "q": "string",
      "options": ["string", "string", "string", "string"],
      "answer": 0,
      "explanation": "string"
    }
  ],
  "confidence": 0.0
}

STRICT REQUIREMENTS:
- EXACTLY ${deepDiveCount} deep_dive items.
- EXACTLY 6 key_takeaways.
- EXACTLY 5 quiz questions.
- EXACTLY 4 options per question.
- answer MUST be integer 0–3.
- confidence MUST be 0.0–1.0.
- Output ONLY valid JSON.
`;
  }

  _generateRoadmapPrompt(params) {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = params;

    return `Create structured roadmap.

GOAL: "${goal}"
TIMEFRAME_WEEKS: ${timeframeWeeks}
LEVEL: "${level}"

REQUIRED JSON STRUCTURE:

{
  "title": "string",
  "prerequisites": ["string"],
  "weeks": [
    {
      "week_number": 1,
      "theme": "string",
      "tasks": ["string"],
      "project_milestone": "string",
      "estimated_hours": 0
    }
  ],
  "resources": {
    "beginner": [
      { "title": "string", "url": "https://...", "type": "string" }
    ],
    "intermediate": [
      { "title": "string", "url": "https://...", "type": "string" }
    ],
    "advanced": [
      { "title": "string", "url": "https://...", "type": "string" }
    ]
  },
  "confidence": 0.0
}

STRICT REQUIREMENTS:
- EXACTLY 4 prerequisites.
- EXACTLY ${timeframeWeeks} weeks.
- week_number sequential starting at 1.
- EXACTLY 4 tasks per week.
- estimated_hours numeric.
- EXACTLY 2 resources per difficulty.
- URLs must start with https://
- confidence 0.0–1.0.
- Output ONLY valid JSON.
`;
  }

  _generateRewritePrompt(params) {
    const { text, tone = 'formal' } = params;

    return `Rewrite text strictly per schema.

ORIGINAL_TEXT:
"""
${text}
"""

REQUESTED_TONE: "${tone}"

REQUIRED JSON STRUCTURE:

{
  "analysis": {
    "original_tone": "string",
    "suggested_improvements": ["string", "string"]
  },
  "rewrites": [
    { "tone": "${tone}", "text": "string" },
    { "tone": "contrasting", "text": "string" },
    { "tone": "creative", "text": "string" }
  ],
  "confidence": 0.0
}

STRICT REQUIREMENTS:
- EXACTLY 2 suggested_improvements.
- EXACTLY 3 rewrites.
- First rewrite MUST match requested tone.
- Preserve meaning.
- confidence 0.0–1.0.
- Output ONLY valid JSON.
`;
  }

  _generateDocumentPrompt(params, textChunk) {
    const { isChunk = false } = params;

    if (isChunk) {
      return `Summarize document chunk strictly.

DOCUMENT_CHUNK:
"""
${textChunk}
"""

REQUIRED JSON STRUCTURE:

{
  "chunk_summary": "string",
  "key_points": ["string", "string", "string"],
  "action_items": ["string"],
  "confidence": 0.0
}

STRICT REQUIREMENTS:
- EXACTLY 3 key_points.
- action_items must exist (may be empty).
- Use only provided text.
- confidence 0.0–1.0.
- Output ONLY valid JSON.
`;
    }

    return `Synthesize document summaries.

INPUT_SUMMARIES:
"""
${textChunk}
"""

REQUIRED JSON STRUCTURE:

{
  "title": "string",
  "executive_summary": "string",
  "key_highlights": ["string", "string", "string", "string", "string"],
  "action_items": ["string"],
  "keywords": ["string"],
  "confidence": 0.0
}

STRICT REQUIREMENTS:
- EXACTLY 5 key_highlights.
- 10–15 keywords.
- De-duplicate action_items.
- Do NOT copy verbatim. Synthesize.
- confidence 0.0–1.0.
- Output ONLY valid JSON.
`;
  }

  generateCorrectivePrompt(featureType, originalOutput, error) {
    return {
      systemPrompt: `CRITICAL FAILURE: Previous output invalid JSON.
Return ONLY valid JSON.
No markdown.
No commentary.
Start with { and end with }.`,

      userPrompt: `JSON ERROR:
"${error}"

Re-generate strictly valid JSON according to original schema.
Fix syntax.
Fix data types.
Match required counts exactly.
Output ONLY JSON.`,

      metadata: {
        maxTokens: 1500,
        stopSequences: ['\n}\n', '\n}', '}\n', '}'],
        feature: featureType,
        isCorrective: true
      }
    };
  }
}

export default new PromptManager();
