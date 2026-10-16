import WorkspaceCam from '@/cam/src/WorkspaceCam';
import './cam.css';

export const dynamic = 'force-dynamic';
export default function CamPage() {
  return <div className="rockwood-cam"><WorkspaceCam /></div>;
}
