import React, { useEffect, useMemo, useState } from 'react'
import type { GeneratedTest } from '../types'
import { postMessage } from '../vscode'
import type {
  GenerationPhase,
  PanelComponentInfo,
  PanelMessageFromExtension
} from './types'

const formatTimestamp = (iso?: string): string => {
  if (!iso) {
    return ''
  }
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const extractMetadataEntries = (
  generatedTest: GeneratedTest | null
): Array<[string, string]> => {
  if (!generatedTest) {
    return []
  }

  const entries: Array<[string, string]> = []

  if (generatedTest.generatedAt) {
    entries.push(['Generated', formatTimestamp(generatedTest.generatedAt)])
  }

  if (generatedTest.model) {
    entries.push(['Model', generatedTest.model])
  }

  if (generatedTest.summary) {
    entries.push(['Summary', generatedTest.summary])
  }

  if (generatedTest.relativePath) {
    entries.push(['Last Saved', generatedTest.relativePath])
  }

  if (generatedTest.metadata && typeof generatedTest.metadata === 'object') {
    Object.entries(generatedTest.metadata).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        entries.push([
          key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
          String(value)
        ])
      }
    })
  }

  return entries
}

const PanelApp: React.FC = () => {
  const [component, setComponent] = useState<PanelComponentInfo | null>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [instructions, setInstructions] = useState<string>('')
  const [generatedTest, setGeneratedTest] = useState<GeneratedTest | null>(null)
  const [phase, setPhase] = useState<GenerationPhase>('loading')
  const [statusMessage, setStatusMessage] = useState<string>(
    'Preparing initial test output…'
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')

  useEffect(() => {
    const handler = (event: MessageEvent<PanelMessageFromExtension>) => {
      const message = event.data
      switch (message.type) {
        case 'init': {
          const initialInstructions =
            typeof message.payload.generatedTest.metadata?.instructions ===
            'string'
              ? (message.payload.generatedTest.metadata.instructions as string)
              : ''
          setComponent(message.payload.component)
          setDisplayName(message.payload.component.displayName)
          setGeneratedTest(message.payload.generatedTest)
          setInstructions(initialInstructions)
          setPhase('idle')
          setStatusMessage(
            'Review the generated test before approving or regenerating.'
          )
          setErrorMessage(null)
          setIsEditing(false)
          break
        }
        case 'generation:started':
          setPhase('loading')
          setStatusMessage('Regenerating test with updated instructions…')
          setErrorMessage(null)
          setIsEditing(false)
          break
        case 'generation:success':
          setGeneratedTest(message.payload.generatedTest)
          setPhase('idle')
          setStatusMessage(
            'Generation complete. Review the updated test before approving.'
          )
          setErrorMessage(null)
          setIsEditing(false)
          break
        case 'generation:error':
          setPhase('error')
          setErrorMessage(message.payload.message)
          setStatusMessage(
            'Generation failed. Adjust instructions and try again.'
          )
          break
        case 'file:saved':
          setPhase('saved')
          setStatusMessage(
            message.payload.relativePath
              ? `Test saved to ${message.payload.relativePath}.`
              : `Test saved to ${message.payload.filePath}.`
          )
          setErrorMessage(null)
          setGeneratedTest((current) =>
            current
              ? {
                  ...current,
                  content: editedContent,
                  relativePath:
                    message.payload.relativePath ?? message.payload.filePath
                }
              : current
          )
          break
        case 'file:saveError':
          setPhase('error')
          setErrorMessage(message.payload.message)
          break
        default:
          break
      }
    }

    window.addEventListener('message', handler)
    postMessage('ready')

    return () => {
      window.removeEventListener('message', handler)
    }
  }, [])

  useEffect(() => {
    if (generatedTest) {
      setEditedContent(generatedTest.content)
    } else {
      setEditedContent('')
    }
  }, [generatedTest])

  const metadataEntries = useMemo(
    () => extractMetadataEntries(generatedTest),
    [generatedTest]
  )

  const handleRegenerate = () => {
    const trimmedInstructions = instructions.trim()
    const trimmedName = displayName.trim()
    postMessage('regenerate', {
      instructions: trimmedInstructions.length
        ? trimmedInstructions
        : undefined,
      displayName: trimmedName.length ? trimmedName : component?.name
    })
    setIsEditing(false)
  }

  const handleRetry = () => {
    const trimmedInstructions = instructions.trim()
    const trimmedName = displayName.trim()
    postMessage('retry', {
      instructions: trimmedInstructions.length
        ? trimmedInstructions
        : undefined,
      displayName: trimmedName.length ? trimmedName : component?.name
    })
  }

  const handleApprove = () => {
    const trimmedName = displayName.trim()
    postMessage('approve', {
      displayName: trimmedName.length ? trimmedName : component?.name,
      content: editedContent
    })
  }

  const handleCopy = () => {
    if (!editedContent) {
      return
    }
    postMessage('copy', { content: editedContent })
    setStatusMessage('Test content copied to clipboard.')
    setErrorMessage(null)
  }

  const handleClose = () => {
    postMessage('close')
  }

  return (
    <div className='flex h-full flex-col space-y-4 p-4'>
      {component && (
        <header className='rounded border border-border bg-background p-4 shadow-panel'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-base font-semibold'>
                {component.displayName}
              </h1>
              <p className='text-xs text-muted'>{component.filePath}</p>
            </div>
            <span className='rounded-full bg-info/10 px-3 py-1 text-xs uppercase text-info'>
              {component.source === 'selection'
                ? 'Selection'
                : 'Entire Component'}
            </span>
          </div>
        </header>
      )}

      {errorMessage ? (
        <div className='rounded border border-error bg-error/20 p-3 text-xs text-error'>
          <p className='mb-2 font-medium'>Generation failed</p>
          <p className='mb-3 whitespace-pre-wrap'>{errorMessage}</p>
          <button
            type='button'
            className='rounded bg-error px-3 py-1 text-xs font-medium text-white hover:bg-error/80'
            onClick={handleRetry}
            disabled={phase === 'loading'}
          >
            Retry Last Request
          </button>
        </div>
      ) : (
        <div className='rounded border border-border bg-background p-3 text-xs text-muted'>
          <p className='font-medium text-foreground'>{statusMessage}</p>
          {metadataEntries.length > 0 && (
            <dl className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1'>
              {metadataEntries.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className='text-muted'>{label}</dt>
                  <dd className='text-foreground'>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>
      )}

      <section className='flex-1 overflow-auto rounded border border-border bg-[var(--vscode-editor-background)] p-3 shadow-panel'>
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-sm font-semibold'>Generated Test Preview</h2>
          <label className='inline-flex cursor-pointer items-center gap-3 rounded border border-border bg-background px-3 py-1'>
            <span className='text-xs font-medium text-muted'>
              {isEditing ? 'Preview Unlocked' : 'Preview Locked'}
            </span>
            <span className='relative inline-flex h-5 w-9 items-center'>
              <input
                type='checkbox'
                className='peer sr-only'
                checked={isEditing}
                onChange={() => setIsEditing((prev) => !prev)}
                disabled={!generatedTest || phase === 'loading'}
              />
              <span className='absolute inset-0 rounded-full bg-border transition peer-checked:bg-accent peer-disabled:opacity-50' />
              <span className='absolute left-1 top-1 h-3 w-3 rounded-full bg-[var(--vscode-editor-background)] transition peer-checked:translate-x-4 peer-checked:bg-white peer-disabled:opacity-70' />
            </span>
          </label>
        </div>
        {generatedTest ? (
          <textarea
            value={editedContent}
            onChange={(event) => setEditedContent(event.target.value)}
            readOnly={!isEditing}
            spellCheck={false}
            style={{ width: '80%', height: '25rem', margin: '0 auto' }}
            className={`h-[60vh] w-full resize-none rounded border border-border bg-[var(--vscode-editor-background)] p-3 font-mono text-xs ${
              isEditing
                ? 'focus:outline-none focus:ring-2 focus:ring-accent'
                : 'cursor-not-allowed'
            }`}
          />
        ) : (
          <p
            className='text-xs text-muted'
            style={{ width: '80%', height: '25rem', margin: '0 auto' }}
          >
            Generated test content will appear here.
          </p>
        )}
      </section>

      <section className='space-y-3'>
        <div>
          <label
            className='mb-1 block text-xs font-medium'
            htmlFor='displayName'
          >
            Component Name
          </label>
          <input
            id='displayName'
            type='text'
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className='w-full rounded border border-border bg-background px-3 py-2 text-sm'
            placeholder='Display name used for the generated test file'
            disabled={phase === 'loading'}
          />
        </div>

        <div>
          <label
            className='mb-1 block text-xs font-medium'
            htmlFor='instructions'
          >
            Additional Instructions (optional)
          </label>
          <textarea
            id='instructions'
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className='h-24 w-full resize-none rounded border border-border bg-background px-3 py-2 text-sm'
            placeholder='Explain how you want the regenerated test to differ...'
            disabled={phase === 'loading'}
          />
        </div>
      </section>

      <footer className='sticky bottom-0 flex flex-col gap-3 border-t border-border pt-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <button
            type='button'
            className='rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-[var(--vscode-editor-background)]'
            onClick={handleCopy}
            disabled={phase === 'loading' || !generatedTest}
          >
            Copy to Clipboard
          </button>
          <button
            type='button'
            className='rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-[var(--vscode-editor-background)]'
            onClick={handleClose}
          >
            Close Panel
          </button>
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <button
            type='button'
            className='rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentHover disabled:opacity-70'
            onClick={handleRegenerate}
            disabled={phase === 'loading'}
          >
            {phase === 'loading' ? 'Regenerating…' : 'Regenerate with Prompt'}
          </button>
          <button
            type='button'
            className='rounded bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/80 disabled:opacity-70'
            onClick={handleApprove}
            disabled={phase === 'loading' || !generatedTest}
          >
            Approve &amp; Create File
          </button>
        </div>
      </footer>
    </div>
  )
}

export default PanelApp
