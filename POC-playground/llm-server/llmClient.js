"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTestsWithOllama = generateTestsWithOllama;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function generateTestsWithOllama(componentSource) {
    const response = await (0, node_fetch_1.default)('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'deepseek-r1', // Or your chosen model
            prompt: `You are an expert React Testing Library developer. Given this TypeScript React component, generate a comprehensive RTL test suite for it.

Component code:
${componentSource}`,
            stream: false // non-streamed
        })
    });
    const data = await response.json();
    // Robust check: look for common fields
    if (data &&
        typeof data.response === 'string' &&
        data.response.trim().length > 0) {
        return data.response;
    }
    if (data && data.error) {
        throw new Error(`Ollama error: ${data.error}`);
    }
    throw new Error(`No usable response from Ollama. Raw: ${JSON.stringify(data)}`);
}
//# sourceMappingURL=llmClient.js.map