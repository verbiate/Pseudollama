# PseudoLlama Server

A server that simulates Ollama API responses with custom content.

## Overview

PseudoLlama is a simple Express server that mimics the Ollama API. It serves content from a text file as responses to API requests, making it useful for testing applications that integrate with Ollama without needing to run a full LLM.

## Features

- Simulates Ollama API endpoints (`/api/chat`, `/api/generate`, etc.)
- Also supports OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/completions`, etc.)
- Serves content from a configurable text file
- Web UI for editing the content and testing the server
- Supports both streaming and non-streaming responses

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
```

The server runs on port 12345 by default. This is a fixed port for testing purposes.

**IMPORTANT**: When connecting to this server from other tools, you must specify port 12345 in your configuration.

## API Endpoints

### Ollama-style Endpoints

- `POST /api/chat` - Chat completions
- `POST /api/generate` - Text generation
- `POST /api/embeddings` - Generate embeddings
- `GET /api/tags` - List available models
- `POST /api/pull` - Simulate model pulling

### OpenAI-compatible Endpoints

- `POST /v1/chat/completions` - Chat completions
- `POST /v1/completions` - Text completions
- `POST /v1/embeddings` - Generate embeddings
- `GET /v1/models` - List available models

### Server Management

- `GET /api/server/status` - Check server status
- `POST /api/server/toggle` - Enable/disable the server
- `GET /api/content` - Get the current content
- `POST /api/content` - Update the content

## Web UI

Access the web UI by navigating to `http://localhost:12345` in your browser. The UI allows you to:

- View and edit the content that will be returned by the API
- Test the API by sending a request to the server
- Enable/disable the server

## Configuration

The content served by the API is stored in `data/content.txt`. You can edit this file directly or use the web UI.