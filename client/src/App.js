import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Terminal from './components/Terminal';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [currentEnvironment, setCurrentEnvironment] = useState(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nodeCount, setNodeCount] = useState(1);

  useEffect(() => {
    fetchEnvironments();
  }, []);

  const fetchEnvironments = async () => {
    try {
      const response = await axios.get(`${API_BASE}/environments`);
      const environments = response.data;
      
      if (environments.length > 0) {
        setCurrentEnvironment(environments[0]);
        // If we had a selected environment and it still exists, keep it selected
        if (selectedEnvironment && environments.find(env => env.id === selectedEnvironment.id)) {
          const updatedEnv = environments.find(env => env.id === selectedEnvironment.id);
          setSelectedEnvironment(updatedEnv);
        }
      } else {
        setCurrentEnvironment(null);
        setSelectedEnvironment(null);
      }
    } catch (error) {
      console.error('Error fetching environments:', error);
    }
  };

  const createEnvironment = async () => {
    if (currentEnvironment) {
      alert('Please delete the existing environment before creating a new one.');
      return;
    }

    setIsCreating(true);
    try {
      const response = await axios.post(`${API_BASE}/environments`, {
        nodeCount: parseInt(nodeCount)
      });
      
      setCurrentEnvironment(response.data);
      
      // Poll for status updates
      const pollInterval = setInterval(async () => {
        try {
          await fetchEnvironments();
          const updatedEnvs = await axios.get(`${API_BASE}/environments`);
          if (updatedEnvs.data.length > 0 && updatedEnvs.data[0].status === 'running') {
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error('Error polling environments:', error);
          clearInterval(pollInterval);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error creating environment:', error);
      alert(error.response?.data?.error || 'Failed to create environment');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteEnvironment = async (envId) => {
    try {
      await axios.delete(`${API_BASE}/environments/${envId}`);
      setCurrentEnvironment(null);
      setSelectedEnvironment(null);
      await fetchEnvironments();
    } catch (error) {
      console.error('Error deleting environment:', error);
      alert('Failed to delete environment');
    }
  };

  const connectToEnvironment = (env) => {
    setSelectedEnvironment(env);
  };

  const hasEnvironment = currentEnvironment !== null;
  const canCreateEnvironment = !hasEnvironment && !isCreating;

  return (
    <div className="App">
      <header className="App-header">
        <h1>FinalBoss Kind - Ephemeral K8s Environment</h1>
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
                disabled={!canCreateEnvironment}
                className="node-input"
              />
            </div>
            
            <button
              onClick={createEnvironment}
              disabled={!canCreateEnvironment}
              className="create-btn"
            >
              {isCreating 
                ? 'Creating...' 
                : hasEnvironment 
                ? 'Delete existing environment first'
                : `Create ${nodeCount}-Node Environment`
              }
            </button>

            {hasEnvironment && (
              <div className="environment-info">
                <p className="current-env-notice">
                  Only one environment can exist at a time.
                </p>
              </div>
            )}
          </div>

          <div className="environments">
            <h3>Current Environment</h3>
            {!currentEnvironment ? (
              <p>No environment exists</p>
            ) : (
              <div className={`env-item ${currentEnvironment.status}`}>
                <div className="env-info">
                  <span className="env-name">{currentEnvironment.name}</span>
                  <span className="env-nodes">
                    {currentEnvironment.nodeCount} node{currentEnvironment.nodeCount > 1 ? 's' : ''}
                  </span>
                  <span className={`env-status ${currentEnvironment.status}`}>
                    {currentEnvironment.status}
                  </span>
                </div>
                <div className="env-actions">
                  <button
                    onClick={() => connectToEnvironment(currentEnvironment)}
                    disabled={currentEnvironment.status !== 'running'}
                    className="connect-btn"
                  >
                    Connect
                  </button>
                  <button
                    onClick={() => deleteEnvironment(currentEnvironment.id)}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="terminal-area">
          {selectedEnvironment ? (
            <Terminal 
              environmentId={selectedEnvironment.id}
              environmentName={selectedEnvironment.name}
            />
          ) : (
            <div className="no-terminal">
              <p>
                {currentEnvironment 
                  ? currentEnvironment.status === 'running'
                    ? 'Click "Connect" to access the terminal'
                    : 'Waiting for environment to be ready...'
                  : 'Create an environment to get started'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
