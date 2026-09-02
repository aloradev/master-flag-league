import type { ReactNode } from 'react';

export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12">
    <span className="loading loading-spinner loading-lg text-primary" />
    {label && <p className="text-sm text-base-content/60">{label}</p>}
  </div>
);

export const Card = ({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) => (
  <Tag
    className={`rounded-box border border-base-300/70 bg-base-200/60 backdrop-blur-sm ${className}`}
  >
    {children}
  </Tag>
);

export const Alert = ({
  tone = 'info',
  children,
  title,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  children?: ReactNode;
  title?: string;
}) => {
  const styles = {
    info: 'border-info/40 bg-info/10 text-info',
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
  }[tone];

  return (
    <div className={`rounded-field border px-4 py-3 text-sm ${styles}`} role="alert">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>}
    </div>
  );
};

export const EmptyState = ({
  icon = '📋',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <span className="text-4xl" aria-hidden>
      {icon}
    </span>
    <h3 className="text-base font-semibold">{title}</h3>
    {description && (
      <p className="max-w-sm text-sm text-base-content/60">{description}</p>
    )}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Field = ({ label, children, hint, error, required }: FieldProps) => (
  <label className="block">
    <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-base-content/80">
      {label}
      {required && <span className="text-error">*</span>}
    </span>
    {children}
    {error ? (
      <span className="mt-1 block text-xs text-error">{error}</span>
    ) : (
      hint && <span className="mt-1 block text-xs text-base-content/50">{hint}</span>
    )}
  </label>
);

/** Métrica grande. Los números son tabulares para que no salten al cambiar. */
export const Stat = ({
  value,
  label,
  tone = 'default',
}: {
  value: ReactNode;
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'primary';
}) => {
  const color = {
    default: 'text-base-content',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }[tone];

  return (
    <Card className="px-4 py-3">
      <div className={`tabular text-2xl font-bold leading-tight ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-base-content/60">{label}</div>
    </Card>
  );
};
