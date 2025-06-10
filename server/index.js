const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const pty = require('node-pty');

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

// Store environments and active terminal sessions
const environments = new Map();
const activeSessions = new Map();

// Available Kubernetes versions
const KUBERNETES_VERSIONS = [
  { version: '1.29.0', label: 'v1.29.0 (Latest)' },
  { version: '1.28.0', label: 'v1.28.0' },
  { version: '1.27.0', label: 'v1.27.0' },
  { version: '1.26.0', label: 'v1.26.0' },
  { version: '1.25.0', label: 'v1.25.0' }
];

// Get available Kubernetes versions
app.get('/api/kubernetes-versions', (req, res) => {
  res.json(KUBERNETES_VERSIONS);
});

// Get all environments
app.get('/api/environments', (req, res) => {
  const envList = Array.from(environments.values());
  res.json(envList);
});

// Create environment endpoint with Kubernetes version and Istio support
app.post('/api/environments', async (req, res) => {
  const { nodeCount = 1, kubernetesVersion = '1.29.0', installIstio = false } = req.body;
  
  if (nodeCount < 1 || nodeCount > 10) {
    return res.status(400).json({ error: 'Node count must be between 1 and 10' });
  }

  // Validate Kubernetes version
  const validVersion = KUBERNETES_VERSIONS.find(v => v.version === kubernetesVersion);
  if (!validVersion) {
    return res.status(400).json({ error: 'Invalid Kubernetes version' });
  }
  
  const environment = {
    id: uuidv4(),
    name: `kind-cluster-${Date.now()}`,
    nodeCount: parseInt(nodeCount),
    kubernetesVersion,
    installIstio,
    status: 'creating',
    createdAt: new Date().toISOString()
  };

  environments.set(environment.id, environment);

  // Create Kind cluster asynchronously
  createKindCluster(environment);

  res.status(201).json(environment);
});

// Delete environment
app.delete('/api/environments/:id', async (req, res) => {
  const { id } = req.params;
  const environment = environments.get(id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }

  try {
    // Delete Kind cluster
    const deleteProcess = spawn('kind', ['delete', 'cluster', '--name', environment.name]);
    
    deleteProcess.on('close', (code) => {
      console.log(`Kind cluster ${environment.name} deleted with code ${code}`);
    });

    environments.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting environment:', error);
    res.status(500).json({ error: 'Failed to delete environment' });
  }
});

async function createKindCluster(environment) {
  try {
    // Generate Kind config
    const configPath = await generateKindConfig(environment);
    
    // Create cluster with specific Kubernetes version
    const createArgs = [
      'create', 'cluster',
      '--name', environment.name,
      '--config', configPath,
      '--image', `kindest/node:v${environment.kubernetesVersion}`
    ];

    console.log(`Creating Kind cluster ${environment.name} with Kubernetes ${environment.kubernetesVersion}...`);
    
    const createProcess = spawn('kind', createArgs);
    
    createProcess.stdout.on('data', (data) => {
      console.log(`Kind stdout: ${data}`);
    });

    createProcess.stderr.on('data', (data) => {
      console.error(`Kind stderr: ${data}`);
    });

    createProcess.on('close', async (code) => {
      if (code === 0) {
        console.log(`Kind cluster ${environment.name} created successfully`);
        
        // Install Istio if requested
        if (environment.installIstio) {
          await installIstio(environment);
        } else {
          environment.status = 'running';
          environments.set(environment.id, environment);
        }
      } else {
        console.error(`Kind cluster creation failed with code ${code}`);
        environment.status = 'error';
        environments.set(environment.id, environment);
      }
      
      // Clean up config file
      try {
        await fs.unlink(configPath);
      } catch (err) {
        console.error('Error cleaning up config file:', err);
      }
    });

  } catch (error) {
    console.error('Error creating Kind cluster:', error);
    environment.status = 'error';
    environments.set(environment.id, environment);
  }
}

