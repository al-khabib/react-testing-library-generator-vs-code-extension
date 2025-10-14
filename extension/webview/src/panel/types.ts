import type { GeneratedTest } from '../types';

export type GenerationPhase = 'idle' | 'loading' | 'error' | 'saved';

export interface PanelComponentInfo {
  name: string;
  displayName: string;
  filePath: string;
  source: 'full' | 'selection';
}

export interface InitMessagePayload {
  component: PanelComponentInfo;
  generatedTest: GeneratedTest;
}

export type PanelMessageFromExtension =
  | { type: 'init'; payload: InitMessagePayload }
  | { type: 'generation:started' }
  | { type: 'generation:success'; payload: { generatedTest: GeneratedTest } }
  | { type: 'generation:error'; payload: { message: string } }
  | { type: 'file:saved'; payload: { filePath: string; relativePath?: string } }
  | { type: 'file:saveError'; payload: { message: string } };

export type PanelMessageToExtension =
  | { type: 'ready' }
  | { type: 'regenerate'; payload: { instructions?: string; displayName?: string } }
  | { type: 'retry'; payload?: { instructions?: string; displayName?: string } }
  | { type: 'approve'; payload: { displayName?: string; content?: string } }
  | { type: 'copy'; payload?: { content?: string } }
  | { type: 'close' };
