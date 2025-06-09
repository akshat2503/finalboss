const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('node-pty');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../client/build')));

// Store current environment (only one allowed)
let currentEnvironment = null;

// Get all environments
app.get('/api/environments', (req, res) => {
  const environments = currentEnvironment ? [currentEnvironment] : [];
  res.json(environments);
});

// Create new environment
app.post('/api/environments', async (req, res) => {
  const { nodeCount } = req.body;
  
  // Check if environment already exists
  if (currentEnvironment) {
    return res.status(400).json({ 
      error: 'An environment already exists. Please delete it before creating a new one.' 
    });
  }

  const envId = `env-${Date.now()}`;
  const envName = `kind-cluster-${nodeCount}node`;
  
  currentEnvironment = {
    id: envId,
    name: envName,
    nodeCount: parseInt(nodeCount),
    status: 'creating',
    createdAt: new Date().toISOString()
  };

  res.json(currentEnvironment);

  try {
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
          currentEnvironment = {
            id: envId,
            name: envName,
            status: 'running',
            containerId: containerId,
            nodeCount
          };
        });
      } else {
        currentEnvironment = {
          id: envId,
          name: envName,
          status: 'error',
          containerId: null,
          nodeCount
        };
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete environment
app.delete('/api/environments/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!currentEnvironment || currentEnvironment.id !== id) {
    return res.status(404).json({ error: 'Environment not found' });
  }

  try {
    // Delete the kind cluster
    const deleteProcess = spawn('kind', ['delete', 'cluster', '--name', currentEnvironment.name]);
    
    deleteProcess.on('close', (code) => {
      if (code === 0) {
        currentEnvironment = null; // Clear the current environment
        res.json({ message: 'Environment deleted successfully' });
      } else {
        res.status(500).json({ error: 'Failed to delete environment' });
      }
    });

    deleteProcess.on('error', (err) => {
      console.error('Delete process error:', err);
      res.status(500).json({ error: 'Failed to delete environment' });
    });
  } catch (error) {
    console.error('Error deleting environment:', error);
    res.status(500).json({ error: 'Failed to delete environment' });
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
    const env = currentEnvironment;

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
