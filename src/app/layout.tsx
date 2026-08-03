import type { Metadata, Viewport } from 'next';
import './globals.css';
import NetworkStatus from '@/components/NetworkStatus';

export const metadata: Metadata = {
  title: 'Bilnov — Gestion de projets visuels',
  description: 'Plateforme SaaS de gestion, visualisation 3D/360° et collaboration.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/icon.svg'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  applicationName: 'Bilnov',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bilnov',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05060c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <NetworkStatus />
      </body>
    </html>
  );
}
