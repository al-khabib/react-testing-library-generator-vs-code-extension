# RTLGen - React Testing Library Test Generator

A VS Code extension that automatically generates React Testing Library tests using DeepSeek Coder v2 running locally via Ollama.

## Architecture

This is a monorepo containing:

- **apps/vscode-extension** - VS Code extension with UI and commands
- **services/api-gateway** - HTTP gateway (port 7070)
- **services/model-service** - Ollama/DeepSeek v2 proxy (port 7071)
- **services/template-service** - Test templates and rules (port 7072)
- **services/dataset-service** - Dataset processing and RAG (port 7073)
- **services/fine-tune-service** - Model fine-tuning (port 7074)
- **packages/shared** - Shared types and utilities

## Quick Start

1. **Prerequisites:**
   Install Ollama
   curl -fsSL https://ollama.com/install.sh | sh

Pull DeepSeek Coder v2
ollama pull deepseek-coder-v2

2. **Install dependencies:**
   pnpm install

3. **Start all services:**
   pnpm dev
4. **Debug VS Code extension:**

- Open `apps/vscode-extension` in VS Code
- Press F5 to launch Extension Development Host

## Development

- `pnpm dev` - Start all services and extension in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all packages

## Hardware Requirements

- macOS (tested on MacBook Pro 14", 16GB RAM)
- Node.js 20+
- Ollama with DeepSeek Coder v2 model
