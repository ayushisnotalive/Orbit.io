import type { FC } from 'hono/jsx';

interface StatusBadgeProps {
  status: 'UP' | 'DOWN' | 'PAUSED' | 'NEW' | string;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status }) => {
  const norm = status.toUpperCase();
  let badgeClass = 'badge-new';
  let label = status;

  if (norm === 'UP') {
    badgeClass = 'badge-up';
    label = 'Up';
  } else if (norm === 'DOWN') {
    badgeClass = 'badge-down';
    label = 'Down';
  } else if (norm === 'PAUSED') {
    badgeClass = 'badge-paused';
    label = 'Paused';
  } else if (norm === 'NEW') {
    badgeClass = 'badge-new';
    label = 'New';
  }

  return (
    <span class={`badge ${badgeClass}`}>
      <span class="badge-dot" />
      <span>{label}</span>
    </span>
  );
};
