import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'my cronograma - Estudo Inteligente',
    short_name: 'my cronograma',
    description: 'Planejamento de estudos com IA, cronogramas e progresso inteligente.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#05080F',
    theme_color: '#05080F',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        // SVG continua disponível para navegadores que preferem vetor.
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
