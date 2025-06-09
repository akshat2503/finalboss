const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('node-pty');
const { spawn } = require('child_process');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active environments
const activeEnvironments = new Map();
const activeSessions = new Map();

// API Routes
app.get('/api/environments', (req, res) => {
  const envs = Array.from(activeEnvironments.keys()).map(id => ({
    id,
    name: activeEnvironments.get(id).name,
    status: activeEnvironments.get(id).status,
    nodeCount: activeEnvironments.get(id).nodeCount || 1
  }));
  res.json(envs);
});

app.post('/api/environments', async (req, res) => {
  const envId = uuidv4();
  const envName = `kind-${envId.substring(0, 8)}`;
  const { nodeCount = 1 } = req.body;
  
  try {
    activeEnvironments.set(envId, {
      name: envName,
      status: 'creating',
      containerId: null,
      nodeCount
    });

    // Generate Kind configuration for multi-node cluster
    const kindConfig = generateKindConfig(nodeCount);
    const configPath = path.join(__dirname, `kind-config-${envId}.yaml`);
    
    // Write config file
    fs.writeFileSync(configPath, kindConfig);

    // Create Kind cluster with config
    const kindProcess = spawn('kind', ['create', 'cluster', '--name', envName, '--config', configPath], {
      stdio: 'pipe'
    });

    kindProcess.on('close', async (code) => {
      // Clean up config file
      try {
        fs.unlinkSync(configPath);
      } catch (err) {
        console.warn('Could not delete config file:', err);
      }

      if (code === 0) {
        // Get container ID (control plane)
        const dockerPs = spawn('docker', ['ps', '--filter', `name=${envName}-control-plane`, '--format', '{{.ID}}'], {
          stdio: 'pipe'
        });

        let containerId = '';
        dockerPs.stdout.on('data', (data) => {
          containerId += data.toString().trim();
        });

        dockerPs.on('close', () => {
          activeEnvironments.set(envId, {
            name: envName,
            status: 'running',
            containerId: containerId,
            nodeCount
          });
        });
      } else {
        activeEnvironments.set(envId, {
          name: envName,
          status: 'error',
          containerId: null,
          nodeCount
        });
      }
    });

    res.json({ id: envId, name: envName, status: 'creating', nodeCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/environments/:id', async (req, res) => {
  const envId = req.params.id;
  const env = activeEnvironments.get(envId);

  if (!env) {
    return res.status(404).json({ error: 'Environment not found' });
  }

  try {
    // Delete Kind cluster
    const kindProcess = spawn('kind', ['delete', 'cluster', '--name', env.name], {
      stdio: 'pipe'
    });

    kindProcess.on('close', (code) => {
      activeEnvironments.delete(envId);
    });

    res.json({ message: 'Environment deletion started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate Kind configuration based on node count
const generateKindConfig = (nodeCount) => {
  const config = {
    kind: 'Cluster',
    apiVersion: 'kind.x-k8s.io/v1alpha4',
    nodes: [
      {
        role: 'control-plane'
      }
    ]
  };

  // Add worker nodes
  for (let i = 1; i < nodeCount; i++) {
    config.nodes.push({
      role: 'worker'
    });
  }

  return `kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
${config.nodes.map(node => `- role: ${node.role}`).join('\n')}
`;
};

// Socket.IO for terminal sessions
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-terminal', (data) => {
    const { environmentId } = data;
    const env = activeEnvironments.get(environmentId);

    if (!env || !env.containerId) {
      socket.emit('terminal-error', 'Environment not ready');
      return;
    }

    // Create terminal session inside Kind container
    const terminal = pty.spawn('docker', [
      'exec', '-it', env.containerId, '/bin/bash'
    ], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env
    });

    activeSessions.set(socket.id, terminal);

    terminal.on('data', (data) => {
      socket.emit('terminal-output', data);
    });

    terminal.on('exit', () => {
      activeSessions.delete(socket.id);
      socket.emit('terminal-exit');
    });

    socket.emit('terminal-ready');
  });

  socket.on('terminal-input', (data) => {
    const terminal = activeSessions.get(socket.id);
    if (terminal) {
      terminal.write(data);
    }
  });

  socket.on('disconnect', () => {
    const terminal = activeSessions.get(socket.id);
    if (terminal) {
      terminal.kill();
      activeSessions.delete(socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
