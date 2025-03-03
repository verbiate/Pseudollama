# PseudoLlama Project Overview

## Project Purpose

PseudoLlama is a server designed to simulate various LLM API responses without requiring the computational resources to run actual large language models. It acts as a middleware/proxy that can be used for testing, development, and demonstration purposes.

The server implements API endpoints that mimic both Ollama and OpenAI-compatible interfaces, making it versatile for a wide range of application testing scenarios.

## Current Functionality

- Simulates Ollama API endpoints (`/api/chat`, `/api/generate`, etc.)
- Supports OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/completions`, etc.)
- Serves content from a configurable text file
- Includes a web UI for editing content and testing the server
- Supports both streaming and non-streaming responses
- Runs on a fixed port (12345) for consistent integration testing

## Enhancement Goals

The project is being enhanced to support three types of pseudo-models selectable via the web UI:

1. **Remote Model Integration**
   - Connect to actual LLMs via OpenRouter
   - Allow users to specify their OpenRouter API key
   - Provide a dropdown for selecting from available OpenRouter models
   - Pass through real responses from these models via our spoofed Ollama server

2. **Local Model Integration**
   - Connect to locally running LLMs via LMStudio
   - Allow users to specify LMStudio URL and port
   - Fetch and display available models from the connected LMStudio instance
   - Pipe responses from the local LLM through our server

3. **Text Simulation**
   - Allow users to specify a fixed text response
   - Provide option to simulate streaming of this predefined output
   - Useful for predictable testing scenarios that don't require actual LLM responses

These enhancements will make PseudoLlama a more versatile testing tool that can switch between mock responses, local LLMs, and remote LLMs, all while maintaining the same API interface for client applications.

## Technical Architecture

PseudoLlama consists of:
- An Express server implementing the API endpoints
- A proxy layer for forwarding requests to appropriate backends
- A web UI for configuration and testing
- Data storage for maintaining configuration and response templates

The server maintains compatibility with both Ollama-style and OpenAI-style requests, translating between formats as needed when communicating with different backend services.

## Development Progress

### March 2, 2025
- Analyzed current UI layout and identified sections that need modification for the three model types
- The current UI needs to be updated to support:
  - OpenRouter integration (partially implemented)
  - LMStudio integration (new)
  - Text Simulation option (new)
- Reviewed UI mockup showing the three model type sections:
  - Remote model (via OpenRouter) with API key input and model selection
  - Local model (via LM Studio) with URL/port input and model selection
  - Text simulation with a text area for the response and a toggle for streaming
  - Each section has an active/inactive indicator
- Modified HTML structure in index.html to include containers for all three model types:
  - Added model type selection dropdown
  - Created separate sections for each model type with active/inactive indicators
  - Added appropriate form fields for each model type
  - Updated JavaScript to handle the new UI elements and model type switching
- Added CSS styles for the new UI elements:
  - Styled the model selection container
  - Added styles for model section headers with active/inactive indicators
  - Created styles for section dividers
  - Added styles for small buttons and toggle switches
  - Ensured consistent spacing and visual hierarchy
- Implemented Remote Model Integration (OpenRouter):
  - Created HTML form elements for OpenRouter configuration
  - Added API key input field with validation (must start with "sk-or-")
  - Added model selection dropdown with popular OpenRouter models
  - Implemented endpoint to fetch available models from OpenRouter API
  - Updated server.js to handle the new configuration format
  - Modified the processChatRequest function to use the configured OpenRouter model
  - Created searchable dropdown component to display available OpenRouter models:
    - Implemented dynamic model fetching from OpenRouter API
    - Added search functionality to filter models by name or ID
    - Improved error handling and user feedback
    - Added sorting of models alphabetically by name
    - Added count of available models
    - Enhanced validation of API key format
  - Added UI indicators to show connection status to OpenRouter:
    - Created connection status indicator with visual feedback
    - Implemented "Test Connection" button to verify API key validity
    - Added automatic connection testing when API key changes
    - Added visual indicators for connection states (connecting, connected, error)
    - Improved error messaging for connection issues
  - Implemented Local Model Integration (LMStudio) form elements:
    - Created HTML form elements for LMStudio configuration
    - Added URL input field with validation
    - Added optional API key field for authentication
    - Implemented connection test functionality with visual feedback
    - Added advanced settings section with timeout and max tokens options
    - Created searchable dropdown for model selection
  - Implemented LMStudio backend integration:
    - Created endpoint to fetch available models from LMStudio
    - Implemented proper error handling for connection issues
    - Added timeout and authentication support
    - Connected frontend to backend for real model fetching
    - Implemented model sorting and filtering
    - Added connection status indicators with real-time feedback

### March 3, 2025
- Completed Text Simulation Option implementation:
  - Created HTML form elements for text simulation
  - Added textarea for custom response content with character count
  - Implemented character count display and validation
  - Added toggle switch for streaming simulation
- Completed Model Type Selection implementation:
  - Created dropdown for model type selection
  - Added visual indicators for active/inactive model types
  - Implemented persistence of selections
- Completed Backend Configuration Storage:
  - Updated config.json schema to support new model types and settings
  - Modified server.js to handle updated configuration format
  - Updated configuration API endpoints in server.js
  - Implemented validation for different configuration types
  - Added migration logic for existing configurations
- Completed Backend API for LMStudio:
  - Researched LMStudio API specification
  - Implemented connection and authentication to LMStudio
  - Added error handling for LMStudio connection issues
  - Implemented response format translation between LMStudio and Ollama formats
- Completed Model Testing UI:
  - Created test button and response area in HTML
  - Implemented JavaScript for sending test requests
  - Added loading indicators during test execution
- Completed Response Streaming Support:
  - Updated frontend to handle streaming responses from all model types
  - Added streaming simulation for text-based responses
  - Created stream handling for OpenRouter responses
  - Implemented stream handling for LMStudio responses
- Completed Integration Testing:
  - Created test cases for each model type
  - Tested OpenRouter integration with various models
  - Tested LMStudio integration with local models
  - Tested text simulation with various content sizes
  - Tested fallback mechanisms when primary model type is unavailable

### March 4, 2025
- Fixed LMStudio integration issue:
  - Identified bug where LMStudio model selection was outputting static text content instead of connecting to LMStudio
  - Added LMStudio-specific handling in the processChatRequest function
  - Implemented proper request forwarding to LMStudio API
  - Added support for both streaming and non-streaming responses
  - Enhanced error handling with specific error messages for different failure scenarios
  - Added debug logging to diagnose model selection issues
  - Fixed condition to properly identify LMStudio requests

### March 5, 2025
- Fixed Text Simulation model issue:
  - Identified bug where text simulation was returning pattern matching errors
  - Added specific handling for text simulation model type in processChatRequest function
  - Implemented proper text content handling using configured text content
  - Added support for both streaming and non-streaming responses
  - Enhanced logging to better track request processing flow

### March 6, 2025
- Fixed remaining model selection issues:
  - Added more comprehensive debug logging throughout the model selection process
  - Fixed LMStudio condition to explicitly check for 'lmstudio:latest' model name
  - Improved Text Simulation condition to avoid conflicts with other model types
  - Added detailed logging of model parameters to help diagnose routing issues
  - Ensured proper model type priority: explicit model name takes precedence over selectedModelType