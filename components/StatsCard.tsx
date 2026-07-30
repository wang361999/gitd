'use client';

interface StatsCardProps {
  label: string;
  value: number;
  icon?: 'total' | 'success' | 'failed' | 'progress';
}

const ICONS: Record<NonNullable<StatsCardProps['icon']>, React.ReactElement> = {
  total: (
    <svg
      className="h-5 w-5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
    </svg>
  ),
  success: (
    <svg
      className="h-5 w-5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
    </svg>
  ),
  failed: (
    <svg
      className="h-5 w-5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  ),
  progress: (
    <svg
      className="h-5 w-5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.546l3.04 1.755a.75.75 0 01-.75 1.299l-3.415-1.972A.75.75 0 017.25 8V3.75A.75.75 0 018 3z" />
    </svg>
  ),
};

const COLOR_MAP = {
  total: {
    iconBg: 'bg-forge-accent/10',
    iconText: 'text-forge-accent',
  },
  success: {
    iconBg: 'bg-forge-green/10',
    iconText: 'text-forge-green',
  },
  failed: {
    iconBg: 'bg-forge-red/10',
    iconText: 'text-forge-red',
  },
  progress: {
    iconBg: 'bg-forge-yellow/10',
    iconText: 'text-forge-yellow',
  },
};

export default function StatsCard({ label, value, icon = 'total' }: StatsCardProps) {
  const colors = COLOR_MAP[icon];

  return (
    <div className="forge-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-forge-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-forge-ink">
            {value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${colors.iconBg} ${colors.iconText}`}
        >
          {ICONS[icon]}
        </div>
      </div>
    </div>
  );
}
