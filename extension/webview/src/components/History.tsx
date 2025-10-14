import React from 'react';
import { HistoryItem } from '../types';

interface HistoryProps {
  history: HistoryItem[];
}

const statusColor: Record<HistoryItem['status'], string> = {
  success: 'text-success',
  error: 'text-error',
  pending: 'text-warning'
};

const History: React.FC<HistoryProps> = ({ history }) => {
  if (!history.length) {
    return (
      <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted">
        No history yet. Generated tests will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-3 text-sm">
      {history.map(item => (
        <li key={item.timestamp} className="rounded border border-border bg-background p-3 shadow-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{item.componentName}</h3>
            <span className={`${statusColor[item.status]} text-xs uppercase`}>
              {item.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{item.filePath}</p>
          <p className="mt-2 text-xs text-muted">
            {new Date(item.timestamp).toLocaleString()}
          </p>
          {item.errorMessage && (
            <p className="mt-2 text-xs text-error">{item.errorMessage}</p>
          )}
        </li>
      ))}
    </ul>
  );
};

export default History;
