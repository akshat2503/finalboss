import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import io from 'socket.io-client';
import 'xterm/css/xterm.css';

const Terminal = ({ environmentId, environmentName }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const socketRef = useRef(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  useEffect(() => {
    // Calculate terminal size based on container
    const calculateTerminalSize = () => {
      if (!terminalRef.current) return { cols: 80, rows: 24 };
      
      const rect = terminalRef.current.getBoundingClientRect();
      const charWidth = 9; // Approximate character width
      const charHeight = 18; // Approximate character height
      
      const cols = Math.floor((rect.width - 20) / charWidth) || 80;
      const rows = Math.floor((rect.height - 20) / charHeight) || 24;
      
      return { cols: Math.max(cols, 20), rows: Math.max(rows, 5) };
    };

    // Initialize xterm with calculated size
    const { cols, rows } = calculateTerminalSize();
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff'
      },
      cols,
      rows
    });
    
    xtermRef.current = xterm;

    // Mount terminal
    xterm.open(terminalRef.current);
    setIsTerminalReady(true);

    // Initialize socket connection
    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('start-terminal', { environmentId });
    });

    socket.on('terminal-ready', () => {
      xterm.writeln(`Connected to ${environmentName}`);
      xterm.writeln('Terminal ready...\r\n');
    });

    socket.on('terminal-output', (data) => {
      xterm.write(data);
    });

    socket.on('terminal-error', (error) => {
      xterm.writeln(`\r\nError: ${error}\r\n`);
    });

    socket.on('terminal-exit', () => {
      xterm.writeln('\r\nTerminal session ended\r\n');
    });

    // Handle terminal input
    xterm.onData((data) => {
      socket.emit('terminal-input', data);
    });

    // Handle window resize by recreating terminal if needed
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newSize = calculateTerminalSize();
        if (xtermRef.current && (
          xtermRef.current.cols !== newSize.cols || 
          xtermRef.current.rows !== newSize.rows
        )) {
          try {
            xtermRef.current.resize(newSize.cols, newSize.rows);
          } catch (error) {
            console.warn('Terminal resize failed:', error);
          }
        }
      }, 300);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
    };
  }, [environmentId, environmentName]);

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <span>Terminal - {environmentName}</span>
      </div>
      <div 
        ref={terminalRef} 
        className="terminal"
        style={{ 
          height: '500px', 
          width: '100%',
          minHeight: '500px',
          minWidth: '300px'
        }}
      />
      {!isTerminalReady && (
        <div className="terminal-loading">
          <p>Initializing terminal...</p>
        </div>
      )}
    </div>
  );
};

export default Terminal;
