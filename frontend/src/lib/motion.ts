import { useEffect, useRef, useState } from 'react';

/**
 * ¿El aparato pide menos movimiento?
 *
 * Se consulta en JavaScript y no solo en CSS porque el contador del
 * marcador se anima con estado de React: si la preferencia está
 * activada, el número tiene que SALTAR al valor final, no quedarse a
 * medio camino.
 *
 * Se escucha el cambio porque en iOS y Android el interruptor se puede
 * activar con la aplicación abierta.
 */
export const usaMenosMovimiento = (): boolean => {
  const [reducido, setReducido] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const alCambiar = () => setReducido(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return reducido;
};

/**
 * Cuenta de un número al siguiente.
 *
 * Existe para el marcador del árbitro. Un 14 que se convierte en 20 sin
 * movimiento es fácil de no ver, y el árbitro necesita confirmar que su
 * toque quedó registrado —sobre todo cuando el cambio viene del OTRO
 * árbitro y llega por sondeo, sin que él haya tocado nada.
 *
 * Devuelve además `cambio`, que dura lo mismo que la animación, para que
 * quien lo use pueda destacar el lado que anotó.
 *
 * El recorrido es de 380 ms: suficiente para verse, lo bastante corto
 * para no estorbar en una cancha. Si el aparato pide menos movimiento,
 * el valor se asigna de golpe.
 */
export const useContador = (valor: number, duracion = 380) => {
  const reducido = usaMenosMovimiento();
  const [mostrado, setMostrado] = useState(valor);
  const [cambio, setCambio] = useState(false);
  const desde = useRef(valor);
  const cuadro = useRef<number>(0);

  useEffect(() => {
    if (valor === mostrado) return;

    if (reducido) {
      setCambio(false);
      setMostrado(valor);
      desde.current = valor;
      return;
    }

    const inicio = performance.now();
    const origen = desde.current;
    const distancia = valor - origen;
    setCambio(true);

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // Desaceleración: el número llega y se asienta, en lugar de
      // frenar en seco.
      const suave = 1 - (1 - t) * (1 - t);
      desde.current = Math.round(origen + distancia * suave);
      setMostrado(desde.current);
      if (t < 1) cuadro.current = requestAnimationFrame(paso);
      else {
        desde.current = valor;
        setCambio(false);
      }
    };

    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
    // `mostrado` queda fuera a propósito: incluirlo reiniciaría la
    // cuenta en cada cuadro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, reducido, duracion]);

  return { mostrado, cambio };
};
