import Link from 'next/link';
import { ArrowRight, CheckCheck, ChartNoAxesGantt, ClipboardList, Columns3, FolderOpen, HardHat, History, LayoutDashboard, Package, Plus, ShieldCheck, Users, Wallet } from 'lucide-react';

export const SHOWCASE_VIEWS = [
  { id: 'today', title: 'Worker', description: 'Today’s tasks and blockers.', action: 'Open worker view', icon: HardHat },
  { id: 'overview', title: 'Project manager', description: 'Progress and priorities.', action: 'Open manager view', icon: LayoutDashboard },
  { id: 'gantt', title: 'Schedule (Gantt)', description: 'Dates and the order of work.', action: 'Open schedule', icon: ChartNoAxesGantt },
  { id: 'setup', title: 'New project', description: 'Enter the job details.', icon: Plus },
  { id: 'plan', title: 'Project checklist', description: 'All phases and tasks.', icon: ClipboardList },
  { id: 'board', title: 'Work board', description: 'Tasks grouped by status.', icon: Columns3 },
  { id: 'bid', title: 'Bids & prices', description: 'Quotes, costs, and scope.', icon: Wallet },
  { id: 'contact', title: 'People', description: 'Contractors and suppliers.', icon: Users },
  { id: 'material', title: 'Materials', description: 'Orders and deliveries.', icon: Package },
  { id: 'check', title: 'Checks & approvals', description: 'Inspections and results.', icon: ShieldCheck },
  { id: 'document', title: 'Files', description: 'Plans and documents.', icon: FolderOpen },
  { id: 'closeout', title: 'Closeout', description: 'Payments and handover.', icon: CheckCheck },
  { id: 'activity', title: 'Activity', description: 'Recent changes.', icon: History },
] as const;

export default function ShowcaseHome() {
  return <main className="rw-showcase">
    <div className="rwsc-shell">
      <header className="rwsc-header">
        <Link href="/" aria-label="Rockwood Projects home" className="rwsc-brand">
          <img src="/brand/rockwood-development.svg" width="280" height="44" alt="Rockwood Development" />
        </Link>
      </header>

      <section className="rwsc-intro" aria-labelledby="rwsc-title">
        <h1 id="rwsc-title">Choose a view</h1>
        <p>Open the sample project. No login needed.</p>
      </section>

      <section className="rwsc-feature-grid" aria-label="Main views">
        {SHOWCASE_VIEWS.slice(0, 3).map(view => {
          const Icon = view.icon;
          return <Link className="rwsc-feature-card" href={`/showcase/${view.id}`} key={view.id}>
            <div className="rwsc-feature-title"><Icon size={28} aria-hidden="true" /><h2>{view.title}</h2></div>
            <p>{view.description}</p>
            <span className="rwsc-open">{'action' in view ? view.action : 'Open view'}<ArrowRight size={22} aria-hidden="true" /></span>
          </Link>;
        })}
      </section>

      <section className="rwsc-more" aria-labelledby="rwsc-more-title">
        <h2 id="rwsc-more-title">More views</h2>
        <div className="rwsc-module-grid">
          {SHOWCASE_VIEWS.slice(3).map(view => {
            const Icon = view.icon;
            return <Link href={`/showcase/${view.id}`} key={view.id} className="rwsc-module-card">
              <Icon size={26} className="rwsc-module-icon" aria-hidden="true" />
              <div><h3>{view.title}</h3><p>{view.description}</p></div>
              <ArrowRight size={22} className="rwsc-module-arrow" aria-hidden="true" />
            </Link>;
          })}
        </div>
      </section>

      <p className="rwsc-note">Sample data only. Changes reset on reload. Nothing is sent to contractors.</p>
    </div>
  </main>;
}
