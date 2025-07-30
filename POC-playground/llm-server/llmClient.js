"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTestsWithOllama = generateTestsWithOllama;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function generateTestsWithOllama(componentSource) {
    // Instruction prompt for the model
    const promptInstruction = `
You are an expert React Testing Library and Jest developer.
Generate a complete and valid TypeScript test file for the given React component.
Output only valid TypeScript test code.
Do NOT include any explanations, code block fences (like \`\`\`), or extra text. 
Start at the first import statement and end at the last closing bracket of the test suite. 
No extra commentary or description.

<Component code here>
`;
    const fullPrompt = promptInstruction + '\n\nComponent code:\n' + componentSource;
    const response = await (0, node_fetch_1.default)('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-r1',
            prompt: fullPrompt,
            stream: false
        })
    });
    const data = (await response.json());
    if (!data ||
        typeof data.response !== 'string' ||
        data.response.trim().length === 0) {
        throw new Error(`No usable response from Ollama: ${JSON.stringify(data)}`);
    }
    return cleanGeneratedTestCode(data.response);
}
/**
 * Clean the generated code by stripping markdown fences or extra whitespace.
 */
function cleanGeneratedTestCode(raw) {
    let cleaned = raw.trim();
    // Remove starting and ending triple backticks and optional 'typescript'
    if (cleaned.startsWith('```typescript')) {
        cleaned = cleaned.slice('```typescript'.length).trimStart();
    }
    else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3).trimStart();
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3).trimEnd();
    }
    cleaned = cleaned.split('</think>')[1];
    cleaned = cleaned.replace('```typescript', '').trim();
    cleaned = cleaned.replace('```tsx', '').trim();
    cleaned = cleaned.replace('```', '').trim();
    return cleaned;
}
//# sourceMappingURL=llmClient.js.map