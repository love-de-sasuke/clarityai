/**
 * Roadmap Tab Component
 */

import React, { useState } from 'react';
import { aiAPI, handleAPIError } from '../services/api';
import './styles/FeatureTabs.css';

function RoadmapTab() {
  const [goal, setGoal] = useState('');
  const [timeframeWeeks, setTimeframeWeeks] = useState(8);
  const [level, setLevel] = useState('intermediate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleGenerateRoadmap = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await aiAPI.roadmap(goal, timeframeWeeks, level);
      setResult(response.data.result);
    } catch (err) {
      setError(handleAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feature-tab">
      <h2>🗺️ Roadmap Generator</h2>
      <p>Create a personalized learning or career roadmap for your goals.</p>

      <form onSubmit={handleGenerateRoadmap} className="feature-form">
        <div className="form-group">
          <label htmlFor="goal">What do you want to achieve?</label>
          <input
            id="goal"
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g., Learn React in 8 weeks, Become a Data Scientist"
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="timeframe">Timeframe (weeks)</label>
          <input
            id="timeframe"
            type="number"
            value={timeframeWeeks}
            onChange={(e) => setTimeframeWeeks(parseInt(e.target.value))}
            min="1"
            max="52"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="level">Experience Level</label>
          <select
            id="level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={loading}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate Roadmap'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {loading && <div className="spinner"></div>}

      {result && (
        <div className="result-container">
          {result.prerequisites && result.prerequisites.length > 0 && (
            <div className="result-section">
              <h3>Prerequisites</h3>
              <ul>
                {result.prerequisites.map((prerequisite, idx) => (
                  <li key={idx}>{prerequisite}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="result-section">
            <h3>Weeks Breakdown</h3>
            <div className="roadmap-weeks">
              {result.weeks?.map((week) => (
                <div key={week.week_number} className="week-card">
                  <h4>Week {week.week_number}</h4>
                  <p className="milestone"><strong>Milestone:</strong> {week.milestone}</p>
                  <p><strong>Estimated Hours:</strong> {week.estimated_hours}</p>
                  <h5>Tasks:</h5>
                  <ul>
                    {week.tasks?.map((task, idx) => (
                      <li key={idx}>{task}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {result.resources && result.resources.length > 0 && (
            <div className="result-section">
              <h3>Recommended Resources</h3>
              <ul className="resources-list">
                {result.resources.map((resource, idx) => (
                  <li key={idx}>
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                      {resource.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.confidence && (
            <div className="result-section">
              <h3>Feasibility Score</h3>
              <div className="confidence-bar">
                <div 
                  className="confidence-fill" 
                  style={{ width: `${result.confidence * 100}%` }}
                ></div>
              </div>
              <p>{(result.confidence * 100).toFixed(0)}% Confidence</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RoadmapTab;
