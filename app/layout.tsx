import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Rockwood | Project workspace',description:'Plan the work. Keep the job moving. Rockwood Development project workspace.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
