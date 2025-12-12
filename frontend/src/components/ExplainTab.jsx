/**
 * Explain Tab Component
 */

import React, { useState } from 'react';
import { aiAPI, handleAPIError } from '../services/api';
import './styles/FeatureTabs.css';

function ExplainTab() {
  const [topic, setTopic] = useState('');
  const [detailLevel, setDetailLevel] = useState('short');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleExplain = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await aiAPI.explain(topic, detailLevel, true);
      setResult(response.data.result);
    } catch (err) {
      setError(handleAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feature-tab">
      <h2>📚 Explain Anything</h2>
      <p>Get clear explanations with examples, key takeaways, and a quiz.</p>

      <form onSubmit={handleExplain} className="feature-form">
        <div className="form-group">
          <label htmlFor="topic">What do you want to understand?</label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Machine Learning, OAuth, DBMS Normalization"
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="detailLevel">Detail Level</label>
          <select
            id="detailLevel"
            value={detailLevel}
            onChange={(e) => setDetailLevel(e.target.value)}
            disabled={loading}
          >
            <option value="short">Short & Simple</option>
            <option value="detailed">Detailed & Comprehensive</option>
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Explaining...' : 'Explain'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {loading && <div className="spinner"></div>}

      {result && (
        <div className="result-container">
          <div className="result-section">
            <h3>Summary</h3>
            <p>{result.summary}</p>
          </div>

          <div className="result-section">
            <h3>Real-World Examples</h3>
            <ul>
              {result.examples?.map((example, idx) => (
                <li key={idx}>{example}</li>
              ))}
            </ul>
          </div>

          <div className="result-section">
            <h3>Key Takeaways</h3>
            <ul>
              {result.bullets?.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
          </div>

          <div className="result-section">
            <h3>Keywords</h3>
            <div className="keywords">
              {result.keywords?.map((keyword, idx) => (
                <span key={idx} className="keyword-tag">{keyword}</span>
              ))}
            </div>
          </div>

          {result.quiz && (
            <div className="result-section">
              <h3>Quiz</h3>
              <div className="quiz">
                {result.quiz.map((question, idx) => (
                  <div key={idx} className="quiz-question">
                    <p><strong>Q{idx + 1}: {question.q}</strong></p>
                    <ul>
                      {question.options.map((option, optIdx) => (
                        <li key={optIdx} className={question.answer === optIdx ? 'correct' : ''}>
                          {optIdx === question.answer && '✓ '}{option}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ExplainTab;
