import fetch from 'node-fetch'

export async function* generateTestsStreamWithOllama(
  componentSource: string
): AsyncGenerator<string, void, unknown> {
  // Instruction prompt for the model
  const promptInstruction = `
You are a code generator for Jest and React Testing Library.
You must generate a TypeScript test file for the provided React component.
STRICT RULES:
- Output ONLY the valid TypeScript RTL+Jest code as it would appear in a .test.tsx file.
- NO markdown code fences.
- NO <think> tags, explanations, steps, context, or any non-code lines.
- NO bullet points, headers, or summary.
- Do not include anything except the code lines to be saved to the test file.
- Begin with the first import statement and end at the last closing bracket.
If you output anything else, it will cause the file to fail to compile.

BAD output example (do NOT do):
<think>
We will...
- Import modules
- Write a test

GOOD output example (DO this):

import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});

Now, generate the test file for this component:
<-- REACT COMPONENT CODE HERE -->

`

  const fullPrompt =
    promptInstruction + '\n\nComponent code:\n' + componentSource

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-coder-v2',
      prompt: fullPrompt,
      stream: true
    })
  })

  if (!response.ok || !response.body) {
    throw new Error('Failed to stream response from Ollama')
  }

  // Node.js readable stream can be read via async iterator
  for await (const chunk of response.body as any as AsyncIterable<Buffer>) {
    const chunkStr = chunk.toString('utf-8')

    // Sometimes chunkStr contains multiple JSON objects concatenated; split by newline
    const lines = chunkStr.split('\n').filter((line) => line.trim())

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.response) {
          // Yield only the textual content from parsed response field
          yield parsed.response
        }
      } catch (e) {
        // Ignore JSON parsing errors for partial chunks
        // Optionally log for debugging
      }
    }
  }

  // const data = (await response.json()) as { response: string }

  // if (
  //   !data ||
  //   typeof data.response !== 'string' ||
  //   data.response.trim().length === 0
  // ) {
  //   throw new Error(`No usable response from Ollama: ${JSON.stringify(data)}`)
  // }

  // Clean the full response and return
  // const cleanedCode = cleanGeneratedTestCode(fullResponse)
  // if (!cleanedCode || cleanedCode.length === 0) {
  //   throw new Error(
  //     `No usable response from Ollama: ${JSON.stringify(fullResponse)}`
  //   )
  // }

  // return cleanedCode
}

/**
 * Clean the generated code by stripping markdown fences or extra whitespace.
 */
function cleanGeneratedTestCode(raw: string): string {
  let cleaned = raw.trim()

  // Remove starting and ending triple backticks and optional 'typescript'
  if (cleaned.startsWith('```typescript')) {
    cleaned = cleaned.slice('```typescript'.length).trimStart()
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3).trimStart()
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trimEnd()
  }

  cleaned = cleaned.split('</think>')[1]
  cleaned = cleaned.replace('```typescript', '').trim()
  cleaned = cleaned.replace('```tsx', '').trim()
  cleaned = cleaned.replace('```', '').trim()

  return cleaned
}
