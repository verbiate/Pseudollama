#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const LOG_DIR = path.join(__dirname, 'logs');
const MODEL_COMMS_LOG_FILE = path.join(LOG_DIR, 'model_communications.log');

// Check if log file exists
if (!fs.existsSync(MODEL_COMMS_LOG_FILE)) {
    console.error(`Log file not found: ${MODEL_COMMS_LOG_FILE}`);
    console.error('Run the server first to generate logs.');
    process.exit(1);
}

// Command line arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const filterModel = args.find(arg => arg.startsWith('--model='))?.split('=')[1];
const filterEndpoint = args.find(arg => arg.startsWith('--endpoint='))?.split('=')[1];
const showRequests = args.includes('--requests') || !args.includes('--responses');
const showResponses = args.includes('--responses') || !args.includes('--requests');
const tail = args.includes('--tail') || args.includes('-t');
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 'all';

// Show help
if (showHelp) {
    console.log(`
View and analyze PseudoLlama model communication logs

Usage:
  node view-logs.js [options]

Options:
  --help, -h          Show this help message
  --model=<name>      Filter logs by model name
  --endpoint=<path>   Filter logs by endpoint path
  --requests          Show only requests
  --responses         Show only responses
  --tail, -t          Continuously watch for new log entries
  --limit=<number>    Limit the number of entries shown (default: all)

Examples:
  node view-logs.js                           # Show all logs
  node view-logs.js --model=openrouter        # Show logs for OpenRouter model
  node view-logs.js --endpoint=/v1/chat       # Show logs for /v1/chat endpoint
  node view-logs.js --requests                # Show only requests
  node view-logs.js --tail                    # Watch for new log entries
  node view-logs.js --limit=10                # Show only the last 10 entries
    `);
    process.exit(0);
}

// Function to process log entries
const processLogEntries = (entries) => {
    // Apply filters
    let filteredEntries = entries;
    
    // Filter by type (request/response)
    if (showRequests && !showResponses) {
        filteredEntries = filteredEntries.filter(entry => entry.includes('=== REQUEST ['));
    } else if (showResponses && !showRequests) {
        filteredEntries = filteredEntries.filter(entry => 
            entry.includes('=== RESPONSE [') || 
            entry.includes('=== STREAM START [')
        );
    }
    
    // Filter by model
    if (filterModel) {
        filteredEntries = filteredEntries.filter(entry => {
            const modelLine = entry.split('\n').find(line => line.startsWith('Model:'));
            return modelLine && modelLine.toLowerCase().includes(filterModel.toLowerCase());
        });
    }
    
    // Filter by endpoint
    if (filterEndpoint) {
        filteredEntries = filteredEntries.filter(entry => {
            const endpointLine = entry.split('\n').find(line => line.startsWith('Endpoint:'));
            return endpointLine && endpointLine.toLowerCase().includes(filterEndpoint.toLowerCase());
        });
    }
    
    // Apply limit
    if (limit !== 'all') {
        const numLimit = parseInt(limit, 10);
        if (!isNaN(numLimit) && numLimit > 0) {
            filteredEntries = filteredEntries.slice(-numLimit);
        }
    }
    
    // Print filtered entries
    if (filteredEntries.length === 0) {
        console.log('No log entries match the specified filters.');
    } else {
        console.log(`Showing ${filteredEntries.length} log entries:`);
        console.log(filteredEntries.join('\n'));
    }
};

// Function to parse log file into entries
const parseLogFile = (callback) => {
    const fileContent = fs.readFileSync(MODEL_COMMS_LOG_FILE, 'utf8');
    
    // Split the file into entries (each entry starts with "=== REQUEST" or "=== RESPONSE" or "=== STREAM START")
    const entries = [];
    let currentEntry = '';
    let inEntry = false;
    
    fileContent.split('\n').forEach(line => {
        if (line.startsWith('=== REQUEST [') || 
            line.startsWith('=== RESPONSE [') || 
            line.startsWith('=== STREAM START [')) {
            
            if (inEntry) {
                entries.push(currentEntry);
            }
            
            currentEntry = line;
            inEntry = true;
        } else if (line.startsWith('=== END REQUEST') || 
                  line.startsWith('=== END RESPONSE') || 
                  line.startsWith('=== STREAM END [')) {
            
            currentEntry += '\n' + line;
            entries.push(currentEntry);
            currentEntry = '';
            inEntry = false;
        } else if (inEntry) {
            currentEntry += '\n' + line;
        }
    });
    
    // Add the last entry if there is one
    if (inEntry && currentEntry) {
        entries.push(currentEntry);
    }
    
    callback(entries);
};

// Main function
const main = () => {
    console.log(`Reading log file: ${MODEL_COMMS_LOG_FILE}`);
    
    if (tail) {
        // Initial read
        parseLogFile(processLogEntries);
        
        // Then watch for changes
        console.log('\nWatching for new log entries (Ctrl+C to exit)...\n');
        
        let lastSize = fs.statSync(MODEL_COMMS_LOG_FILE).size;
        
        // Check for changes every second
        setInterval(() => {
            try {
                const stats = fs.statSync(MODEL_COMMS_LOG_FILE);
                if (stats.size > lastSize) {
                    // File has grown, read the new content
                    const newContent = fs.readFileSync(
                        MODEL_COMMS_LOG_FILE, 
                        { encoding: 'utf8', start: lastSize, end: stats.size }
                    );
                    
                    // Print the new content
                    if (newContent.trim()) {
                        console.log(newContent);
                    }
                    
                    lastSize = stats.size;
                }
            } catch (error) {
                console.error(`Error watching log file: ${error.message}`);
            }
        }, 1000);
    } else {
        // Just read once
        parseLogFile(processLogEntries);
    }
};

// Run the main function
main();