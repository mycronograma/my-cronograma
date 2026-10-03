/**
 * Root Layout
 * Provides the main app structure with sidebar and responsive design
 */

import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import ThemeBootstrap from '@/components/providers/ThemeBootstrap';
import PWARegister from '@/components/PWARegister';

export const metadata: Metadata = {
  title: 'my cronograma - Estudo Inteligente',
  description: 'Planejamento de estudos com cronogramas inteligentes, sessões guiadas e progresso gamificado.',
  keywords: ['estudo', 'aprendizado', 'IA', 'produtividade', 'educação', 'planejamento', 'ENEM'],
  authors: [{ name: 'my cronograma' }],
  applicationName: 'my cronograma',
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    // iOS ignora SVG: sem PNG o app instalado fica sem ícone.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#05080F' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark theme-dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const root = document.documentElement;
                  const savedTheme = localStorage.getItem('nexora_theme');
                  const settings = JSON.parse(localStorage.getItem('nexora_user_settings') || '{}');
                  const theme = savedTheme === 'light' || savedTheme === 'dark'
                    ? savedTheme
                    : settings.theme === 'light'
                      ? 'light'
                      : 'dark';
                  root.classList.toggle('theme-light', theme === 'light');
                  root.classList.toggle('theme-dark', theme !== 'light');
                  root.classList.toggle('dark', theme !== 'light');
                  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
                } catch {}
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="my cronograma" />
      </head>
      <body className="font-body antialiased">
        <ThemeBootstrap />
        <AuthProvider>
          {children}
          <PWARegister />
        </AuthProvider>
      </body>
    </html>
  );
}
