/**
 * Criação do AudioContext usado pelos efeitos sonoros das sessões.
 *
 * Safari ainda exige `webkitAudioContext`, e o `as any` que existia nos dois
 * lugares que criavam o contexto escondia erros de tipação. Centralizado aqui,
 * com tipagem de verdade e fallback para navegador sem suporte.
 */

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** `null` quando o navegador não suporta áudio (ou está em SSR). */
export function createAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}
