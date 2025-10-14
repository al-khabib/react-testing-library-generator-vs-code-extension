import React, { useState } from 'react';
import { ExtensionSettings } from '../types';
import { postMessage } from '../vscode';

interface SettingsProps {
  settings?: ExtensionSettings;
}

const Settings: React.FC<SettingsProps> = ({ settings }) => {
  const [formState, setFormState] = useState<ExtensionSettings>(
    settings ?? {
      apiGatewayUrl: 'http://localhost:3000',
      testOutputDirectory: '__tests__',
      autoSaveGeneratedTests: false
    }
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleChange = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    setFormState(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      postMessage('updateSettings', formState);
      setFeedback('Settings saved successfully.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="apiGatewayUrl">
          API Gateway URL
        </label>
        <input
          id="apiGatewayUrl"
          type="url"
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          value={formState.apiGatewayUrl}
          onChange={event => handleChange('apiGatewayUrl', event.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="testOutputDirectory">
          Test Output Directory
        </label>
        <input
          id="testOutputDirectory"
          type="text"
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          value={formState.testOutputDirectory}
          onChange={event => handleChange('testOutputDirectory', event.target.value)}
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          id="autoSaveGeneratedTests"
          type="checkbox"
          className="h-4 w-4 accent-accent"
          checked={formState.autoSaveGeneratedTests}
          onChange={event => handleChange('autoSaveGeneratedTests', event.target.checked)}
        />
        <label className="text-sm" htmlFor="autoSaveGeneratedTests">
          Automatically save generated tests
        </label>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentHover disabled:opacity-70"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {feedback && <span className="text-xs text-muted">{feedback}</span>}
      </div>
    </form>
  );
};

export default Settings;
