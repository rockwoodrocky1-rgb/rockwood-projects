import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './brand.css';
const inter = localFont({src:'./fonts/Inter.ttf',variable:'--font-inter',weight:'100 900',display:'swap'});
const garamond = localFont({src:'./fonts/EBGaramond.ttf',variable:'--font-garamond',weight:'400 800',display:'swap'});
export const viewport: Viewport = {themeColor:'#F3F0E8'};
export const metadata: Metadata = {
  metadataBase: new URL('https://rockwood-projects.vercel.app'),
  title: 'Rockwood | Project workspace',
  applicationName: 'Rockwood Projects',
  description: 'Plan the work. Keep the job moving. Rockwood Development project workspace.',
  icons: {
    icon: [
      { url: '/brand/development/v1/favicon.ico', sizes: 'any' },
      { url: '/brand/development/v1/icon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/brand/development/v1/icon-180.png', sizes: '180x180', type: 'image/png' },
  },
  manifest: '/brand/development/v1/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Rockwood Projects', statusBarStyle: 'default' },
  openGraph: {
    type: 'website', title: 'Rockwood Projects', siteName: 'Rockwood Development',
    description: 'Rockwood Development project workspace.', url: '/workspace',
    images: [{ url: '/brand/development/v1/share-1200x630.png', width: 1200, height: 630, alt: 'Rockwood Development — Project workspace' }],
  },
  twitter: {
    card: 'summary_large_image', title: 'Rockwood Projects',
    description: 'Rockwood Development project workspace.',
    images: [{ url: '/brand/development/v1/share-1200x630.png', alt: 'Rockwood Development — Project workspace' }],
  },
  robots: { index: false, follow: false },
};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={`${inter.variable} ${garamond.variable}`}><body>{children}</body></html>}
