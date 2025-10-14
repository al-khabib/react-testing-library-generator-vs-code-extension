import React from 'react';
import { ServiceStatus } from '../types';

interface StatusProps {
  status?: ServiceStatus;
}

const Status: React.FC<StatusProps> = ({ status }) => {
  const healthy = status?.healthy ?? false;
  const label = healthy ? 'Connected' : 'Disconnected';
  const description =
    status?.message ??
    (healthy ? 'All services are reachable.' : 'Unable to connect to services.');

  return (
    <div className="rounded border border-border bg-background p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Service Status</h2>
          <p className="text-xs text-muted">
            {status?.lastChecked
              ? `Last checked: ${new Date(status.lastChecked).toLocaleTimeString()}`
              : 'Status has not been checked yet.'}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            healthy ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
          }`}
        >
          {label}
        </span>
      </div>
      <p className="mt-3 text-sm">{description}</p>
    </div>
  );
};

export default Status;
