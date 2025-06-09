import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Terminal from './components/Terminal';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [environments, setEnvironments] = useState([]);
  const [selectedEnv, setSelectedEnv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [nodeCount, setNodeCount] = useState(1);

  useEffect(() => {
    fetchEnvironments();
    const interval = setInterval(fetchEnvironments, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchEnvironments = async () => {
    try {
      const response = await axios.get(`${API_BASE}/environments`);
      setEnvironments(response.data);
    } catch (error) {
      console.error('Error fetching environments:', error);
    }
  };

  const createEnvironment = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/environments`, {
        nodeCount: parseInt(nodeCount)
      });
      setEnvironments([...environments, response.data]);
    } catch (error) {
      console.error('Error creating environment:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteEnvironment = async (envId) => {
    try {
      await axios.delete(`${API_BASE}/environments/${envId}`);
      setEnvironments(environments.filter(env => env.id !== envId));
      if (selectedEnv?.id === envId) {
        setSelectedEnv(null);
      }
    } catch (error) {
      console.error('Error deleting environment:', error);
    }
  };

  const connectToEnvironment = (env) => {
    if (env.status === 'running') {
      setSelectedEnv(env);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>FinalBoss Kind - Ephemeral K8s Environments</h1>
      </header>
      
      <div className="main-content">
        <div className="sidebar">
          <div className="controls">
            <div className="node-count-input">
              <label htmlFor="nodeCount">Number of Nodes:</label>
              <input
                id="nodeCount"
                type="number"
                min="1"
                max="10"
                value={nodeCount}
                onChange={(e) => setNodeCount(e.target.value)}
                disabled={loading}
                className="node-input"
              />
            </div>
            <button 
              onClick={createEnvironment} 
              disabled={loading}
              className="create-btn"
            >
              {loading ? 'Creating...' : `Create ${nodeCount}-Node Environment`}
            </button>
          </div>
          
          <div className="environments">
            <h3>Environments</h3>
            {environments.length === 0 ? (
              <p>No environments</p>
            ) : (
              environments.map(env => (
                <div key={env.id} className={`env-item ${env.status}`}>
                  <div className="env-info">
                    <span className="env-name">{env.name}</span>
                    <span className="env-nodes">{env.nodeCount} node{env.nodeCount > 1 ? 's' : ''}</span>
                    <span className={`env-status ${env.status}`}>{env.status}</span>
                  </div>
                  <div className="env-actions">
                    <button 
                      onClick={() => connectToEnvironment(env)}
                      disabled={env.status !== 'running'}
                      className="connect-btn"
                    >
                      Connect
                    </button>
                    <button 
                      onClick={() => deleteEnvironment(env.id)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="terminal-area">
          {selectedEnv ? (
            <Terminal environmentId={selectedEnv.id} environmentName={selectedEnv.name} />
          ) : (
            <div className="no-terminal">
              <p>Select a running environment to connect to terminal</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
