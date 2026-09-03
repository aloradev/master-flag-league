import type { ReactNode } from 'react';
import React from 'react';
import { IconInbox } from './icons';

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
  icon,
  title,
  description,
  action,
}: {
  /** Icono SVG del set propio. Sin él se usa la bandeja vacía. */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <span className="text-base-content/30">
      {icon ?? <IconInbox size={40} />}
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

type ButtonTone =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'
  | 'ghost';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode;
  tone?: ButtonTone;
  size?: 'xs' | 'sm' | 'md';
  /** Muestra el indicador y bloquea el botón mientras la acción corre. */
  loading?: boolean;
  outline?: boolean;
  block?: boolean;
  className?: string;
}

const TONE_CLASS: Record<ButtonTone, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  warning: 'btn-warning',
  error: 'btn-error',
  neutral: 'btn-neutral',
  ghost: 'btn-ghost',
};

/**
 * Botón con estado de carga.
 *
 * Existe como componente para que toda acción que llame a la API se
 * comporte igual: se deshabilita mientras corre —lo que evita el doble
 * envío, que en "Aprobar" o "Guardar" duplicaría el registro— y conserva
 * su etiqueta junto al indicador, en lugar de reemplazarla. Un botón que
 * cambia su texto por un spinner deja al usuario sin saber qué se está
 * ejecutando, y además brinca de ancho.
 */
export const Button = ({
  children,
  tone = 'neutral',
  size = 'md',
  loading = false,
  outline = false,
  block = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) => {
  const sizeClass = { xs: 'btn-xs', sm: 'btn-sm', md: '' }[size];
  const spinnerSize = { xs: 'loading-xs', sm: 'loading-xs', md: 'loading-sm' }[size];

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        // La respuesta al toque vive en el CSS, sobre `.btn`, para que
        // también la tengan los botones crudos que no pasan por aquí.
        'btn',
        TONE_CLASS[tone],
        outline && 'btn-outline',
        sizeClass,
        block && 'btn-block',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading && <span className={`loading loading-spinner ${spinnerSize}`} aria-hidden />}
      {children}
    </button>
  );
};
