import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function RouteExperience() {
  const { pathname, key } = useLocation();
  const navigation = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previousPath = useRef(pathname);
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    const changedPage = previousPath.current !== pathname;
    previousPath.current = pathname;
    const target = navigation === 'POP' ? positions.current.get(key) ?? 0 : changedPage ? 0 : window.scrollY;
    let restoring = true;
    const restore = () => {
      if (restoring) window.scrollTo({ top: target, behavior: 'instant' });
    };
    // Cached or delayed query content can change the available scroll height.
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const stop = () => { restoring = false; observer.disconnect(); };
    const timer = window.setTimeout(stop, 5000);
    const save = () => {
      if (!restoring) positions.current.set(key, window.scrollY);
    };
    const interrupt = () => { stop(); save(); };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    restore();
    if (changedPage && navigation !== 'POP') document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    return () => {
      positions.current.set(key, window.scrollY);
      if (positions.current.size > 100) positions.current.delete(positions.current.keys().next().value!);
      stop();
      clearTimeout(timer);
      window.removeEventListener('scroll', save);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('keydown', interrupt);
    };
  }, [pathname, key, navigation]);
  return null;
}
