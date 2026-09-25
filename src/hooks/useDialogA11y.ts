'use client';

import { useEffect, useRef } from 'react';

/**
 * Acessibilidade de diálogos (modais).
 *
 * Os modais do app eram apenas `div` sobrepostas: sem `role="dialog"`, sem
 * `aria-modal`, sem fechar com Escape e sem prisão de foco — um leitor de tela
 * anunciava a página atrás e o Tab escapava para o conteúdo oculto.
 *
 * Uso:
 *   const { dialogRef, dialogProps } = useDialogA11y({ open: isOpen, onClose });
 *   <motion.div ref={dialogRef} {...dialogProps} aria-labelledby="titulo">…</motion.div>
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface UseDialogA11yOptions {
  /** Se o diálogo está visível. */
  open: boolean;
  /** Chamado ao pressionar Escape. */
  onClose?: () => void;
  /** Permite desligar o Escape (ex.: sessão em andamento exige confirmação). */
  closeOnEscape?: boolean;
  /** Trava o scroll da página enquanto o diálogo está aberto (padrão: true). */
  lockScroll?: boolean;
  /** Rótulo acessível usado quando não há título visível. */
  ariaLabel?: string;
}

const isFocusable = (element: HTMLElement) =>
  !element.hasAttribute('disabled') && element.tabIndex !== -1;

export function useDialogA11y({
  open,
  onClose,
  closeOnEscape = true,
  lockScroll = true,
  ariaLabel,
}: UseDialogA11yOptions) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const container = dialogRef.current;
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const focusables = container
      ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
      : [];

    // Dá tempo do conteúdo animado existir antes de mover o foco.
    const focusTimer = window.setTimeout(() => {
      const items = container
        ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
        : [];
      const target = items[0] ?? container;
      if (target) {
        if (target === container) container.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        if (!closeOnEscape) return;
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab' || !container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isFocusable
      );
      if (items.length === 0) {
        event.preventDefault();
        container.setAttribute('tabindex', '-1');
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    // Captura: garante que o Escape do diálogo vença handlers de camadas abaixo.
    document.addEventListener('keydown', handleKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      // Devolve o foco para quem abriu o diálogo.
      const restore = restoreFocusRef.current;
      if (restore && document.contains(restore)) {
        restore.focus({ preventScroll: true });
      }
      restoreFocusRef.current = null;
      void focusables;
    };
  }, [open, onClose, closeOnEscape, lockScroll]);

  const dialogProps = {
    role: 'dialog' as const,
    'aria-modal': open ? (true as const) : undefined,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  };

  return { dialogRef, dialogProps };
}

export default useDialogA11y;
