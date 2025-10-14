import React from 'react';
import { GeneratedTest } from '../types';

interface TestPreviewProps {
  generatedTest?: GeneratedTest;
  isGenerating: boolean;
  onGenerate: () => void;
}

const TestPreview: React.FC<TestPreviewProps> = ({ generatedTest, isGenerating, onGenerate }) => {
  const handleGenerateClick = () => {
    onGenerate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Generated Test</h2>
        <button
          type="button"
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accentHover disabled:opacity-70"
          onClick={handleGenerateClick}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating…' : 'Generate Test'}
        </button>
      </div>
      {generatedTest ? (
        <div className="rounded border border-border bg-[var(--vscode-editor-background)] p-3 shadow-panel">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{generatedTest.fileName}</span>
            <span>
              {generatedTest.generatedAt
                ? new Date(generatedTest.generatedAt).toLocaleTimeString()
                : '—'}
            </span>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded bg-[var(--vscode-editor-background)] p-2 font-mono text-xs">
            {generatedTest.content}
          </pre>
        </div>
      ) : (
        <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted">
          No test generated yet. Click &ldquo;Generate Test&rdquo; to create one.
        </div>
      )}
    </div>
  );
};

export default TestPreview;
