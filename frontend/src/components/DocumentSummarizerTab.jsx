/**
 * Document Summarizer Tab Component
 */

import React, { useState } from 'react';
import axios from 'axios';
import { handleAPIError } from '../services/api';
import './styles/FeatureTabs.css';

function DocumentSummarizerTab() {
  const [file, setFile] = useState(null);
  const [generateRoadmap, setGenerateRoadmap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(null);
  const [result, setResult] = useState(null);
  const [polling, setPolling] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file size (50MB max)
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/bmp'
      ];

      if (!allowedTypes.includes(selectedFile.type) && 
          !selectedFile.name.match(/\.(pdf|docx|txt|jpg|png|jpeg|gif|bmp)$/i)) {
        setError('File type not supported. Allowed: PDF, DOCX, TXT, PNG, JPG, GIF, BMP');
        return;
      }

      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setError('');
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('generateRoadmap', generateRoadmap);

    try {
      const token = localStorage.getItem('authToken');
      const config = {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      };

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      const response = await axios.post('/api/document/upload', formData, config);
      setRequestId(response.data.requestId);
      
      // Start polling for results
      pollForResults(response.data.requestId);
    } catch (err) {
      setError(handleAPIError(err));
      setLoading(false);
    }
  };

  const pollForResults = async (reqId, attempts = 0, maxAttempts = 60) => {
    if (attempts > maxAttempts) {
      setError('Document processing timeout. Please try again.');
      setLoading(false);
      return;
    }

    setPolling(true);

    try {
      const token = localStorage.getItem('authToken');
      const config = {};

      if (token) {
        config.headers = { Authorization: `Bearer ${token}` };
      }

      const response = await axios.get(`/api/document/request/${reqId}`, config);

      if (response.data.status === 'complete') {
        setResult(response.data.result);
        setLoading(false);
        setPolling(false);
      } else if (response.data.status === 'failed') {
        setError(`Processing failed: ${response.data.error}`);
        setLoading(false);
        setPolling(false);
      } else {
        // Continue polling after 2 seconds
        setTimeout(() => pollForResults(reqId, attempts + 1, maxAttempts), 2000);
      }
    } catch (err) {
      setError(handleAPIError(err));
      setLoading(false);
      setPolling(false);
    }
  };

  return (
    <div className="feature-tab">
      <h2>📄 Document Summarizer & Converter</h2>
      <p>Upload documents (PDF, DOCX, images) to extract text, summarize, and optionally generate learning roadmaps.</p>

      <form onSubmit={handleUpload} className="feature-form">
        <div className="form-group">
          <label htmlFor="file">Select Document</label>
          <input
            id="file"
            type="file"
            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.gif,.bmp"
            onChange={handleFileChange}
            disabled={loading}
          />
          {file && <small>Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)</small>}
        </div>

        <div className="form-group checkbox">
          <input
            id="generateRoadmap"
            type="checkbox"
            checked={generateRoadmap}
            onChange={(e) => setGenerateRoadmap(e.target.checked)}
            disabled={loading}
          />
          <label htmlFor="generateRoadmap">Generate Learning Roadmap (if applicable)</label>
        </div>

        <button type="submit" disabled={loading || !file}>
          {loading ? (polling ? 'Processing...' : 'Uploading...') : 'Upload & Summarize'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {requestId && (
        <div className="request-info">
          <p><strong>Request ID:</strong> <code>{requestId}</code></p>
          {polling && <p>Processing document... This may take a few moments.</p>}
        </div>
      )}

      {result && (
        <div className="result-container">
          {result.extracted_text_path && (
            <div className="result-section">
              <h3>Extracted Text</h3>
              <p><strong>Location:</strong> {result.extracted_text_path}</p>
              <small>Text stored securely in cloud storage</small>
            </div>
          )}

          {result.summary_short && (
            <div className="result-section">
              <h3>Summary</h3>
              <p>{result.summary_short}</p>
            </div>
          )}

          {result.highlights && result.highlights.length > 0 && (
            <div className="result-section">
              <h3>Key Highlights</h3>
              <ul>
                {result.highlights.map((highlight, idx) => (
                  <li key={idx}>{highlight}</li>
                ))}
              </ul>
            </div>
          )}

          {result.action_items && result.action_items.length > 0 && (
            <div className="result-section">
              <h3>Action Items</h3>
              <ul>
                {result.action_items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.keywords && result.keywords.length > 0 && (
            <div className="result-section">
              <h3>Keywords</h3>
              <div className="keywords">
                {result.keywords.map((keyword, idx) => (
                  <span key={idx} className="keyword-tag">{keyword}</span>
                ))}
              </div>
            </div>
          )}

          {result.generated_roadmap && (
            <div className="result-section">
              <h3>Generated Learning Roadmap</h3>
              <div className="roadmap-weeks">
                {result.generated_roadmap.weeks?.map((week) => (
                  <div key={week.week_number} className="week-card">
                    <h4>Week {week.week_number}</h4>
                    <p className="milestone"><strong>Milestone:</strong> {week.milestone}</p>
                    <p><strong>Hours:</strong> {week.estimated_hours}</p>
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
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentSummarizerTab;
