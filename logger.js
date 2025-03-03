const fs = require('fs');
const path = require('path');
const util = require('util');

// Configuration
const LOG_DIR = path.join(__dirname, 'logs');
const MODEL_COMMS_LOG_FILE = path.join(LOG_DIR, 'model_communications.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Rotate logs if they get too large
const rotateLogIfNeeded = (logFile) => {
    try {
        if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_SIZE) {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            fs.renameSync(logFile, `${logFile}.${timestamp}`);
        }
    } catch (error) {
        console.error(`Error rotating log file: ${error.message}`);
    }
};

// Initialize log file with a header
const initLogFile = () => {
    rotateLogIfNeeded(MODEL_COMMS_LOG_FILE);
    if (!fs.existsSync(MODEL_COMMS_LOG_FILE)) {
        fs.writeFileSync(MODEL_COMMS_LOG_FILE, `=== MODEL COMMUNICATIONS LOG STARTED AT ${new Date().toISOString()} ===\n\n`);
    }
};

// Initialize log files
initLogFile();

/**
 * Log a model communication event (request or response)
 * @param {Object} options - Logging options
 * @param {string} options.type - Type of event ('REQUEST' or 'RESPONSE')
 * @param {string} options.endpoint - API endpoint
 * @param {string} options.model - Model name
 * @param {Object} options.data - Full data object
 * @param {boolean} options.isStream - Whether this is a streaming response
 * @param {string} [options.streamChunk] - For streaming responses, the current chunk
 */
const logModelCommunication = (options) => {
    try {
        const { type, endpoint, model, data, isStream, streamChunk } = options;
        
        // Create a timestamp
        const timestamp = new Date().toISOString();
        
        // Format the log entry
        let logEntry = `\n=== ${type} [${timestamp}] ===\n`;
        logEntry += `Endpoint: ${endpoint}\n`;
        logEntry += `Model: ${model}\n`;
        
        if (isStream && type === 'RESPONSE' && streamChunk) {
            // For streaming responses, log the chunk
            logEntry += `Stream Chunk: ${streamChunk}\n`;
        } else {
            // For regular requests/responses, log the full data
            // Use util.inspect to handle circular references and format objects nicely
            const dataStr = util.inspect(data, { depth: null, colors: false, maxStringLength: 10000 });
            logEntry += `Data: ${dataStr}\n`;
        }
        
        // Add a separator
        logEntry += `=== END ${type} ===\n`;
        
        // Append to the log file
        fs.appendFileSync(MODEL_COMMS_LOG_FILE, logEntry);
    } catch (error) {
        console.error(`Error logging model communication: ${error.message}`);
    }
};

/**
 * Log the start of a streaming response
 * @param {string} endpoint - API endpoint
 * @param {string} model - Model name
 */
const logStreamStart = (endpoint, model) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `\n=== STREAM START [${timestamp}] ===\n` +
                         `Endpoint: ${endpoint}\n` +
                         `Model: ${model}\n` +
                         `=== STREAM CHUNKS FOLLOW ===\n`;
        
        fs.appendFileSync(MODEL_COMMS_LOG_FILE, logEntry);
    } catch (error) {
        console.error(`Error logging stream start: ${error.message}`);
    }
};

/**
 * Log the end of a streaming response
 * @param {string} endpoint - API endpoint
 * @param {string} model - Model name
 */
const logStreamEnd = (endpoint, model) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `=== STREAM END [${timestamp}] ===\n` +
                         `Endpoint: ${endpoint}\n` +
                         `Model: ${model}\n\n`;
        
        fs.appendFileSync(MODEL_COMMS_LOG_FILE, logEntry);
    } catch (error) {
        console.error(`Error logging stream end: ${error.message}`);
    }
};

/**
 * Create middleware for logging requests and responses
 */
const createLoggingMiddleware = () => {
    return (req, res, next) => {
        // Skip logging for static files and non-model endpoints
        if (req.url.startsWith('/static') || 
            req.url === '/' || 
            req.url === '/favicon.ico' ||
            req.url === '/api/health' ||
            req.url === '/v1/health') {
            return next();
        }
        
        // Clone the request body for logging
        const requestBody = { ...req.body };
        
        // Determine if this is a model-related endpoint
        const isModelEndpoint = 
            req.url.includes('/chat') || 
            req.url.includes('/completions') || 
            req.url.includes('/generate');
        
        if (isModelEndpoint) {
            // Extract model name
            const model = requestBody.model || 'unknown';
            
            // Log the request
            logModelCommunication({
                type: 'REQUEST',
                endpoint: req.url,
                model: model,
                data: requestBody,
                isStream: false
            });
            
            // Check if this is a streaming request
            const isStreamingRequest = requestBody.stream === true;
            
            if (isStreamingRequest) {
                // For streaming responses, we need to intercept the response
                logStreamStart(req.url, model);
                
                // Store original methods
                const originalWrite = res.write;
                const originalEnd = res.end;
                
                // Override write to capture streaming chunks
                res.write = function(chunk) {
                    try {
                        const chunkStr = chunk.toString();
                        
                        // Log the chunk
                        logModelCommunication({
                            type: 'RESPONSE',
                            endpoint: req.url,
                            model: model,
                            data: null,
                            isStream: true,
                            streamChunk: chunkStr
                        });
                    } catch (error) {
                        console.error(`Error in stream write logging: ${error.message}`);
                    }
                    
                    // Call the original write method
                    return originalWrite.apply(this, arguments);
                };
                
                // Override end to log the end of the stream
                res.end = function() {
                    logStreamEnd(req.url, model);
                    return originalEnd.apply(this, arguments);
                };
            } else {
                // For non-streaming responses, capture the response body
                const originalJson = res.json;
                const originalSend = res.send;
                
                // Override json method
                res.json = function(body) {
                    // Log the response
                    logModelCommunication({
                        type: 'RESPONSE',
                        endpoint: req.url,
                        model: model,
                        data: body,
                        isStream: false
                    });
                    
                    // Call the original json method
                    return originalJson.apply(this, arguments);
                };
                
                // Override send method
                res.send = function(body) {
                    // Only log if it's not already handled by json
                    if (typeof body !== 'string' || (typeof body === 'string' && body.startsWith('{'))) {
                        try {
                            const bodyObj = typeof body === 'string' ? JSON.parse(body) : body;
                            
                            // Log the response
                            logModelCommunication({
                                type: 'RESPONSE',
                                endpoint: req.url,
                                model: model,
                                data: bodyObj,
                                isStream: false
                            });
                        } catch (error) {
                            // If it's not JSON, log as string
                            logModelCommunication({
                                type: 'RESPONSE',
                                endpoint: req.url,
                                model: model,
                                data: { rawResponse: body.toString() },
                                isStream: false
                            });
                        }
                    }
                    
                    // Call the original send method
                    return originalSend.apply(this, arguments);
                };
            }
        }
        
        next();
    };
};

module.exports = {
    logModelCommunication,
    createLoggingMiddleware
};