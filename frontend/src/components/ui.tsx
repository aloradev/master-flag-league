import type { ReactNode } from 'react';
import React, { useId } from 'react';
import { IconInbox } from './icons';

export const Spinner = ({ label = 'Cargando…' }: { label?: string }) => (
  <div role="status" aria-live="polite" className="ui-loading-state flex flex-col items-center justify-center gap-3 py-12">
    <span aria-hidden="true" className="loading loading-spinner loading-lg text-primary" />
    {label && <p className="text-sm text-base-content/60">{label}</p>}
  </div>
);

/**
 * OJO al `backdrop-blur`: convierte a la tarjeta en bloque contenedor de
 * cualquier descendiente `position: fixed`. Un modal pintado dentro de
 * una tarjeta no se despliega sobre la pantalla sino dentro de ella —el
 * visor de documentos apareció recortado y sin fondo oscuro por esto—.
 * Los modales se montan con `createPortal` en `document.body`; ahí no
 * les afecta.
 */
export const Card = ({
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) => (
  <Tag
    {...rest}
    className={`min-w-0 rounded-box border border-base-300/70 bg-base-200/60 backdrop-blur-sm ${className}`}
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
    <div className={`ui-alert rounded-field border px-4 py-3 text-sm ${styles}`} role={tone === 'error' ? 'alert' : 'status'}>
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
  <div className="ui-empty-state flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
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

export const Field = ({ label, children, hint, error, required }: FieldProps) => {
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const child = React.isValidElement<React.InputHTMLAttributes<HTMLInputElement>>(children) ? children : null;
  const controlId = child?.props.id ?? fieldId;
  const control = React.isValidElement<React.InputHTMLAttributes<HTMLInputElement>>(children)
    ? React.cloneElement(children, {
      id: controlId,
      'aria-invalid': error ? true : children.props['aria-invalid'],
      'aria-describedby': [children.props['aria-describedby'], (error || hint) && descriptionId].filter(Boolean).join(' ') || undefined,
      required: required || children.props.required,
    }) : children;
  return (
  <div className="min-w-0">
    <label htmlFor={controlId} className="mb-1.5 flex items-center gap-1 text-sm font-medium text-base-content/80">
      {label}
      {required && <span aria-hidden="true" className="text-error">*</span>}
    </label>
    {control}
    {error ? (
      <span id={descriptionId} className="mt-1 block text-xs text-error">{error}</span>
    ) : (
      hint && <span id={descriptionId} className="mt-1 block text-xs text-base-content/60">{hint}</span>
    )}
  </div>
);
};

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
        'btn h-auto min-w-0 max-w-full whitespace-normal',
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
