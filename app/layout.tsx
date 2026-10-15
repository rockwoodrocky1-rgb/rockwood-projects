import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './brand.css';
const inter = localFont({src:'./fonts/Inter.ttf',variable:'--font-inter',weight:'100 900',display:'swap'});
const garamond = localFont({src:'./fonts/EBGaramond.ttf',variable:'--font-garamond',weight:'400 800',display:'swap'});
export const viewport: Viewport = {themeColor:'#F3F0E8'};
export const metadata: Metadata = {title:'Rockwood | Project workspace',description:'Plan the work. Keep the job moving. Rockwood Development project workspace.',icons:{icon:'/brand/favicon.ico'},robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={`${inter.variable} ${garamond.variable}`}><body>{children}</body></html>}