async function generateKindConfig(environment) {
  const config = {
    kind: 'Cluster',
    apiVersion: 'kind.x-k8s.io/v1alpha4',
    nodes: []
  };

  // Add control plane node
  config.nodes.push({
    role: 'control-plane',
    extraPortMappings: [
      {
        containerPort: 80,
        hostPort: 80,
        protocol: 'TCP'
      },
      {
        containerPort: 443,
        hostPort: 443,
        protocol: 'TCP'
      }
    ]
  });

  // Add worker nodes
  for (let i = 1; i < environment.nodeCount; i++) {
    config.nodes.push({
      role: 'worker'
    });
  }

  const configPath = path.join(__dirname, `kind-config-${environment.id}.yaml`);
  const yamlContent = `# Kind cluster configuration
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
${config.nodes.map(node => `- role: ${node.role}${node.extraPortMappings ? `
  extraPortMappings:
${node.extraPortMappings.map(pm => `  - containerPort: ${pm.containerPort}
    hostPort: ${pm.hostPort}
    protocol: ${pm.protocol}`).join('\n')}` : ''}`).join('\n')}
`;

  await fs.writeFile(configPath, yamlContent);
  return configPath;
}

async function installIstio(environment) {
  try {
    console.log(`Installing Istio on cluster ${environment.name}...`);
    
    // Set kubectl context
    const contextName = `kind-${environment.name}`;
    
    // Download and install Istio
    const istioCommands = [
      // Download Istio
      'curl -L https://istio.io/downloadIstio | sh -',
      // Add istioctl to PATH and install
      `kubectl --context ${contextName} create namespace istio-system`,
      `cd istio-* && ./bin/istioctl install --set values.defaultRevision=default -y --context ${contextName}`,
      // Enable Istio injection for default namespace
      `kubectl --context ${contextName} label namespace default istio-injection=enabled`
    ];

    for (const command of istioCommands) {
      await executeCommand(command);
    }

    console.log(`Istio installed successfully on cluster ${environment.name}`);
    environment.status = 'running';
    environments.set(environment.id, environment);
    
  } catch (error) {
    console.error('Error installing Istio:', error);
    // Still mark as running even if Istio fails
    environment.status = 'running';
    environments.set(environment.id, environment);
  }
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command failed: ${command}`, error);
        reject(error);
        return;
      }
      console.log(`Command output: ${stdout}`);
      if (stderr) console.error(`Command stderr: ${stderr}`);
      resolve(stdout);
    });
  });
}

// Socket.IO for terminal sessions
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-terminal', ({ environmentId }) => {
    const environment = environments.get(environmentId);
    if (!environment || environment.status !== 'running') {
      socket.emit('terminal-error', 'Environment not found or not running');
      return;
    }

    try {
      // Create terminal session with kubectl context
      const contextName = `kind-${environment.name}`;
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      
      const terminal = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd: process.env.HOME,
        env: {
          ...process.env,
          KUBECONFIG: `${process.env.HOME}/.kube/config`,
          KUBECTL_CONTEXT: contextName
        }
      });

      // Store terminal session
      activeSessions.set(socket.id, { terminal, environmentId });

      // Set kubectl context on terminal start
      terminal.write(`kubectl config use-context ${contextName}\r`);
      
      terminal.onData((data) => {
        socket.emit('terminal-output', data);
      });

      terminal.onExit((code) => {
        console.log('Terminal exited with code:', code);
        socket.emit('terminal-exit');
        activeSessions.delete(socket.id);
      });

      socket.emit('terminal-ready');

    } catch (error) {
      console.error('Error starting terminal:', error);
      socket.emit('terminal-error', 'Failed to start terminal');
    }
  });

  socket.on('terminal-input', (data) => {
    const session = activeSessions.get(socket.id);
    if (session && session.terminal) {
      session.terminal.write(data);
    }
  });

  socket.on('terminal-resize', ({ cols, rows }) => {
    const session = activeSessions.get(socket.id);
    if (session && session.terminal) {
      session.terminal.resize(cols, rows);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const session = activeSessions.get(socket.id);
    if (session && session.terminal) {
      session.terminal.kill();
      activeSessions.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
