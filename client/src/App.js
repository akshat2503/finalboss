import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Terminal from './components/Terminal';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nodeCount, setNodeCount] = useState(1);
  const [kubernetesVersion, setKubernetesVersion] = useState('1.29.0');
  const [installIstio, setInstallIstio] = useState(false);
  const [availableVersions, setAvailableVersions] = useState([]);

  useEffect(() => {
    fetchEnvironments();
    fetchKubernetesVersions();
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

  const fetchKubernetesVersions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/kubernetes-versions`);
      setAvailableVersions(response.data);
    } catch (error) {
      console.error('Error fetching Kubernetes versions:', error);
    }
  };

  const createEnvironment = async () => {
    setIsCreating(true);
    try {
      await axios.post(`${API_BASE}/environments`, {
        nodeCount: parseInt(nodeCount),
        kubernetesVersion,
        installIstio
      });
      fetchEnvironments();
    } catch (error) {
      console.error('Error creating environment:', error);
      alert('Failed to create environment');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteEnvironment = async (id) => {
    try {
      await axios.delete(`${API_BASE}/environments/${id}`);
      fetchEnvironments();
      if (selectedEnvironment && selectedEnvironment.id === id) {
        setSelectedEnvironment(null);
      }
    } catch (error) {
      console.error('Error deleting environment:', error);
      alert('Failed to delete environment');
    }
  };

  const selectEnvironment = (env) => {
    if (env.status === 'running') {
      setSelectedEnvironment(env);
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
            <div className="form-group">
              <label htmlFor="nodeCount">Number of Nodes:</label>
              <input
                id="nodeCount"
                type="number"
                min="1"
                max="10"
                value={nodeCount}
                onChange={(e) => setNodeCount(e.target.value)}
                disabled={isCreating}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="kubernetesVersion">Kubernetes Version:</label>
              <select
                id="kubernetesVersion"
                value={kubernetesVersion}
                onChange={(e) => setKubernetesVersion(e.target.value)}
                disabled={isCreating}
                className="form-select"
              >
                {availableVersions.map((version) => (
                  <option key={version.version} value={version.version}>
                    {version.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={installIstio}
                  onChange={(e) => setInstallIstio(e.target.checked)}
                  disabled={isCreating}
                  className="checkbox-input"
                />
                <span className="checkbox-text">Install Istio Service Mesh</span>
              </label>
              <div className="checkbox-description">
                Installs Istio for advanced traffic management, security, and observability
              </div>
            </div>

            <button
              onClick={createEnvironment}
              disabled={isCreating}
              className="create-btn"
            >
              {isCreating ? 'Creating...' : 
                `Create ${nodeCount}-Node Environment${installIstio ? ' with Istio' : ''}`
              }
            </button>
          </div>

          <div className="environments">
            <h3>Environments</h3>
            {environments.length === 0 ? (
              <p>No environments</p>
            ) : (
              environments.map((env) => (
                <div key={env.id} className={`env-item ${env.status}`}>
                  <div className="env-info">
                    <span className="env-name">{env.name}</span>
                    <div className="env-details">
                      <span className="env-nodes">
                        {env.nodeCount} node{env.nodeCount > 1 ? 's' : ''}
                      </span>
                      <span className="env-k8s-version">
                        Kubernetes {env.kubernetesVersion}
                      </span>
                      {env.installIstio && (
                        <span className="env-istio">+ Istio</span>
                      )}
                    </div>
                    <span className={`env-status ${env.status}`}>
                      {env.status}
                    </span>
                  </div>
                  <div className="env-actions">
                    <button
                      onClick={() => selectEnvironment(env)}
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
          {selectedEnvironment ? (
            <Terminal 
              environmentId={selectedEnvironment.id}
              environmentName={selectedEnvironment.name}
            />
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
