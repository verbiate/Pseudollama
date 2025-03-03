const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 11434; // Same port as Ollama

// Server state
let serverEnabled = true;
const contentFilePath = path.join(__dirname, 'data', 'content.txt');

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // For serving the web UI

// Helper function to read content from file
const readContentFile = () => {
    try {
        return fs.readFileSync(contentFilePath, 'utf8');
    } catch (error) {
        console.error('Error reading content file:', error);
        return 'Error reading content file';
    }
};

// Helper function to write content to file
const writeContentFile = (content) => {
    try {
        fs.writeFileSync(contentFilePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing to content file:', error);
        return false;
    }
};

// Endpoint to check server status
app.get('/api/server/status', (req, res) => {
    console.log('Received /api/server/status request');
    res.json({ enabled: serverEnabled });
});

// Endpoint to toggle server status
app.post('/api/server/toggle', (req, res) => {
    console.log('Received /api/server/toggle request:', JSON.stringify(req.body, null, 2));
    
    if (req.body && typeof req.body.enabled === 'boolean') {
        serverEnabled = req.body.enabled;
        console.log(`Server ${serverEnabled ? 'enabled' : 'disabled'}`);
        res.json({ success: true, enabled: serverEnabled });
    } else {
        console.error('Invalid toggle request');
        res.status(400).json({ success: false, message: 'Invalid request. Expected { enabled: boolean }' });
    }
});

// Endpoint to get the current content
app.get('/api/content', (req, res) => {
    console.log('Received /api/content request');
    
    if (!serverEnabled) {
        return res.status(503).json({ 
            success: false, 
            message: 'Server is currently disabled' 
        });
    }
    
    const content = readContentFile();
    res.json({ success: true, content });
});

// Endpoint to update the content
app.post('/api/content', (req, res) => {
    console.log('Received /api/content update request:', JSON.stringify(req.body, null, 2));
    
    if (!serverEnabled) {
        return res.status(503).json({ 
            success: false, 
            message: 'Server is currently disabled' 
        });
    }
    
    if (!req.body || typeof req.body.content !== 'string') {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid request. Expected { content: string }' 
        });
    }
    
    const success = writeContentFile(req.body.content);
    
    if (success) {
        res.json({ success: true, message: 'Content updated successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to update content' });
    }
});

// Endpoint to handle chat completions (similar to Ollama's /api/chat)
app.post('/api/chat', (req, res) => {
    console.log('Received /api/chat request:', JSON.stringify(req.body, null, 2));
    
    try {
        // Check if server is enabled
        if (!serverEnabled) {
            throw new Error('Server is currently disabled');
        }
        
        // Validate incoming request
        if (!req.body.model) {
            throw new Error('Missing required field: model');
        }
        if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
            throw new Error('Missing or invalid required field: messages');
        }

        // Read content from file instead of generating random number
        const fileContent = readContentFile();
        
        // Format response like Ollama
        const ollamaResponse = {
            model: req.body.model,
            created_at: new Date().toISOString(),
            message: {
                role: 'assistant',
                content: fileContent
            },
            done: true
        };

        console.log('Sending /api/chat response:', JSON.stringify(ollamaResponse, null, 2));
        res.json(ollamaResponse);
    } catch (error) {
        console.error('Error in /api/chat:', error.message);
        const ollamaErrorResponse = {
            model: req.body.model || 'unknown',
            created_at: new Date().toISOString(),
            message: {
                role: 'assistant',
                content: `Error: ${error.message}`
            },
            done: true
        };
        console.log('Sending /api/chat error response:', JSON.stringify(ollamaErrorResponse, null, 2));
        res.status(200).json(ollamaErrorResponse); // Ollama returns 200 even for errors
    }
});

// Endpoint to list available models (similar to Ollama's /api/tags)
app.get('/api/tags', (req, res) => {
    console.log('Received /api/tags request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(200).json({ 
            models: [],
            error: 'Server is currently disabled'
        });
    }
    
    // Create a fake list of models
    const models = {
        models: [
            {
                model: 'pseudollama:latest',
                name: 'PseudoLlama',
                modified_at: new Date().toISOString(),
                size: 0,
                digest: 'n/a'
            },
            {
                model: 'file-content:latest',
                name: 'File Content Provider',
                modified_at: new Date().toISOString(),
                size: 0,
                digest: 'n/a'
            }
        ]
    };

    console.log('Sending /api/tags response:', JSON.stringify(models, null, 2));
    res.json(models);
});

// Basic health check
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start the server
app.listen(PORT, () => {
    console.log(`PseudoLlama server running on http://localhost:${PORT}`);
});