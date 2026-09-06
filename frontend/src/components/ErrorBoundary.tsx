import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="mx-auto max-w-lg space-y-4 p-6 text-center" role="alert">
      <h1 className="text-xl font-bold">No pudimos mostrar esta pantalla</h1>
      <p>Recarga para recuperar la vista. Antes de repetir una captura, verifica si quedó guardada.</p>
      <button className="btn btn-primary min-h-11" onClick={() => window.location.reload()}>Recargar pantalla</button>
    </main>;
  }
}
