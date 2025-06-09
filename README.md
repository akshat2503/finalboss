# FinalBoss Kind - Ephemeral K8s Environments

A web application for managing ephemeral Kubernetes environments using Kind clusters with integrated web-based terminals.

## Prerequisites

- Node.js (v16+)
- Docker
- Kind CLI tool
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
cd server && npm install
cd ../client && npm install
```

2. Install Kind:
```bash
# On macOS
brew install kind

# On Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```

## Running the Application

1. Start both server and client:
```bash
npm run dev
```

2. Open http://localhost:3000 in your browser

## Features

- Create ephemeral Kind clusters
- Web-based terminal access to cluster containers
- Real-time environment status updates
- Clean cluster deletion

## Usage

1. Click "Create Environment" to start a new Kind cluster
2. Wait for the environment to reach "running" status
3. Click "Connect" to open a terminal session
4. Use "Delete" to remove environments when done

## Architecture

- **Frontend**: React with xterm.js for terminal
- **Backend**: Node.js with Express and Socket.io
- **Terminal**: node-pty for PTY sessions
- **Container**: Docker exec into Kind control plane containers
