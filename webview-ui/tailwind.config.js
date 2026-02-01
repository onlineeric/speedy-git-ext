/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vscode: {
          foreground: 'var(--vscode-foreground)',
          background: 'var(--vscode-editor-background)',
          'panel-background': 'var(--vscode-panel-background)',
          'input-background': 'var(--vscode-input-background)',
          'input-foreground': 'var(--vscode-input-foreground)',
          'input-border': 'var(--vscode-input-border)',
          'button-background': 'var(--vscode-button-background)',
          'button-foreground': 'var(--vscode-button-foreground)',
          'button-hover': 'var(--vscode-button-hoverBackground)',
          'list-hover': 'var(--vscode-list-hoverBackground)',
          'list-active': 'var(--vscode-list-activeSelectionBackground)',
          'badge-background': 'var(--vscode-badge-background)',
          'badge-foreground': 'var(--vscode-badge-foreground)',
          border: 'var(--vscode-panel-border)',
        },
      },
    },
  },
  plugins: [],
};
