// Log the current working directory and the location of the .env file
console.log(`Current working directory: ${process.cwd()}`);
const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
  console.error('Error loading .env file:', dotenvResult.error);
} else {
  console.log('Successfully loaded .env file');
  // Mask sensitive information in logs
  const maskedEnv = { ...dotenvResult.parsed };
  if (maskedEnv.OPENROUTER_API_KEY) {
    maskedEnv.OPENROUTER_API_KEY = `${maskedEnv.OPENROUTER_API_KEY.slice(0, 5)}...${maskedEnv.OPENROUTER_API_KEY.slice(-4)}`;
  }
  console.log('Parsed .env file:', maskedEnv);
}
console.log('Environment variable OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? `${process.env.OPENROUTER_API_KEY.slice(0, 5)}...${process.env.OPENROUTER_API_KEY.slice(-4)}` : 'not set');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = 12345; // IMPORTANT: Fixed port for testing - tools connecting to this server must specify this port

// Server state
let serverEnabled = true;
const contentFilePath = path.join(__dirname, 'data', 'content.txt');
const configFilePath = path.join(__dirname, 'data', 'config.json');

// Model caching
const modelCache = {
    openrouter: {
        models: null,
        lastFetched: null,
        cacheDuration: 3600000 // 1 hour in milliseconds
    },
    lmstudio: {
        models: null,
        lastFetched: null,
        cacheDuration: 3600000 // 1 hour in milliseconds
    }
};

// Default configuration
let config = {
  selectedModelType: 'lmstudio', // Default model type: openrouter or lmstudio
  openrouter: {
    apiKey: '', // Will be set from .env file
    model: 'google/gemini-2.0-flash-001'
  },
  lmstudio: {
    url: 'http://localhost:1234/v1',
    model: 'unsloth-phi-4'
  }
};

// Load configuration from file
const loadConfig = () => {
  try {
    if (fs.existsSync(configFilePath)) {
      const configData = fs.readFileSync(configFilePath, 'utf8');
      config = JSON.parse(configData);
      
      // Handle legacy format
      if (config.openrouterApiKey) {
        // Convert to new format if needed
        if (!config.openrouter) {
          config.openrouter = {
            apiKey: config.openrouterApiKey,
            model: 'google/gemini-2.0-flash-001'
          };
          
          if (!config.selectedModelType) {
            config.selectedModelType = config.selectedModel === 'openrouter' ? 'openrouter' : 'lmstudio';
          }
          
          // Initialize lmstudio if it doesn't exist
          if (!config.lmstudio) {
            config.lmstudio = {
              url: 'http://localhost:1234/v1',
              model: 'unsloth-phi-4'
            };
          }
        }
      }
      
      // Always use .env file as the source of truth for OpenRouter API key
      if (process.env.OPENROUTER_API_KEY) {
        // If .env has a key, use it (overriding the config file)
        if (!config.openrouter) {
          config.openrouter = {
            model: 'google/gemini-2.0-flash-001'
          };
        }
        console.log(`Using OpenRouter API key from .env file: ${process.env.OPENROUTER_API_KEY.slice(0, 5)}...${process.env.OPENROUTER_API_KEY.slice(-4)}`);
        // Don't store the API key in the config object, just reference it from process.env
        config.openrouter.apiKey = null; // Set to null to indicate it's using the env variable
      } else {
        console.log('No OpenRouter API key found in .env file');
      }
      
      return true;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return false;
};

// Save configuration to file
const saveConfig = () => {
  try {
    // Ensure the data directory exists
    if (!fs.existsSync(path.dirname(configFilePath))) {
      fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
    }
    
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
};

// Update the .env file with the new OpenRouter API key
const updateEnvFile = (apiKey) => {
  try {
    // Use absolute path to the .env file in the project root
    const envPath = path.resolve(__dirname, '.env');
    console.log(`[ENV UPDATE] Updating .env file at: ${envPath}`);
    console.log(`[ENV UPDATE] File exists: ${fs.existsSync(envPath)}`);
    console.log(`[ENV UPDATE] File stats: ${fs.existsSync(envPath) ? JSON.stringify(fs.statSync(envPath)) : 'N/A'}`);
    
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      console.log(`[ENV UPDATE] Existing .env file content (first 50 chars): ${envContent.substring(0, 50)}...`);
    } else {
      console.log('[ENV UPDATE] No existing .env file found, will create a new one');
    }
    
    // Check if OPENROUTER_API_KEY already exists in the file
    const keyRegex = /^OPENROUTER_API_KEY=.*/m;
    const keyExists = keyRegex.test(envContent);
    console.log(`[ENV UPDATE] OPENROUTER_API_KEY exists in file: ${keyExists}`);
    
    if (keyExists) {
      // Replace existing key
      console.log('[ENV UPDATE] Replacing existing OPENROUTER_API_KEY in .env file');
      const oldContent = envContent;
      envContent = envContent.replace(keyRegex, `OPENROUTER_API_KEY=${apiKey}`);
      console.log(`[ENV UPDATE] Content changed: ${oldContent !== envContent}`);
    } else {
      // Add new key
      console.log('[ENV UPDATE] Adding new OPENROUTER_API_KEY to .env file');
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `OPENROUTER_API_KEY=${apiKey}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('[ENV UPDATE] Successfully wrote to .env file');
    
    // Verify the file was updated correctly
    const newContent = fs.readFileSync(envPath, 'utf8');
    console.log(`[ENV UPDATE] New .env file content (first 50 chars): ${newContent.substring(0, 50)}...`);
    console.log(`[ENV UPDATE] File contains new API key: ${newContent.includes(apiKey)}`);
    
    // Important: Reload environment variables from the updated .env file
    console.log('[ENV UPDATE] Reloading environment variables from .env file');
    require('dotenv').config();
    console.log(`[ENV UPDATE] Environment variable after reload: ${process.env.OPENROUTER_API_KEY ? `${process.env.OPENROUTER_API_KEY.slice(0, 5)}...${process.env.OPENROUTER_API_KEY.slice(-4)}` : 'not set'}`);
    
    return true;
  } catch (error) {
    console.error('[ENV UPDATE] Error updating .env file:', error);
    console.error(error.stack);
    return false;
  }
};

// Load config on startup
loadConfig();

// Import the logger
const logger = require('./logger');

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase JSON body size limit
app.use(cors());

// Add the full model communication logging middleware
app.use(logger.createLoggingMiddleware());

// Debug logging middleware - add this before other routes
app.use((req, res, next) => {
    console.log(`\n[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Only log headers for non-model endpoints to reduce log size
    if (!req.url.includes('/models') && !req.url.includes('/v1/models')) {
        // Log only essential headers, not all of them
        const essentialHeaders = {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'referer': req.headers['referer']
        };
        console.log(`[ESSENTIAL HEADERS] ${JSON.stringify(essentialHeaders)}`);
    }
    
    if (req.method !== 'GET') {
        // For non-GET requests, log minimal body information
        if (req.body) {
            const logInfo = {};
            
            // For chat/completion requests, just log message count and model
            if (req.body.messages) {
                logInfo.messageCount = req.body.messages.length;
                logInfo.model = req.body.model;
                logInfo.stream = req.body.stream;
            } else if (req.body.prompt) {
                logInfo.promptLength = req.body.prompt.length;
                logInfo.model = req.body.model;
            } else {
                // For other requests, create a minimal summary
                Object.keys(req.body).forEach(key => {
                    if (typeof req.body[key] === 'string') {
                        logInfo[key] = req.body[key].length > 50 ?
                            `[${req.body[key].length} chars]` : req.body[key];
                    } else if (Array.isArray(req.body[key])) {
                        logInfo[key] = `[Array with ${req.body[key].length} items]`;
                    } else if (typeof req.body[key] === 'object' && req.body[key] !== null) {
                        logInfo[key] = '[Object]';
                    } else {
                        logInfo[key] = req.body[key];
                    }
                });
            }
            
            console.log(`[BODY SUMMARY] ${JSON.stringify(logInfo)}`);
        }
    }
    
    // Store original methods to track response
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    // Override send
    res.send = function(body) {
        console.log(`[RESPONSE] Status: ${res.statusCode} for ${req.method} ${req.url}`);
        return originalSend.apply(this, arguments);
    };
    
    // Override json
    res.json = function(body) {
        console.log(`[RESPONSE] Status: ${res.statusCode} for ${req.method} ${req.url}`);
        return originalJson.apply(this, arguments);
    };
    
    // Override end
    res.end = function(chunk, encoding) {
        console.log(`[RESPONSE] Status: ${res.statusCode} for ${req.method} ${req.url}`);
        return originalEnd.apply(this, arguments);
    };
    
    next();
});

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

// Endpoint to fetch model communication logs
app.get('/api/logs', (req, res) => {
    console.log('Received /api/logs request');
    
    if (!serverEnabled) {
        return res.status(503).json({
            success: false,
            message: 'Server is currently disabled'
        });
    }
    
    try {
        const logFilePath = path.join(__dirname, 'logs', 'model_communications.log');
        
        if (!fs.existsSync(logFilePath)) {
            return res.json({
                success: true,
                logs: 'No logs available yet. Make some model requests first.'
            });
        }
        
        // Read the log file
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        
        // Get query parameters for filtering
        const { limit = 10, type } = req.query;
        
        // Parse the log content into entries
        const logEntries = [];
        let currentEntry = '';
        let inEntry = false;
        let entryType = '';
        
        logContent.split('\n').forEach(line => {
            if (line.startsWith('=== REQUEST [') ||
                line.startsWith('=== RESPONSE [') ||
                line.startsWith('=== STREAM START [')) {
                
                if (inEntry) {
                    logEntries.push({ type: entryType, content: currentEntry });
                }
                
                currentEntry = line;
                inEntry = true;
                
                if (line.startsWith('=== REQUEST [')) {
                    entryType = 'request';
                } else if (line.startsWith('=== RESPONSE [')) {
                    entryType = 'response';
                } else if (line.startsWith('=== STREAM START [')) {
                    entryType = 'stream';
                }
            } else if (line.startsWith('=== END REQUEST') ||
                      line.startsWith('=== END RESPONSE') ||
                      line.startsWith('=== STREAM END [')) {
                
                currentEntry += '\n' + line;
                
                if (inEntry) {
                    logEntries.push({ type: entryType, content: currentEntry });
                }
                
                currentEntry = '';
                inEntry = false;
            } else if (inEntry) {
                currentEntry += '\n' + line;
            }
        });
        
        // Add the last entry if there is one
        if (inEntry && currentEntry) {
            logEntries.push({ type: entryType, content: currentEntry });
        }
        
        // Apply type filter if specified
        let filteredEntries = logEntries;
        if (type) {
            filteredEntries = logEntries.filter(entry => entry.type === type);
        }
        
        // Apply limit
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
            filteredEntries = filteredEntries.slice(-limitNum);
        }
        
        res.json({
            success: true,
            logs: filteredEntries
        });
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({
            success: false,
            message: `Error reading logs: ${error.message}`
        });
    }
});

// Endpoint to fetch available models from OpenRouter
app.get('/api/openrouter/models', async (req, res) => {
    console.log('Received /api/openrouter/models request');
    
    if (!serverEnabled) {
        return res.status(503).json({
            success: false,
            message: 'Server is currently disabled'
        });
    }
    
    // Check if OpenRouter API key is configured in environment variable
    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(400).json({
            success: false,
            message: 'OpenRouter API key is not configured in .env file'
        });
    }
    
    try {
        // Check if we have a valid cache
        const now = Date.now();
        const cache = modelCache.openrouter;
        
        if (cache.models && cache.lastFetched && (now - cache.lastFetched < cache.cacheDuration)) {
            console.log(`[OPENROUTER MODELS] Using cached models (${cache.models.length} models, cached ${Math.round((now - cache.lastFetched) / 1000 / 60)} minutes ago)`);
            return res.json({
                success: true,
                models: cache.models,
                cached: true
            });
        }
        
        // Fetch models from OpenRouter API using curl command
        console.log('Fetching OpenRouter models using curl command');
        
        // Use child_process to execute curl command
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        let response;
        try {
            const apiKey = process.env.OPENROUTER_API_KEY;
            const curlCommand = `curl -s -X GET https://openrouter.ai/api/v1/models -H "Authorization: Bearer ${apiKey}"`;
            console.log('Executing curl command');
            
            const { stdout, stderr } = await execPromise(curlCommand);
            
            if (stderr) {
                console.error('Curl command error:', stderr);
                throw new Error(stderr);
            }
            
            console.log('Curl command successful');
            response = { data: JSON.parse(stdout) };
        } catch (error) {
            console.error('Error fetching OpenRouter models:', error.message);
            throw new Error(`Error fetching models: ${error.message}`);
        }
        
        // Extract and format the models
        const models = response.data.data.map(model => ({
            id: model.id,
            name: model.name || model.id,
            description: model.description || '',
            context_length: model.context_length || 4096,
            pricing: model.pricing || {}
        }));
        
        // Update the cache
        modelCache.openrouter.models = models;
        modelCache.openrouter.lastFetched = now;
        
        // Log the number of models instead of the full response
        console.log(`[OPENROUTER MODELS] Fetched ${models.length} models from OpenRouter`);
        
        res.json({
            success: true,
            models: models,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching OpenRouter models:', error.message);
        if (error.response) {
            console.error('OpenRouter API error:', error.response.data);
        }
        
        // If we have a cache, use it even if it's expired
        if (modelCache.openrouter.models) {
            console.log(`[OPENROUTER MODELS] Error fetching models, using cached models (${modelCache.openrouter.models.length} models)`);
            return res.json({
                success: true,
                models: modelCache.openrouter.models,
                cached: true,
                error: `Error fetching fresh models: ${error.message}`
            });
        }
        
        res.status(500).json({
            success: false,
            message: `Error fetching models: ${error.message}`
        });
    }
});

// Endpoint to fetch available models from LMStudio
app.get('/api/lmstudio/models', async (req, res) => {
    console.log('Received /api/lmstudio/models request');
    
    if (!serverEnabled) {
        return res.status(503).json({
            success: false,
            message: 'Server is currently disabled'
        });
    }
    
    // Check if LMStudio URL is configured
    if (!config.lmstudio?.url) {
        return res.status(400).json({
            success: false,
            message: 'LMStudio URL is not configured'
        });
    }
    
    try {
        // Check if we have a valid cache
        const now = Date.now();
        const cache = modelCache.lmstudio;
        
        if (cache.models && cache.lastFetched && (now - cache.lastFetched < cache.cacheDuration)) {
            console.log(`[LMSTUDIO MODELS] Using cached models (${cache.models.length} models, cached ${Math.round((now - cache.lastFetched) / 1000 / 60)} minutes ago)`);
            return res.json({
                success: true,
                models: cache.models,
                cached: true
            });
        }
        
        // Prepare headers for the request
        const headers = {};
        if (config.lmstudio.apiKey) {
            headers['Authorization'] = `Bearer ${config.lmstudio.apiKey}`;
        }
        
        // Fetch models from LMStudio API
        // LMStudio follows OpenAI API format, so we use the /models endpoint
        const lmStudioUrl = config.lmstudio.url.endsWith('/')
            ? config.lmstudio.url.slice(0, -1)
            : config.lmstudio.url;
            
        const response = await axios.get(`${lmStudioUrl}/models`, {
            headers,
            timeout: config.lmstudio.timeout || 30000
        });
        
        // Extract and format the models
        const models = response.data.data.map(model => ({
            id: model.id,
            name: model.id, // LMStudio typically doesn't provide a separate name
            description: model.owned_by ? `Provider: ${model.owned_by}` : '',
            created: model.created
        }));
        
        // Update the cache
        modelCache.lmstudio.models = models;
        modelCache.lmstudio.lastFetched = now;
        
        // Log the number of models instead of the full response
        console.log(`[LMSTUDIO MODELS] Fetched ${models.length} models from LMStudio`);
        
        res.json({
            success: true,
            models: models,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching LMStudio models:', error.message);
        if (error.response) {
            console.error('LMStudio API error:', error.response.data);
        }
        
        // If we have a cache, use it even if it's expired
        if (modelCache.lmstudio.models) {
            console.log(`[LMSTUDIO MODELS] Error fetching models, using cached models (${modelCache.lmstudio.models.length} models)`);
            return res.json({
                success: true,
                models: modelCache.lmstudio.models,
                cached: true,
                error: `Error fetching fresh models: ${error.message}`
            });
        }
        
        // Determine appropriate error message
        let errorMessage = 'Error connecting to LMStudio';
        if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. Make sure LMStudio is running and the URL is correct.';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
            errorMessage = 'Connection timed out. Check if LMStudio is responding.';
        } else if (error.response) {
            errorMessage = `LMStudio API error: ${error.response.status} ${error.response.statusText}`;
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Endpoint to get configuration
app.get('/api/config', (req, res) => {
    console.log('Received /api/config request');
    
    if (!serverEnabled) {
        return res.status(503).json({
            success: false,
            message: 'Server is currently disabled'
        });
    }
    
    // Create a copy of the config with the actual API key from environment variable
    const safeConfig = {
        selectedModelType: config.selectedModelType,
        openrouter: {
            ...config.openrouter,
            // Send the actual API key from environment variable, not from config
            apiKey: process.env.OPENROUTER_API_KEY || '',
            hasApiKey: !!process.env.OPENROUTER_API_KEY
        },
        lmstudio: { ...config.lmstudio }
    };
    
    res.json({
        success: true,
        config: safeConfig
    });
});

// Endpoint to update configuration
app.post('/api/config', (req, res) => {
    console.log('Received /api/config update request');
    console.log('[CONFIG UPDATE] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[CONFIG UPDATE] Current environment variable OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? `${process.env.OPENROUTER_API_KEY.slice(0, 5)}...${process.env.OPENROUTER_API_KEY.slice(-4)}` : 'not set');
    console.log('[CONFIG UPDATE] Current config.openrouter.apiKey:', config.openrouter?.apiKey ? `${config.openrouter.apiKey.slice(0, 5)}...${config.openrouter.apiKey.slice(-4)}` : 'not set');
    
    if (!serverEnabled) {
        return res.status(503).json({
            success: false,
            message: 'Server is currently disabled'
        });
    }
    
    // Validate request
    if (!req.body) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request. Expected configuration object.'
        });
    }
    
    // Update configuration
    let configUpdated = false;
    
    // Update selected model type if provided
    if (req.body.selectedModelType !== undefined) {
        config.selectedModelType = req.body.selectedModelType;
        configUpdated = true;
    }
    
    // Update OpenRouter settings if provided
    if (req.body.openrouter) {
        if (!config.openrouter) {
            config.openrouter = {};
        }
        
        if (req.body.openrouter.apiKey !== undefined) {
            let newApiKey = req.body.openrouter.apiKey;
            
            // Check if the API key starts with the masked prefix (••••)
            if (newApiKey.startsWith('••••')) {
                console.log('Received API key with masked prefix, removing prefix');
                // If it's just the masked version of the existing key, don't update
                if (newApiKey === '••••' + (process.env.OPENROUTER_API_KEY?.slice(-4) || '')) {
                    console.log('API key unchanged (masked version of existing key)');
                } else {
                    // Extract the actual new key (remove the masked prefix)
                    const maskedPrefixRegex = /^••••[^s][^k]-or-/;
                    if (maskedPrefixRegex.test(newApiKey)) {
                        // If the key has a masked prefix followed by a valid OpenRouter key format
                        // Extract just the valid part starting with sk-or-
                        const validKeyMatch = newApiKey.match(/sk-or-[a-zA-Z0-9-]+/);
                        if (validKeyMatch) {
                            newApiKey = validKeyMatch[0];
                            console.log(`Extracted valid API key from masked input: ${newApiKey.slice(0, 5)}...${newApiKey.slice(-4)}`);
                        }
                    }
                    
                    console.log(`Updating OpenRouter API key to: ${newApiKey.slice(0, 5)}...${newApiKey.slice(-4)}`);
                    // Only update the .env file, not the config object
                    process.env.OPENROUTER_API_KEY = newApiKey;
                    
                    // Update the .env file with the new API key
                    const envUpdateSuccess = updateEnvFile(newApiKey);
                    console.log(`Updated .env file: ${envUpdateSuccess ? 'Success' : 'Failed'}`);
                    
                    configUpdated = true;
                }
            } else {
                // Normal case - API key doesn't have a masked prefix
                console.log(`Updating OpenRouter API key to: ${newApiKey.slice(0, 5)}...${newApiKey.slice(-4)}`);
                // Only update the .env file, not the config object
                process.env.OPENROUTER_API_KEY = newApiKey;
                
                // Update the .env file with the new API key
                const envUpdateSuccess = updateEnvFile(newApiKey);
                console.log(`Updated .env file: ${envUpdateSuccess ? 'Success' : 'Failed'}`);
                
                configUpdated = true;
            }
        }
        
        if (req.body.openrouter.model !== undefined) {
            config.openrouter.model = req.body.openrouter.model;
            configUpdated = true;
        }
    }
    
    // Update LMStudio settings if provided
    if (req.body.lmstudio) {
        if (!config.lmstudio) {
            config.lmstudio = {};
        }
        
        if (req.body.lmstudio.url !== undefined) {
            config.lmstudio.url = req.body.lmstudio.url;
            configUpdated = true;
        }
        
        if (req.body.lmstudio.model !== undefined) {
            config.lmstudio.model = req.body.lmstudio.model;
            configUpdated = true;
        }
    }
    
    // Text settings removed
    
    // Handle legacy format for backward compatibility
    if (req.body.openrouterApiKey !== undefined) {
        const newApiKey = req.body.openrouterApiKey;
        console.log(`[LEGACY] Updating OpenRouter API key to: ${newApiKey.slice(0, 5)}...${newApiKey.slice(-4)}`);
        if (!config.openrouter) {
            config.openrouter = {};
        }
        // Only update the .env file, not the config object
        process.env.OPENROUTER_API_KEY = newApiKey;
        
        // Update the .env file with the new API key
        const envUpdateSuccess = updateEnvFile(newApiKey);
        console.log(`[LEGACY] Updated .env file: ${envUpdateSuccess ? 'Success' : 'Failed'}`);
        
        configUpdated = true;
    }
    
    if (req.body.selectedModel !== undefined) {
        // Convert old model selection to new format
        if (req.body.selectedModel === 'openrouter') {
            config.selectedModelType = 'openrouter';
        } else {
            config.selectedModelType = 'lmstudio';
        }
        configUpdated = true;
    }
    
    if (configUpdated) {
        // Save the updated configuration
        const success = saveConfig();
        
        if (success) {
            // Create a safe copy of the config without exposing sensitive information
            const safeConfig = {
                selectedModelType: config.selectedModelType,
                openrouter: {
                    ...config.openrouter,
                    apiKey: process.env.OPENROUTER_API_KEY ?
                        '••••' + process.env.OPENROUTER_API_KEY.slice(-4) : '',
                    hasApiKey: !!process.env.OPENROUTER_API_KEY
                },
                lmstudio: { ...config.lmstudio }
            };
            
            res.json({
                success: true,
                message: 'Configuration updated successfully',
                config: safeConfig
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to save configuration'
            });
        }
    } else {
        res.status(400).json({
            success: false,
            message: 'No valid configuration parameters provided'
        });
    }
});

// Endpoint to toggle server status
app.post('/api/server/toggle', (req, res) => {
    console.log(`Received /api/server/toggle request, enabled: ${req.body?.enabled}`);
    
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
    console.log(`Received /api/content update request, content length: ${req.body?.content?.length || 0}`);
    
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

// Helper function to determine if a request is coming from the WebUI
const isWebUIRequest = (req) => {
    // Only log the referer, not the entire headers object
    if (req.headers?.referer) {
        console.log(`[isWebUIRequest] referer: ${req.headers.referer}`);
    }
    
    // WebUI typically uses OpenAI format but identifies itself in the referer
    // Add null check for req.headers
    return req.headers && req.headers.referer && req.headers.referer.includes('localhost:12345');
};

// Helper function to process chat requests (used by both Ollama and OpenAI endpoints)
const processChatRequest = async (req, res, isOpenAIFormat = false) => {
    try {
        // Check if server is enabled
        if (!serverEnabled) {
            throw new Error('Server is currently disabled');
        }
        
        // Handle different request formats
        let model, messages, stream;
        
        if (isOpenAIFormat) {
            // OpenAI format validation
            if (!req.body.model) {
                throw new Error('Missing required field: model');
            }
            if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
                throw new Error('Missing or invalid required field: messages');
            }
            model = req.body.model;
            messages = req.body.messages;
            stream = req.body.stream === true;
        } else {
            // Ollama format validation
            if (!req.body.model) {
                throw new Error('Missing required field: model');
            }
            if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
                throw new Error('Missing or invalid required field: messages');
            }
            model = req.body.model;
            messages = req.body.messages;
            stream = req.body.stream === true;
        }

        // Determine which model to use based on configuration or request
        const modelName = model.replace(':latest', '');
        console.log(`[MODEL SELECTION] Original model=${model}, parsed modelName=${modelName}, config.selectedModelType=${config.selectedModelType}`);
        
        // Minimal debug logging for request object
        console.log(`[MODEL SELECTION] Processing request with model: ${model}`);
        
        // Check if this is a request from the pseudo server (not the web UI)
        let isPseudoServerRequest = false;
        try {
            const webUIRequestResult = isWebUIRequest(req);
            console.log(`[MODEL SELECTION] isWebUIRequest result: ${webUIRequestResult}`);
            isPseudoServerRequest = !webUIRequestResult && (modelName === 'remote' || model === 'remote:latest');
            console.log(`[MODEL SELECTION] isPseudoServerRequest=${isPseudoServerRequest}`);
        } catch (error) {
            console.error(`[MODEL SELECTION] Error checking isWebUIRequest: ${error.message}`);
            console.error(error.stack);
        }
        
        // First check for specific model identifier in the request
        // This ensures we respect the actual model requested, not just the config
        if (modelName === 'lmstudio' || model === 'lmstudio:latest' || model === 'LM Studio') {
            // Handle LMStudio requests
            console.log('[MODEL SELECTION] Detected LMStudio model request');
            
            // Validate LMStudio URL
            if (!config.lmstudio?.url) {
                throw new Error('LMStudio URL is not configured. Please set it in the web UI.');
            }
            
            // Skip to the LMStudio handler below
            // The code will continue to the LMStudio section
        }
        else if (modelName === 'openrouter' || model === 'openrouter:latest' ||
            model.includes('openrouter') || model === 'RemoteModel' ||
            modelName === 'RemoteModel' ||
            (config.selectedModelType === 'openrouter' &&
             modelName !== 'lmstudio' &&
             model !== 'lmstudio:latest' &&
             model !== 'LocalModel') ||
            isPseudoServerRequest) {
            
            // If this is a request from the pseudo server, log it
            if (isPseudoServerRequest) {
                console.log('[MODEL SELECTION] Routing remote pseudo model request to OpenRouter');
            }
            // Validate OpenRouter API key from environment variable
            if (!process.env.OPENROUTER_API_KEY) {
                throw new Error('OpenRouter API key is not configured. Please set it in the .env file or web UI.');
            }
            
            try {
                // Forward the request to OpenRouter
                console.log('Forwarding request to OpenRouter');
                
                // Prepare the OpenRouter request
                let openRouterModel = config.openrouter?.model || 'google/gemini-2.0-flash-001'; // Default model
                
                // If this is a specific OpenRouter model request, use that model
                // But only if it's a valid OpenRouter model ID
                if (modelName !== 'openrouter' &&
                    modelName !== 'remote' &&
                    modelName !== 'RemoteModel' &&
                    model !== 'RemoteModel') {
                    openRouterModel = modelName;
                } else if (modelName === 'RemoteModel' || model === 'RemoteModel') {
                    // Use the default model from config for RemoteModel
                    openRouterModel = config.openrouter?.model || 'google/gemini-2.0-flash-001';
                    console.log(`Using default OpenRouter model ${openRouterModel} for model name: ${model}`);
                }
                
                console.log(`[OPENROUTER REQUEST] Using model: ${openRouterModel}`);
                
                const openRouterRequest = {
                    model: openRouterModel,
                    messages: messages,
                    stream: stream
                };
                
                if (stream) {
                    // Handle streaming response from OpenRouter
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    
                    const streamResponse = await axios({
                        method: 'post',
                        url: 'https://openrouter.ai/api/v1/chat/completions',
                        data: openRouterRequest,
                        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
                        responseType: 'stream'
                    });
                    
                    let fullContent = '';
                    
                    streamResponse.data.on('data', (chunk) => {
                        const lines = chunk.toString().split('\n').filter(line => line.trim());
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') continue;
                                try {
                                    const parsed = JSON.parse(data);
                                    if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                        fullContent += parsed.choices[0].delta.content;
                                        
                                        // Format the response according to the requested format
                                        if (isOpenAIFormat) {
                                            // Pass through the OpenRouter response as is
                                            res.write(`data: ${data}\n\n`);
                                        } else {
                                            // Convert to Ollama format
                                            const ollamaChunk = {
                                                model: model,
                                                created_at: new Date().toISOString(),
                                                message: {
                                                    role: 'assistant',
                                                    content: parsed.choices[0].delta.content
                                                },
                                                done: false
                                            };
                                            res.write(JSON.stringify(ollamaChunk) + '\n');
                                        }
                                    }
                                } catch (e) {
                                    console.error('Error parsing stream chunk:', e.message);
                                }
                            }
                        }
                    });
                    
                    streamResponse.data.on('end', () => {
                        if (isOpenAIFormat) {
                            res.write('data: [DONE]\n\n');
                        } else {
                            // Send final Ollama message with done: true
                            const ollamaFinal = {
                                model: model,
                                created_at: new Date().toISOString(),
                                message: {
                                    role: 'assistant',
                                    content: ''
                                },
                                done: true
                            };
                            res.write(JSON.stringify(ollamaFinal) + '\n');
                        }
                        res.end();
                    });
                    
                    streamResponse.data.on('error', (error) => {
                        console.error('Error in OpenRouter stream:', error);
                        res.end();
                    });
                    
                    // Handle client disconnect
                    req.on('close', () => {
                        console.log('Client disconnected from stream');
                        res.end();
                    });
                    
                    return; // End the function here for streaming responses
                } else {
                    // Handle non-streaming response from OpenRouter
                    const response = await axios.post(
                        'https://openrouter.ai/api/v1/chat/completions',
                        openRouterRequest,
                        { headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` } }
                    );
                    
                    console.log('Received response from OpenRouter');
                    
                    if (isOpenAIFormat) {
                        // Pass through the OpenRouter response as is
                        return res.json(response.data);
                    } else {
                        // Convert to Ollama format
                        const ollamaResponse = {
                            model: model,
                            created_at: new Date().toISOString(),
                            message: {
                                role: 'assistant',
                                content: response.data.choices[0].message.content
                            },
                            done: true
                        };
                        return res.json(ollamaResponse);
                    }
                }
            } catch (error) {
                console.error('Error communicating with OpenRouter:', error.message);
                if (error.response) {
                    console.error('OpenRouter error response:', error.response.data);
                }
                throw new Error(`OpenRouter error: ${error.message}`);
            }
        }
        
        // Debug logging to help diagnose the issue
        console.log(`Processing request for model: ${model}, modelName: ${modelName}, selectedModelType: ${config.selectedModelType}`);
        
        // Check if this is an LMStudio request - explicitly check for lmstudio:latest
        console.log(`[LMSTUDIO CHECK] Checking if request is for LMStudio: model=${model}, modelName=${modelName}, selectedModelType=${config.selectedModelType}`);
        console.log(`[LMSTUDIO CHECK] Condition values: (model === 'lmstudio:latest')=${model === 'lmstudio:latest'}, (modelName === 'lmstudio')=${modelName === 'lmstudio'}, (config.selectedModelType === 'lmstudio')=${config.selectedModelType === 'lmstudio'}`);
        
        // Modified condition to make sure OpenRouter requests don't get processed by LMStudio handler
        // Also exclude remote pseudo model requests
        let isPseudoServerRemoteRequest = false;
        try {
            isPseudoServerRemoteRequest = !isWebUIRequest(req) && (modelName === 'remote' || model === 'remote:latest');
        } catch (error) {
            console.error(`[LMSTUDIO CHECK] Error checking isPseudoServerRemoteRequest: ${error.message}`);
        }
        if ((model === 'lmstudio:latest' || modelName === 'lmstudio' || model === 'LocalModel') ||
            (config.selectedModelType === 'lmstudio' &&
             modelName !== 'openrouter' &&
             model !== 'openrouter:latest' &&
             model !== 'RemoteModel' &&
             !model.includes('openrouter') &&
             !isPseudoServerRemoteRequest)) {
            console.log('[LMSTUDIO CHECK] LMStudio condition triggered - attempting to connect to LMStudio');
            // Validate LMStudio URL
            if (!config.lmstudio?.url) {
                throw new Error('LMStudio URL is not configured. Please set it in the web UI.');
            }
            
            try {
                // Forward the request to LMStudio
                console.log('Forwarding request to LMStudio');
                
                // Prepare headers for the request
                const headers = {};
                if (config.lmstudio.apiKey) {
                    headers['Authorization'] = `Bearer ${config.lmstudio.apiKey}`;
                }
                
                // Format the URL correctly
                const lmStudioUrl = config.lmstudio.url.endsWith('/')
                    ? config.lmstudio.url.slice(0, -1)
                    : config.lmstudio.url;
                
                console.log(`[LMSTUDIO REQUEST] Using URL: ${lmStudioUrl}`);
                console.log(`[LMSTUDIO REQUEST] Using API key: ${config.lmstudio.apiKey ? 'Yes (provided)' : 'No (not provided)'}`);
                console.log(`[LMSTUDIO REQUEST] Using model: ${config.lmstudio.model || 'unsloth-phi-4'}`);
                
                // Prepare the LMStudio request (OpenAI format)
                const lmStudioRequest = {
                    model: config.lmstudio.model || 'unsloth-phi-4',
                    messages: messages,
                    stream: stream,
                    max_tokens: config.lmstudio.maxTokens || 2048
                };
                
                console.log(`[LMSTUDIO REQUEST] Request with ${messages.length} messages, stream=${stream}, model=${lmStudioRequest.model}`);
                
                if (stream) {
                    // Handle streaming response from LMStudio
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    
                    const streamResponse = await axios({
                        method: 'post',
                        url: `${lmStudioUrl}/chat/completions`,
                        data: lmStudioRequest,
                        headers: headers,
                        responseType: 'stream',
                        timeout: config.lmstudio.timeout || 30000
                    });
                    
                    let fullContent = '';
                    
                    streamResponse.data.on('data', (chunk) => {
                        const lines = chunk.toString().split('\n').filter(line => line.trim());
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') {
                                    console.log('[LMSTUDIO STREAM] Received [DONE] without content');
                                    continue;
                                }
                                try {
                                    const parsed = JSON.parse(data);
                                    console.log('[LMSTUDIO STREAM] Parsed data:', JSON.stringify(parsed));
                                    
                                    // Check if we have valid content
                                    if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                        fullContent += parsed.choices[0].delta.content;
                                        
                                        // Format the response according to the requested format
                                        if (isOpenAIFormat) {
                                            // Pass through the LMStudio response as is
                                            res.write(`data: ${data}\n\n`);
                                        } else {
                                            // Convert to Ollama format
                                            const ollamaChunk = {
                                                model: model,
                                                created_at: new Date().toISOString(),
                                                message: {
                                                    role: 'assistant',
                                                    content: parsed.choices[0].delta.content
                                                },
                                                done: false
                                            };
                                            res.write(JSON.stringify(ollamaChunk) + '\n');
                                        }
                                    } else {
                                        // Handle empty delta or missing content
                                        console.log('[LMSTUDIO STREAM] Empty delta or missing content in response');
                                        
                                        // If we have a delta but no content, it might be a role or other metadata
                                        if (parsed.choices && parsed.choices[0].delta) {
                                            console.log('[LMSTUDIO STREAM] Delta without content:', JSON.stringify(parsed.choices[0].delta));
                                        }
                                    }
                                } catch (e) {
                                    console.error('Error parsing stream chunk:', e.message);
                                }
                            }
                        }
                    });
                    
                    streamResponse.data.on('end', () => {
                        console.log(`[LMSTUDIO STREAM] Stream ended, fullContent length: ${fullContent.length}`);
                        
                        // Check if we received any content at all
                        if (fullContent.length === 0) {
                            console.log('[LMSTUDIO STREAM] No content received from LMStudio, falling back to default response');
                            
                            // Generate a fallback response
                            const fallbackContent = "I'm sorry, but I couldn't generate a response. Please try again or check if LM Studio is running correctly.";
                            fullContent = fallbackContent;
                            
                            // Send the fallback content as a final chunk
                            if (isOpenAIFormat) {
                                const fallbackChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: model,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { content: fallbackContent },
                                            finish_reason: null
                                        }
                                    ]
                                };
                                res.write(`data: ${JSON.stringify(fallbackChunk)}\n\n`);
                            } else {
                                const ollamaChunk = {
                                    model: model,
                                    created_at: new Date().toISOString(),
                                    message: {
                                        role: 'assistant',
                                        content: fallbackContent
                                    },
                                    done: false
                                };
                                res.write(JSON.stringify(ollamaChunk) + '\n');
                            }
                        }
                        
                        // Send the final [DONE] marker
                        if (isOpenAIFormat) {
                            res.write('data: [DONE]\n\n');
                        } else {
                            // Send final Ollama message with done: true
                            const ollamaFinal = {
                                model: model,
                                created_at: new Date().toISOString(),
                                message: {
                                    role: 'assistant',
                                    content: ''
                                },
                                done: true
                            };
                            res.write(JSON.stringify(ollamaFinal) + '\n');
                        }
                        res.end();
                    });
                    
                    streamResponse.data.on('error', (error) => {
                        console.error('Error in LMStudio stream:', error);
                        res.end();
                    });
                    
                    // Handle client disconnect
                    req.on('close', () => {
                        console.log('Client disconnected from stream');
                        res.end();
                    });
                    
                    return; // End the function here for streaming responses
                } else {
                    // Handle non-streaming response from LMStudio
                    const response = await axios.post(
                        `${lmStudioUrl}/chat/completions`,
                        lmStudioRequest,
                        {
                            headers: headers,
                            timeout: config.lmstudio.timeout || 30000
                        }
                    );
                    
                    console.log('Received response from LMStudio');
                    
                    if (isOpenAIFormat) {
                        // Pass through the LMStudio response as is
                        return res.json(response.data);
                    } else {
                        // Convert to Ollama format
                        const ollamaResponse = {
                            model: model,
                            created_at: new Date().toISOString(),
                            message: {
                                role: 'assistant',
                                content: response.data.choices[0].message.content
                            },
                            done: true
                        };
                        return res.json(ollamaResponse);
                    }
                }
            } catch (error) {
                console.error('[LMSTUDIO ERROR] Error communicating with LMStudio:', error.message);
                console.error('[LMSTUDIO ERROR] Error code:', error.code);
                console.error('[LMSTUDIO ERROR] Error stack:', error.stack);
                
                if (error.response) {
                    console.error('[LMSTUDIO ERROR] Response status:', error.response.status);
                    console.error('[LMSTUDIO ERROR] Response data:', JSON.stringify(error.response.data, null, 2));
                }
                
                // Determine appropriate error message
                let errorMessage = 'Error connecting to LMStudio';
                if (error.code === 'ECONNREFUSED') {
                    errorMessage = 'Connection refused. Make sure LMStudio is running and the URL is correct.';
                } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
                    errorMessage = 'Connection timed out. Check if LMStudio is responding.';
                } else if (error.response) {
                    errorMessage = `LMStudio API error: ${error.response.status} ${error.response.statusText}`;
                }
                
                console.error(`[LMSTUDIO ERROR] Final error message: LMStudio error: ${errorMessage}`);
                
                // Check if we should fall back to OpenRouter
                if (process.env.OPENROUTER_API_KEY) {
                    console.log('[LMSTUDIO ERROR] Falling back to OpenRouter due to LMStudio error');
                    
                    // Update the config to use OpenRouter for future requests
                    config.selectedModelType = 'openrouter';
                    saveConfig();
                    
                    // Re-run the request using OpenRouter
                    return processChatRequest({
                        ...req,
                        body: {
                            ...req.body,
                            model: 'openrouter:latest'
                        }
                    }, res, isOpenAIFormat);
                } else {
                    // If OpenRouter is not configured, throw the error
                    throw new Error(`LMStudio error: ${errorMessage}`);
                }
            }
        }
        
        // Text simulation removed - now just OpenRouter and LMStudio options
        
        // If not a recognized model type, default to LMStudio if configured, otherwise to OpenRouter
        console.log(`No specific model type matched for model=${model}, modelName=${modelName}, selectedModelType=${config.selectedModelType} - defaulting to alternative model`);
        
        if (config.lmstudio?.url) {
            // Redirect to LMStudio code path
            console.log(`Defaulting to LMStudio as fallback`);
            if (!config.lmstudio?.url) {
                throw new Error('LMStudio URL is not configured. Please set it in the web UI.');
            }
            
            // Re-run the LMStudio flow
            return processChatRequest({
                ...req,
                body: {
                    ...req.body,
                    model: 'lmstudio:latest'
                }
            }, res, isOpenAIFormat);
        } else if (process.env.OPENROUTER_API_KEY) {
            // Redirect to OpenRouter code path
            console.log(`Defaulting to OpenRouter as fallback`);
            if (!process.env.OPENROUTER_API_KEY) {
                throw new Error('OpenRouter API key is not configured. Please set it in the .env file or web UI.');
            }
            
            // Re-run the OpenRouter flow
            return processChatRequest({
                ...req,
                body: {
                    ...req.body,
                    model: 'openrouter:latest'
                }
            }, res, isOpenAIFormat);
        } else {
            // Neither model is configured
            throw new Error('No model is properly configured. Please configure either OpenRouter or LMStudio in the web UI.');
        }
    } catch (error) {
        console.error(`Error in chat processing: ${error.message}`);
        
        if (isOpenAIFormat) {
            // OpenAI-style error response
            return res.status(400).json({
                error: {
                    message: error.message,
                    type: "invalid_request_error",
                    code: "invalid_request"
                }
            });
        } else {
            // Ollama-style error response
            const ollamaErrorResponse = {
                model: req.body.model || 'unknown',
                created_at: new Date().toISOString(),
                message: {
                    role: 'assistant',
                    content: `Error: ${error.message}`
                },
                done: true
            };
            console.log(`Sending Ollama-style error response: ${error.message}`);
            return res.status(200).json(ollamaErrorResponse); // Ollama returns 200 even for errors
        }
    }
};

// Endpoint to handle chat completions (Ollama's /api/chat)
app.post('/api/chat', async (req, res) => {
    console.log('Received Ollama-style /api/chat request');
    await processChatRequest(req, res, false);
});

// Endpoint to handle text generation (Ollama's /api/generate)
app.post('/api/generate', (req, res) => {
    console.log('Received Ollama-style /api/generate request');
    // Log minimal information about the request
    console.log(`[GENERATE] Request for model: ${req.body?.model || 'unknown'}, prompt length: ${req.body?.prompt?.length || 0}`);
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(200).json({
            model: req.body.model || 'unknown',
            created_at: new Date().toISOString(),
            response: `Error: Server is currently disabled`,
            done: true
        });
    }
    
    // Validate request
    if (!req.body.model) {
        return res.status(200).json({
            model: 'unknown',
            created_at: new Date().toISOString(),
            response: 'Error: Missing required field: model',
            done: true
        });
    }
    
    if (!req.body.prompt) {
        return res.status(200).json({
            model: req.body.model,
            created_at: new Date().toISOString(),
            response: 'Error: Missing required field: prompt',
            done: true
        });
    }
    
    // Convert the generate format to chat format
    // Create a message array with the user prompt
    const chatMessages = [
        {
            role: 'user',
            content: req.body.prompt
        }
    ];
    
    // Create a chat-style request - make sure to explicitly copy headers
    const chatRequest = {
        ...req,
        headers: req.headers, // Explicitly copy headers to ensure they're preserved
        body: {
            ...req.body,
            messages: chatMessages
        }
    };
    
    // Log a simplified version of the transformed request
    console.log('[GENERATE] Transformed chatRequest with prompt length:',
        req.body.prompt ? req.body.prompt.length : 'unknown');
    
    // Modify the response handlers to convert from chat format to generate format
    const originalJson = res.json;
    const originalWrite = res.write;
    const originalEnd = res.end;
    
    if (req.body.stream === true) {
        // For streaming responses
        res.write = function(chunk) {
            try {
                const original = chunk.toString();
                if (original.startsWith('data: ')) {
                    // This is OpenAI format streaming - pass through
                    return originalWrite.apply(this, arguments);
                }
                
                // Parse the Ollama chat format response
                const chatResponse = JSON.parse(original);
                
                // Convert to Ollama generate format
                if (chatResponse.message && chatResponse.message.content) {
                    const generateResponse = {
                        model: req.body.model,
                        created_at: chatResponse.created_at || new Date().toISOString(),
                        response: chatResponse.message.content,
                        done: chatResponse.done || false
                    };
                    
                    return originalWrite.call(this, JSON.stringify(generateResponse) + '\n');
                }
                
                // Pass through unchanged if not recognized format
                return originalWrite.apply(this, arguments);
            } catch (error) {
                console.error('Error transforming streaming response:', error);
                return originalWrite.apply(this, arguments);
            }
        };
    } else {
        // For non-streaming responses
        res.json = function(chatResponse) {
            try {
                // Convert chat format to generate format
                if (chatResponse.message && chatResponse.message.content) {
                    // This is an Ollama format response
                    const generateResponse = {
                        model: req.body.model,
                        created_at: chatResponse.created_at || new Date().toISOString(),
                        response: chatResponse.message.content,
                        done: true
                    };
                    return originalJson.call(this, generateResponse);
                } else if (chatResponse.choices && chatResponse.choices[0] && chatResponse.choices[0].message) {
                    // This is an OpenAI format response
                    const generateResponse = {
                        model: req.body.model,
                        created_at: new Date().toISOString(),
                        response: chatResponse.choices[0].message.content,
                        done: true
                    };
                    return originalJson.call(this, generateResponse);
                }
                
                // Pass through error responses or unrecognized formats
                return originalJson.apply(this, arguments);
            } catch (error) {
                console.error('Error transforming response:', error);
                return originalJson.apply(this, arguments);
            }
        };
    }
    
    // Process using the chat request handler, which will route to appropriate model
    return processChatRequest(chatRequest, res, false);
});

// OpenAI-compatible endpoint for chat completions
app.post('/v1/chat/completions', async (req, res) => {
    console.log('Received OpenAI-style /v1/chat/completions request');
    await processChatRequest(req, res, true);
});

// OpenAI-compatible endpoint for completions
app.post('/v1/completions', (req, res) => {
    console.log('Received OpenAI-style /v1/completions request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(503).json({
            error: {
                message: "Server is currently disabled",
                type: "server_error",
                code: "service_unavailable"
            }
        });
    }
    
    // Create a messages-style request from the completions request
    // For completions, the text is in prompt field
    const prompt = req.body.prompt || '';
    
    const chatMessages = [
        {
            role: 'user',
            content: prompt
        }
    ];
    
    // Create a chat-style request
    const chatRequest = {
        ...req,
        body: {
            ...req.body,
            messages: chatMessages,
            model: req.body.model || "gpt-3.5-turbo" // Default model if not specified
        }
    };
    
    // Intercept the response to convert from chat format to completions format
    const originalJson = res.json;
    const originalWrite = res.write;
    
    if (req.body.stream === true) {
        // For streaming responses - convert delta format to completions format
        res.write = function(chunk) {
            try {
                const original = chunk.toString();
                if (original.startsWith('data: ')) {
                    const data = original.slice(6);
                    if (data === '[DONE]') {
                        return originalWrite.call(this, original);
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            // Convert to completions format
                            const completionChunk = {
                                id: parsed.id || `cmpl-${Date.now()}`,
                                object: "text_completion_chunk",
                                created: parsed.created || Math.floor(Date.now() / 1000),
                                model: req.body.model || "pseudollama",
                                choices: [
                                    {
                                        text: parsed.choices[0].delta.content,
                                        index: 0,
                                        logprobs: null,
                                        finish_reason: parsed.choices[0].finish_reason || null
                                    }
                                ]
                            };
                            
                            return originalWrite.call(this, `data: ${JSON.stringify(completionChunk)}\n\n`);
                        }
                    } catch (e) {
                        console.error('Error parsing streaming chunk:', e.message);
                    }
                }
                
                // Pass through unchanged if not recognized
                return originalWrite.apply(this, arguments);
            } catch (error) {
                console.error('Error transforming streaming response:', error);
                return originalWrite.apply(this, arguments);
            }
        };
    } else {
        // For non-streaming responses
        res.json = function(chatResponse) {
            try {
                // Check if this is a chat completion response
                if (chatResponse.choices && chatResponse.choices[0].message) {
                    // Convert from chat format to completions format
                    const completionResponse = {
                        id: chatResponse.id || `cmpl-${Date.now()}`,
                        object: "text_completion",
                        created: chatResponse.created || Math.floor(Date.now() / 1000),
                        model: req.body.model || "pseudollama",
                        choices: [
                            {
                                text: chatResponse.choices[0].message.content,
                                index: 0,
                                logprobs: null,
                                finish_reason: chatResponse.choices[0].finish_reason || "stop"
                            }
                        ],
                        usage: chatResponse.usage || {
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0
                        }
                    };
                    
                    console.log('Sending converted OpenAI-style /v1/completions response');
                    return originalJson.call(this, completionResponse);
                }
                
                // Pass through error responses or unrecognized formats
                return originalJson.apply(this, arguments);
            } catch (error) {
                console.error('Error transforming response:', error);
                return originalJson.apply(this, arguments);
            }
        };
    }
    
    // Process using the chat request handler, which will route to appropriate model
    return processChatRequest(chatRequest, res, true);
});

// Endpoint to handle model pulling requests (similar to Ollama's /api/pull)
app.post('/api/pull', (req, res) => {
    console.log(`Received /api/pull request for model: ${req.body?.name || 'unknown'}`);
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(503).json({
            error: 'Server is currently disabled'
        });
    }
    
    // Simply respond as if the model is already pulled and ready
    // This makes external tools happy without actually pulling anything
    res.json({
        status: 'success',
        digest: 'sha256:pseudo',
        total_size: 0,
        completed_size: 0
    });
});

// Endpoint to handle embeddings (Ollama's /api/embeddings)
app.post('/api/embeddings', (req, res) => {
    console.log('Received Ollama-style /api/embeddings request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(200).json({
            error: 'Server is currently disabled'
        });
    }
    
    // Validate request
    if (!req.body.model) {
        return res.status(200).json({
            error: 'Missing required field: model'
        });
    }
    
    if (!req.body.prompt) {
        return res.status(200).json({
            error: 'Missing required field: prompt'
        });
    }
    
    // Generate fake embeddings (random values between -1 and 1)
    const dimensions = 1536; // Standard embedding size
    const embeddings = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
    
    const response = {
        embedding: embeddings
    };
    
    console.log(`Sending /api/embeddings response with ${dimensions} dimensions`);
    res.json(response);
});

// OpenAI-compatible endpoint for embeddings
app.post('/v1/embeddings', (req, res) => {
    console.log('Received OpenAI-style /v1/embeddings request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(503).json({
            error: {
                message: "Server is currently disabled",
                type: "server_error",
                code: "service_unavailable"
            }
        });
    }
    
    // Validate request
    if (!req.body.model) {
        return res.status(400).json({
            error: {
                message: "Missing required field: model",
                type: "invalid_request_error",
                code: "invalid_request"
            }
        });
    }
    
    if (!req.body.input) {
        return res.status(400).json({
            error: {
                message: "Missing required field: input",
                type: "invalid_request_error",
                code: "invalid_request"
            }
        });
    }
    
    // Generate fake embeddings (random values between -1 and 1)
    const dimensions = 1536; // Standard embedding size
    const embeddings = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
    
    const response = {
        object: "list",
        data: [
            {
                object: "embedding",
                embedding: embeddings,
                index: 0
            }
        ],
        model: req.body.model,
        usage: {
            prompt_tokens: 0,
            total_tokens: 0
        }
    };
    
    console.log(`Sending OpenAI-style /v1/embeddings response with ${dimensions} dimensions`);
    res.json(response);
});

// Endpoint to list available models (similar to Ollama's /api/tags)
app.get('/api/tags', async (req, res) => {
    console.log('Received Ollama-style /api/tags request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(200).json({
            models: [],
            error: 'Server is currently disabled'
        });
    }
    
    // Create a list of models - only include our two pseudo models
    let modelsList = [];
    
    // Add LocalModel for LM Studio if configured
    if (config.lmstudio?.url) {
        try {
            // Check if we have a valid cache to verify LM Studio is accessible
            const now = Date.now();
            const cache = modelCache.lmstudio;
            
            let lmStudioConnected = false;
            
            if (cache.models && cache.lastFetched && (now - cache.lastFetched < cache.cacheDuration)) {
                console.log(`[LMSTUDIO MODELS] LM Studio connection verified via cache`);
                lmStudioConnected = true;
            } else {
                // Prepare headers for the request
                const headers = {};
                if (config.lmstudio.apiKey) {
                    headers['Authorization'] = `Bearer ${config.lmstudio.apiKey}`;
                }
                
                // Format the URL correctly
                const lmStudioUrl = config.lmstudio.url.endsWith('/')
                    ? config.lmstudio.url.slice(0, -1)
                    : config.lmstudio.url;
                    
                try {
                    // Just check if LM Studio is accessible
                    console.log(`[LMSTUDIO MODELS] Verifying LM Studio connection`);
                    const response = await axios.get(`${lmStudioUrl}/models`, {
                        headers,
                        timeout: config.lmstudio.timeout || 30000
                    });
                    
                    // Update the cache
                    modelCache.lmstudio.models = response.data.data;
                    modelCache.lmstudio.lastFetched = now;
                    lmStudioConnected = true;
                } catch (error) {
                    console.error('Error connecting to LM Studio:', error.message);
                    lmStudioConnected = false;
                }
            }
            
            // Add the LocalModel entry if LM Studio is connected
            if (lmStudioConnected) {
                modelsList.push({
                    model: 'lmstudio:latest',
                    name: 'LocalModel',
                    modified_at: new Date().toISOString(),
                    size: 0,
                    digest: 'n/a'
                });
                
                console.log(`[LMSTUDIO MODELS] Added LocalModel pseudo model for LM Studio`);
            }
        } catch (error) {
            console.error('Error verifying LM Studio connection:', error.message);
            // Still add the LocalModel entry even if there's an error
            modelsList.push({
                model: 'lmstudio:latest',
                name: 'LocalModel',
                modified_at: new Date().toISOString(),
                size: 0,
                digest: 'n/a'
            });
        }
    }
    
    // Add RemoteModel for OpenRouter if configured
    if (process.env.OPENROUTER_API_KEY) {
        modelsList.push({
            model: 'openrouter:latest',
            name: 'RemoteModel',
            modified_at: new Date().toISOString(),
            size: 0,
            digest: 'n/a'
        });
        
        console.log(`[OPENROUTER MODELS] Added RemoteModel pseudo model for OpenRouter`);
    }
    
    const models = {
        models: modelsList
    };

    console.log(`Sending Ollama-style /api/tags response with ${modelsList.length} models`);
    res.json(models);
});

// OpenAI-compatible endpoint for listing models
app.get('/v1/models', async (req, res) => {
    console.log('Received OpenAI-style /v1/models request');
    
    // Check if server is enabled
    if (!serverEnabled) {
        return res.status(503).json({
            error: {
                message: "Server is currently disabled",
                type: "server_error",
                code: "service_unavailable"
            }
        });
    }
    
    // Create a list of models - only include our two pseudo models
    let openaiModelsList = [];
    
    // Add LocalModel for LM Studio if configured
    if (config.lmstudio?.url) {
        try {
            // Check if we have a valid cache to verify LM Studio is accessible
            const now = Date.now();
            const cache = modelCache.lmstudio;
            
            let lmStudioConnected = false;
            
            if (cache.models && cache.lastFetched && (now - cache.lastFetched < cache.cacheDuration)) {
                console.log(`[LMSTUDIO MODELS] LM Studio connection verified via cache`);
                lmStudioConnected = true;
            } else {
                // Prepare headers for the request
                const headers = {};
                if (config.lmstudio.apiKey) {
                    headers['Authorization'] = `Bearer ${config.lmstudio.apiKey}`;
                }
                
                // Format the URL correctly
                const lmStudioUrl = config.lmstudio.url.endsWith('/')
                    ? config.lmstudio.url.slice(0, -1)
                    : config.lmstudio.url;
                    
                try {
                    // Just check if LM Studio is accessible
                    console.log(`[LMSTUDIO MODELS] Verifying LM Studio connection`);
                    const response = await axios.get(`${lmStudioUrl}/models`, {
                        headers,
                        timeout: config.lmstudio.timeout || 30000
                    });
                    
                    // Update the cache
                    modelCache.lmstudio.models = response.data.data;
                    modelCache.lmstudio.lastFetched = now;
                    lmStudioConnected = true;
                } catch (error) {
                    console.error('Error connecting to LM Studio:', error.message);
                    lmStudioConnected = false;
                }
            }
            
            // Add the LocalModel entry if LM Studio is connected
            if (lmStudioConnected) {
                openaiModelsList.push({
                    id: "lmstudio-latest",
                    object: "model",
                    name: "LocalModel",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: "pseudollama"
                });
                
                console.log(`[LMSTUDIO MODELS] Added LocalModel pseudo model for LM Studio`);
            }
        } catch (error) {
            console.error('Error verifying LM Studio connection:', error.message);
            // Still add the LocalModel entry even if there's an error
            openaiModelsList.push({
                id: "lmstudio-latest",
                object: "model",
                name: "LocalModel",
                created: Math.floor(Date.now() / 1000),
                owned_by: "pseudollama"
            });
        }
    }
    
    // Add RemoteModel for OpenRouter if configured
    if (process.env.OPENROUTER_API_KEY) {
        openaiModelsList.push({
            id: "openrouter-latest",
            object: "model",
            name: "RemoteModel",
            created: Math.floor(Date.now() / 1000),
            owned_by: "pseudollama"
        });
        
        console.log(`[OPENROUTER MODELS] Added RemoteModel pseudo model for OpenRouter`);
    }
    
    const openaiModels = {
        object: "list",
        data: openaiModelsList
    };

    // Log a more concise message instead of the full response
    console.log(`Sending OpenAI-style /v1/models response with ${openaiModelsList.length} models`);
    res.json(openaiModels);
});

// Basic health check
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Ollama-style health check endpoint
app.get('/api/health', (req, res) => {
    console.log('Received /api/health request');
    
    res.json({
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// OpenAI-style health check endpoint
app.get('/v1/health', (req, res) => {
    console.log('Received /v1/health request');
    
    res.json({
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Catch-all route for 404 errors - must be after all other routes
app.use((req, res) => {
    console.log(`[404 ERROR] No route found for ${req.method} ${req.url}`);
    
    // Check if this might be an OpenAI-style API request
    if (req.url.includes('/v1/') || req.url.includes('/openai/')) {
        console.log('[HINT] This appears to be an OpenAI-style API request, not an Ollama-style request');
    }
    
    // For API requests, return JSON error
    if (req.url.startsWith('/api/') || req.url.includes('/v1/') || req.accepts('json')) {
        return res.status(404).json({
            error: 'Not found',
            message: `Endpoint ${req.method} ${req.url} is not implemented in this Ollama simulation`
        });
    }
    
    // For browser requests, return HTML
    res.status(404).send('404 - Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`PseudoLlama server running on http://localhost:${PORT}`);
    console.log(`Debug logging enabled - all requests and responses will be logged`);
    console.log(`Full model communications (including complete request/response bodies) are logged to: ${path.join(__dirname, 'logs', 'model_communications.log')}`);
});