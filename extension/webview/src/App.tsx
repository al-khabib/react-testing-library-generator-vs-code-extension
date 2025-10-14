import React, { useEffect, useMemo, useState } from 'react';
import { ExtensionSettings, GeneratedTest, HistoryItem, ServiceStatus, WebviewMessage } from './types';
import Settings from './components/Settings';
import Status from './components/Status';
import TestPreview from './components/TestPreview';
import History from './components/History';
import { getState, postMessage, setState } from './vscode';

type TabKey = 'status' | 'test' | 'history' | 'settings';

interface PersistedState {
  activeTab: TabKey;
  history: HistoryItem[];
  latestTest?: GeneratedTest & { componentName: string };
  status?: ServiceStatus;
  settings?: ExtensionSettings;
}

const initialState: PersistedState = {
  activeTab: 'status',
  history: [],
  latestTest: undefined,
  status: undefined,
  settings: undefined
};

const tabs: { key: TabKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'test', label: 'Test Preview' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'Settings' }
];

const App: React.FC = () => {
  const persisted = useMemo<PersistedState>(() => getState<PersistedState>() ?? initialState, []);

  const [activeTab, setActiveTab] = useState<TabKey>(persisted.activeTab);
  const [settings, setSettings] = useState<ExtensionSettings | undefined>(persisted.settings);
  const [status, setStatus] = useState<ServiceStatus | undefined>(persisted.status);
  const [history, setHistory] = useState<HistoryItem[]>(persisted.history);
  const [latestTest, setLatestTest] = useState<(GeneratedTest & { componentName: string }) | undefined>(
    persisted.latestTest
  );
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setState({
      activeTab,
      history,
      latestTest,
      status,
      settings
    });
  }, [activeTab, history, latestTest, status, settings]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'settings':
          setSettings(message.payload);
          setError(null);
          break;
        case 'status':
          setStatus(message.payload);
          setError(null);
          break;
        case 'history':
          setHistory(message.payload);
          setError(null);
          break;
        case 'testGenerated':
          setIsGenerating(false);
          setLatestTest(message.payload);
          setHistory(prev => [
            {
              componentName: message.payload.componentName,
              filePath: message.payload.relativePath ?? '',
              timestamp: message.payload.generatedAt ?? new Date().toISOString(),
              status: 'success',
              generatedTest: message.payload
            },
            ...prev
          ]);
          setActiveTab('test');
          setError(null);
          break;
        case 'error':
          setIsGenerating(false);
          setError(message.payload);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    postMessage('getSettings');
    postMessage('getStatus');
    postMessage('getHistory');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [error]);

  const handleGenerateFromWebview = () => {
    setIsGenerating(true);
    postMessage('generateTest');
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <nav className="flex space-x-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`rounded px-3 py-1 text-xs font-medium ${
              activeTab === tab.key
                ? 'bg-accent text-white'
                : 'bg-[var(--vscode-editor-background)] text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="rounded border border-error bg-error/20 p-2 text-xs text-error">
          {error}
        </div>
      )}

      <section className="flex-1 overflow-auto">
        {activeTab === 'status' && <Status status={status} />}
        {activeTab === 'test' && (
          <TestPreview
            generatedTest={
              latestTest
                ? {
                    fileName: latestTest.fileName,
                    content: latestTest.content,
                    generatedAt: latestTest.generatedAt,
                    relativePath: latestTest.relativePath
                  }
                : undefined
            }
            isGenerating={isGenerating}
            onGenerate={handleGenerateFromWebview}
          />
        )}
        {activeTab === 'history' && <History history={history} />}
        {activeTab === 'settings' && <Settings settings={settings} />}
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentHover disabled:opacity-70"
          onClick={handleGenerateFromWebview}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating…' : 'Generate Test'}
        </button>
      </div>
    </div>
  );
};

export default App;
