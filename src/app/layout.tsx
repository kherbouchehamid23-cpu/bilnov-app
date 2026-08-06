import type { Metadata, Viewport } from 'next';
import './globals.css';
import NetworkStatus from '@/components/NetworkStatus';
import SubscriptionBanner from '@/components/SubscriptionBanner';

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
        {/* anti-flash: applique le theme choisi avant le premier rendu (defaut = sombre) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('bilnov-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();",
          }}
        />
        <SubscriptionBanner />
        {children}
        <NetworkStatus />
      </body>
    </html>
  );
}
