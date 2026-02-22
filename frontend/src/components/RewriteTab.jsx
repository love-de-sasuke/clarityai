/**
 * Rewrite Tab Component
 */

import React, { useState } from 'react';
import { aiAPI, handleAPIError } from '../services/api';
import './styles/FeatureTabs.css';

function RewriteTab() {
  const [text, setText] = useState('');
  const [tone, setTone] = useState('formal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleRewrite = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await aiAPI.rewrite(text, tone);
      setResult(response.data.result);
    } catch (err) {
      setError(handleAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feature-tab">
      <h2>✏️ Rewrite Text</h2>
      <p>Get multiple variations of your text in different tones and styles.</p>

      <form onSubmit={handleRewrite} className="feature-form">
        <div className="form-group">
          <label htmlFor="text">Text to Rewrite</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here..."
            rows="6"
            required
            disabled={loading}
          ></textarea>
        </div>

        <div className="form-group">
          <label htmlFor="tone">Desired Tone</label>
          <select
            id="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            disabled={loading}
          >
            <option value="formal">Formal & Professional</option>
            <option value="friendly">Friendly & Casual</option>
            <option value="short">Short & Concise</option>
            <option value="assertive">Assertive & Bold</option>
            <option value="persuasive">Persuasive</option>
            <option value="empathetic">Empathetic</option>
            <option value="humorous">Humorous</option>
            <option value="academic">Academic</option>
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Rewriting...' : 'Rewrite'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {loading && <div className="spinner"></div>}

      {result && (
        <div className="result-container">
          <div className="result-section">
            <h3>Variations</h3>
            {result.rewrites?.map((rewrite, idx) => (
              <div key={idx} className="rewrite-variation">
                <p><strong>{rewrite.tone}</strong></p>
                <p>{rewrite.text}</p>
                <button onClick={() => navigator.clipboard.writeText(rewrite.text)}>Copy</button>
              </div>
            ))}
          </div>

          {result.subject_suggestions && result.subject_suggestions.length > 0 && (
            <div className="result-section">
              <h3>Subject Suggestions</h3>
              <ul>
                {result.subject_suggestions.map((subject, idx) => (
                  <li key={idx} onClick={() => navigator.clipboard.writeText(subject)} style={{cursor: 'pointer'}}>{subject}</li>
                ))}
              </ul>
            </div>
          )}

          {result.caption && (
            <div className="result-section">
              <h3>Social Caption</h3>
              <p>{result.caption}</p>
            </div>
          )}

          {result.changes_summary && (
            <div className="result-section">
              <h3>Changes Made</h3>
              <p>{result.changes_summary}</p>
            </div>
          )}

          {result.confidence && (
            <div className="result-section">
              <p><strong>Confidence: {(result.confidence * 100).toFixed(0)}%</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RewriteTab;
