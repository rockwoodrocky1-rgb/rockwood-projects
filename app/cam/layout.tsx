import type { Metadata } from 'next';

// Cam has its own install identity; never inherit the office workspace's app icon.
export const metadata: Metadata = {
  title: 'Rockwood Cam',
  applicationName: 'Rockwood Cam',
  description: 'Site photos, notes and reports for Rockwood.',
  icons: {
    icon: [
      { url: '/brand/cam/v2/favicon.ico', sizes: 'any' },
      { url: '/brand/cam/v2/icon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/brand/cam/v2/icon-180.png', sizes: '180x180', type: 'image/png' },
  },
  manifest: '/brand/cam/v2/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Rockwood Cam', statusBarStyle: 'default' },
  openGraph: {
    type: 'website', title: 'Rockwood Cam', siteName: 'Rockwood Cam',
    description: 'Site photos, notes and reports for Rockwood.', url: '/cam',
    images: [{ url: '/brand/cam/v2/share-1200x630.png', width: 1200, height: 630, alt: 'RockwoodCam — camera emblem and oxblood Cam wordmark' }],
  },
  twitter: {
    card: 'summary_large_image', title: 'Rockwood Cam',
    description: 'Site photos, notes and reports for Rockwood.',
    images: [{ url: '/brand/cam/v2/share-1200x630.png', alt: 'RockwoodCam — camera emblem and oxblood Cam wordmark' }],
  },
  robots: { index: false, follow: false },
};

export default function CamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
