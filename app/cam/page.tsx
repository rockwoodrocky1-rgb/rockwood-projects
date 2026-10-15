import WorkspaceCam from '@/cam/src/WorkspaceCam';
import './cam.css';

export const metadata = { title: 'Rockwood Cam', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function CamPage() {
  return <div className="rockwood-cam"><WorkspaceCam /></div>;
}
