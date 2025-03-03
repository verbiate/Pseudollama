const http = require('http');
const httpProxy = require('http-proxy');

const PORT = 11434; // Standard Ollama port
const TARGET_PORT = 12345; // Our PseudoLlama server port

// Create a proxy server
const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${TARGET_PORT}`,
    changeOrigin: true
});

// Log proxy events
proxy.on('proxyReq', (proxyReq, req, res, options) => {
    console.log(`\n[PROXY REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    console.log(`[PROXY RESPONSE] Status: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
});

proxy.on('error', (err, req, res) => {
    console.error('[PROXY ERROR]', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + err.message);
});

// Create the server
const server = http.createServer((req, res) => {
    // Log the request
    console.log(`\n[PROXY] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Forward the request to the target server
    proxy.web(req, res);
});

// Start the server
server.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
    console.log(`Forwarding requests to http://localhost:${TARGET_PORT}`);
});