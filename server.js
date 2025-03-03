const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 11434; // Same port as Ollama

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // For serving the web UI

// Endpoint to handle chat completions (similar to Ollama's /api/chat)
app.post('/api/chat', (req, res) => {
    console.log('Received /api/chat request:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate incoming request
        if (!req.body.model) {
            throw new Error('Missing required field: model');
        }
        if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
            throw new Error('Missing or invalid required field: messages');
        }

        // Generate a random number between 1 and 500
        const randomNumber = Math.floor(Math.random() * 500) + 1;
        
        // Format response like Ollama
        const ollamaResponse = {
            model: req.body.model,
            created_at: new Date().toISOString(),
            message: {
                role: 'assistant',
                content: `Random number: ${randomNumber}`
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
                model: 'random-generator:latest',
                name: 'Random Number Generator',
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