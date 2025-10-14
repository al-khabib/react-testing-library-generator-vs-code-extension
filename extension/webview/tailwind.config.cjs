const vscodeColors = {
  foreground: 'var(--vscode-foreground)',
  background: 'var(--vscode-editor-background)',
  muted: 'var(--vscode-editorLineNumber-foreground)',
  accent: 'var(--vscode-button-background)',
  accentHover: 'var(--vscode-button-hoverBackground)',
  border: 'var(--vscode-editorWidget-border)',
  error: 'var(--vscode-inputValidation-errorBackground)',
  warning: 'var(--vscode-inputValidation-warningBackground)',
  success: 'var(--vscode-testing-iconPassed)',
  info: 'var(--vscode-editorInfo-foreground)'
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        foreground: vscodeColors.foreground,
        background: vscodeColors.background,
        muted: vscodeColors.muted,
        accent: vscodeColors.accent,
        accentHover: vscodeColors.accentHover,
        border: vscodeColors.border,
        error: vscodeColors.error,
        warning: vscodeColors.warning,
        success: vscodeColors.success,
        info: vscodeColors.info
      },
      fontFamily: {
        sans: ['var(--vscode-font-family)', 'Inter', 'sans-serif'],
        mono: ['var(--vscode-editor-font-family)', 'monospace']
      },
      boxShadow: {
        panel: '0 2px 8px rgba(0, 0, 0, 0.2)'
      }
    }
  },
  plugins: []
};
