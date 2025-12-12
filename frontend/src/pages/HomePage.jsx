/**
 * Home Page Component
 */

import React from 'react';
import { Link } from 'react-router-dom';
import './styles/HomePage.css';

function HomePage() {
  return (
    <div className="home-page">
      <nav className="navbar">
        <div className="container">
          <div className="nav-brand">ClarityAI</div>
          <div className="nav-links">
            <Link to="/login" className="btn-secondary">Login</Link>
            <Link to="/register" className="btn-primary">Sign Up</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <h1>Welcome to ClarityAI</h1>
          <p>Your AI-powered assistant for learning, planning, and writing</p>
          <Link to="/register" className="btn-large">Get Started Free</Link>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <h3>📚 Explain Anything</h3>
              <p>Get clear, concise explanations with examples and key takeaways</p>
            </div>
            <div className="feature-card">
              <h3>🗺️ Roadmap Generator</h3>
              <p>Create realistic learning roadmaps tailored to your experience level</p>
            </div>
            <div className="feature-card">
              <h3>✏️ Rewrite Text</h3>
              <p>Improve your writing with multiple tone variations and suggestions</p>
            </div>
            <div className="feature-card">
              <h3>📄 Document Summarizer</h3>
              <p>Quickly summarize documents and extract key insights</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
