import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Cronograma - Estudo Inteligente',
    short_name: 'My Cronograma',
    description: 'Planejamento de estudos com IA, cronogramas e progresso inteligente.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05080F',
    theme_color: '#05080F',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  };
}
