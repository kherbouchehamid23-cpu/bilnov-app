import type { Metadata, Viewport } from 'next';
import './globals.css';
import NetworkStatus from '@/components/NetworkStatus';

export const metadata: Metadata = {
  title: 'Bilnov — Gestion de projets visuels',
  description: 'Plateforme SaaS de gestion, visualisation 3D/360° et collaboration.',
  manifest: '/manifest.json',
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
