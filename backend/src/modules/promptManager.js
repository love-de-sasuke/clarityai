/**
 * Prompt Manager - Generates prompts based on feature type and user params
 * Per markdown.md section 4: Prompt templates
 */

const SYSTEM_PROMPT = `You are ClarityAI, a world-class AI assistant designed to provide clear, accurate, and structured information. Your responses MUST be in valid JSON format.

**Core Directives:**

1.  **Think Step-by-Step:** Before generating the final JSON, take a moment to analyze the user's request and plan your response. This will ensure accuracy and completeness.
2.  **Strict JSON Output:**
    *   Your entire output MUST be a single, valid JSON object.
    *   Do NOT use markdown (e.g., \`\`\`json).
    *   Do NOT add any text before or after the JSON object.
    *   All strings must be properly escaped.
    *   Ensure all brackets \`[]\` and braces \`{}\` are correctly paired and closed.
3.  **Self-Correction:** Before finalizing your response, double-check it to ensure it is valid JSON and that it meets all the requirements of the user's prompt. If you find an error, correct it before outputting.
4.  **Confidence Score:** If a "confidence" field is requested, it MUST be a number between 0.0 and 1.0. This represents your confidence in the accuracy and completeness of your response.
5.  **Persona:** Your persona is that of a helpful and knowledgeable expert. Your language should be clear, concise, and easy to understand.
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
        metadata.maxTokens = userParams.detailLevel === 'detailed' ? 3000 : 1500;
        break;

      case 'roadmap':
        userPrompt = this._generateRoadmapPrompt(userParams);
        metadata.maxTokens = 2500;
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
    return `Provide a comprehensive explanation of the following topic for a diverse audience, from beginners to experts.

**Topic:** "${topic}"
**Detail Level:** ${detailLevel}

Your response must be a valid JSON object with the following structure:

{
  "title": "A clear and concise title for the explanation",
  "summary": {
    "for_beginner": "A simple, one-paragraph explanation suitable for a complete novice. Use an analogy.",
    "for_expert": "A more detailed, one-paragraph explanation for someone already familiar with the field, including technical nuances."
  },
  "deep_dive": [
    {
      "concept": "The name of a core concept or sub-topic",
      "explanation": "A detailed explanation of this concept.",
      "example": "A real-world example of this concept."
    },
    {
      "concept": "Another core concept",
      "explanation": "A detailed explanation.",
      "example": "A real-world example."
    }
  ],
  "key_takeaways": [
    "A list of 5-7 key takeaways or bullet points.",
    "Each takeaway should be a single, concise sentence."
  ],
  "quiz": [
    {
      "q": "A challenging multiple-choice question about the topic.",
      "options": ["Option 1", "Option 2", "Option 3", "The correct answer"],
      "answer": 3,
      "explanation": "A brief explanation of why the answer is correct."
    },
    {
      "q": "Another challenging question.",
      "options": ["Option A", "The correct answer", "Option C", "Option D"],
      "answer": 1,
      "explanation": "An explanation for the correct answer."
    }
  ],
  "confidence": 0.9 
}

**Instructions:**

*   The number of items in "deep_dive" should be between 3 and 5, depending on the topic's complexity.
*   The "quiz" should contain exactly 5 questions.
*   Ensure the entire output is a single, valid JSON object.
`;
  }

  _generateRoadmapPrompt(params) {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = params;
    return `Create a detailed, week-by-week learning roadmap for the following goal. The roadmap should be practical and include project-based milestones.

**Goal:** "${goal}"
**Timeframe:** ${timeframeWeeks} weeks
**Experience Level:** ${level}

Your response must be a valid JSON object with the following structure:

{
  "title": "A motivating title for the roadmap",
  "prerequisites": [
    "A list of 3-5 essential skills or knowledge required before starting.",
    "Be specific (e.g., 'Familiarity with JavaScript ES6 features' instead of 'Know JavaScript')."
  ],
  "weeks": [
    {
      "week_number": 1,
      "theme": "A theme for the week (e.g., 'Core Concepts' or 'Building the Foundation').",
      "tasks": [
        "A specific, actionable task.",
        "Another specific task."
      ],
      "project_milestone": "A small project or a part of a larger project to complete this week.",
      "estimated_hours": 10
    }
  ],
  "resources": {
    "beginner": [
      {
        "title": "A resource title",
        "url": "https://example.com/resource1",
        "type": "Article"
      }
    ],
    "intermediate": [
      {
        "title": "Another resource",
        "url": "https://example.com/resource2",
        "type": "Video"
      }
    ],
    "advanced": [
      {
        "title": "An advanced resource",
        "url": "https://example.com/resource3",
        "type": "Book"
      }
    ]
  },
  "confidence": 0.85
}

