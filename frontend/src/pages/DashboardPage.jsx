/**
 * Dashboard Page Component
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, aiAPI, handleAPIError } from '../services/api';
import ExplainTab from '../components/ExplainTab';
import RewriteTab from '../components/RewriteTab';
import RoadmapTab from '../components/RoadmapTab';
import DocumentSummarizerTab from '../components/DocumentSummarizerTab';
import './styles/DashboardPage.css';

function DashboardPage() {
  const [activeTab, setActiveTab] = useState('explain');
  const navigate = useNavigate();

  const handleLogout = () => {
    authAPI.logout();
    navigate('/');
  };

  return (
    <div className="dashboard-page">
      <nav className="dashboard-nav">
        <div className="container">
          <div className="nav-brand">ClarityAI</div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container dashboard-container">
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'explain' ? 'active' : ''}`}
            onClick={() => setActiveTab('explain')}
          >
            📚 Explain
          </button>
          <button
            className={`tab-btn ${activeTab === 'rewrite' ? 'active' : ''}`}
            onClick={() => setActiveTab('rewrite')}
          >
            ✏️ Rewrite
          </button>
          <button
            className={`tab-btn ${activeTab === 'roadmap' ? 'active' : ''}`}
            onClick={() => setActiveTab('roadmap')}
          >
            🗺️ Roadmap
          </button>
          <button
            className={`tab-btn ${activeTab === 'document' ? 'active' : ''}`}
            onClick={() => setActiveTab('document')}
          >
            📄 Document
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'explain' && <ExplainTab />}
          {activeTab === 'rewrite' && <RewriteTab />}
          {activeTab === 'roadmap' && <RoadmapTab />}
          {activeTab === 'document' && <DocumentSummarizerTab />}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
