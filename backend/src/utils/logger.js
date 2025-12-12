/**
 * Logger utility for telemetry and debugging
 * Per markdown.md section 10: Logging, telemetry & metrics to collect
 */

class Logger {
  logRequest(requestData) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: requestData.requestId,
      featureType: requestData.featureType,
      userId: requestData.userId || null,
      startTime: requestData.startTime,
      endTime: requestData.endTime,
      duration_ms: requestData.endTime - requestData.startTime,
      status: requestData.status,
      modelProvider: requestData.modelProvider,
      modelVersion: requestData.modelVersion,
      promptTokens: requestData.promptTokens,
      completionTokens: requestData.completionTokens,
      totalTokens: requestData.totalTokens,
      confidence: requestData.confidence,
      cost: this._calculateCost(requestData)
    };

    console.log('[TELEMETRY]', JSON.stringify(logEntry));
    return logEntry;
  }

  _calculateCost(data) {
    // Approximate OpenAI GPT-4 pricing (as of 2024)
    const inputCostPer1k = 0.03;
    const outputCostPer1k = 0.06;

    const inputCost = (data.promptTokens / 1000) * inputCostPer1k;
    const outputCost = (data.completionTokens / 1000) * outputCostPer1k;

    return (inputCost + outputCost).toFixed(4);
  }

  error(message, error, context = {}) {
    console.error('[ERROR]', message, error, context);
  }

  info(message, data = {}) {
    console.log('[INFO]', message, data);
  }

  warn(message, data = {}) {
    console.warn('[WARN]', message, data);
  }
}

export default new Logger();