**Instructions:**

*   The number of weeks must match the "Timeframe".
*   Each week should have 3-5 actionable tasks.
*   Resources should be categorized by difficulty level.
*   Ensure all URLs are valid and start with http:// or https://.
*   The entire output must be a single, valid JSON object.
`;
  }

  _generateRewritePrompt(params) {
    const { text, tone = 'formal' } = params;
    return `Analyze and rewrite the following text. Provide multiple variations in different tones and a detailed analysis of the changes.

**Original Text:**
"""
${text}
"""

**Requested Tone:** ${tone}

Your response must be a valid JSON object with the following structure:

{
  "analysis": {
    "original_tone": "A brief analysis of the original text's tone and style.",
    "suggested_improvements": "A list of 2-3 suggestions for improving the original text."
  },
  "rewrites": [
    {
      "tone": "${tone}",
      "text": "The rewritten text in the requested tone."
    },
    {
      "tone": "A contrasting tone (e.g., 'casual' if the requested tone was 'formal')",
      "text": "The rewritten text in the contrasting tone."
    },
    {
      "tone": "A creative or niche tone (e.g., 'persuasive', 'humorous', 'academic')",
      "text": "The rewritten text in the creative tone."
    }
  ],
  "confidence": 0.9
}

**Instructions:**

*   Provide exactly 3 rewrite variations. One must be in the requested tone.
*   The analysis should be brief and to the point.
*   Ensure the entire output is a single, valid JSON object.
`;
  }

  _generateDocumentPrompt(params, textChunk) {
    const { isChunk = false } = params;
    
    if (isChunk) {
      return `You are a part of a map-reduce process. Your task is to summarize the following document chunk.

**Document Chunk:**
"""
${textChunk}
"""

Your response must be a valid JSON object with the following structure:

{
  "chunk_summary": "A concise summary of the key information in this chunk.",
  "key_points": [
    "A list of 2-3 of the most important bullet points from this chunk."
  ],
  "action_items": [
    "A list of any specific action items or tasks mentioned in this chunk."
  ]
}

**Instructions:**

*   Focus only on the information present in the chunk.
*   The summary should be dense and informative.
*   Ensure the entire output is a single, valid JSON object.
`;
    } else {
      return `You are the final step in a map-reduce process. You have been given summaries and key points from different chunks of a document. Your task is to synthesize this information into a final, comprehensive summary.

**Synthesized Information:**
"""
${textChunk}
"""

Your response must be a valid JSON object with the following structure:

{
  "title": "A descriptive title for the document.",
  "executive_summary": "A high-level executive summary of the entire document (2-3 paragraphs).",
  "key_highlights": [
    "A list of 5-7 of the most important highlights from the entire document."
  ],
  "action_items": [
    "A consolidated and de-duplicated list of all action items from the document."
  ],
  "keywords": [
    "A list of 10-15 relevant keywords for the entire document."
  ],
  "confidence": 0.9
}

**Instructions:**

*   Do not simply combine the chunk summaries. Synthesize them into a coherent narrative.
*   De-duplicate the action items and key points to create a clean final list.
*   Ensure the entire output is a single, valid JSON object.
`;
    }
  }

  /**
   * Generate a corrective prompt for when JSON parsing fails
   */
  generateCorrectivePrompt(featureType, originalOutput, error) {
    const correctivePrompts = {
      explain: `Your previous response had invalid JSON. The error was: "${error}"
                Please re-answer with ONLY valid JSON, no markdown, no code blocks.`,
      roadmap: `Your previous roadmap response had JSON errors: "${error}"
                Please re-generate the roadmap with ONLY valid JSON. Remember: confidence must be a NUMBER (0.0-1.0), not a word.`,
      rewrite: `Your rewrite response had invalid JSON: "${error}"
                Please provide ONLY valid JSON. Confidence must be a NUMBER (e.g., 0.8), not "high" or "medium".`,
      document: `Your document summary had JSON errors: "${error}"
                 Please provide ONLY valid JSON output, no markdown formatting.`
    };

    return {
      systemPrompt: `CRITICAL: Your previous response had invalid JSON. This time, return ONLY valid JSON. No markdown, no code blocks, no extra text. Start with { and end with }.`,
      userPrompt: correctivePrompts[featureType] || `Please fix your JSON output. Error: ${error}`,
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