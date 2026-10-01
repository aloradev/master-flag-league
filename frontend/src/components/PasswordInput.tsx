import { useState, type InputHTMLAttributes } from 'react';

/** Mismo control en acceso y registro; permite revisar sin volver a escribir. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input {...props} type={visible ? 'text' : 'password'} className={`input input-bordered w-full pr-24 ${props.className ?? ''}`} />
    <button type="button" disabled={props.disabled} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}
      onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-1 my-auto min-h-11 rounded-field px-3 text-xs font-semibold text-primary">
      {visible ? 'Ocultar' : 'Mostrar'}
    </button>
  </div>;
}
