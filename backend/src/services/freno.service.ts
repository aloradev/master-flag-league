/**
 * FRENO DE INTENTOS.
 *
 * En memoria, y es suficiente aquí: el plan gratuito de Render corre un
 * solo proceso, así que no hay nada que compartir entre instancias. Si el
 * proceso duerme y despierta, los contadores se reinician — y eso
 * tampoco importa, porque el objetivo es cortar un bucle de reintentos
 * automáticos, no resistir un ataque distribuido. Con varias instancias
 * esto se muda a la base o a un contador externo.
 */

const VENTANA_MS = 15 * 60_000;

/** clave → marcas de tiempo de los intentos dentro de la ventana. */
const registro = new Map<string, number[]>();

const vigentes = (clave: string): number[] => {
  const ahora = Date.now();
  const previos = (registro.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length === 0) registro.delete(clave);
  else registro.set(clave, previos);
  return previos;
};

/**
 * Cuenta este intento y dice si ya se pasó del máximo.
 *
 * Para peticiones donde el intento en sí es lo que hay que limitar, como
 * pedir un correo de recuperación.
 */
export const demasiadosIntentos = (clave: string, maximo: number): boolean => {
  const previos = vigentes(clave);
  if (previos.length >= maximo) return true;
  previos.push(Date.now());
  registro.set(clave, previos);
  return false;
};

/** Mira si está frenado SIN contar el intento. */
export const estaFrenado = (clave: string, maximo: number): boolean =>
  vigentes(clave).length >= maximo;

/** Apunta un fallo. Solo los fallos cuentan para frenar el ingreso. */
export const registrarFallo = (clave: string): void => {
  const previos = vigentes(clave);
  previos.push(Date.now());
  registro.set(clave, previos);
};

/**
 * Borra los fallos de una clave.
 *
 * Se llama al entrar bien, y es lo que evita que el freno se convierta en
 * una forma de dejar a alguien fuera: si se contaran todos los intentos y
 * no se limpiaran, cualquiera podría bloquear la cuenta de un encargado
 * escribiendo su correo con contraseñas inventadas hasta el tope.
 */
export const limpiarFallos = (clave: string): void => {
  registro.delete(clave);
};

/** Solo para las pruebas: deja el registro como recién arrancado. */
export const reiniciarFreno = (): void => {
  registro.clear();
};
