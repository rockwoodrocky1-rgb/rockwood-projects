import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChartNoAxesGantt, CircleCheck, ClipboardList, Columns3, FileText, FolderOpen, HardHat, History, LayoutDashboard, Package, Plus, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react';

export const SHOWCASE_VIEWS = [
  { id: 'today', title: 'Worker view', label: 'Today', description: 'Know what to do, what is ready, and what is holding up the work.', action: 'Try updating a work item', icon: HardHat, audience: 'ON THE JOB', preview: 'worker' },
  { id: 'overview', title: 'Project manager view', label: 'Overview', description: 'See the whole job, spot the gaps, and decide what needs attention.', action: 'Try opening a project', icon: LayoutDashboard, audience: 'THE WHOLE PICTURE', preview: 'manager' },
  { id: 'gantt', title: 'Schedule view', label: 'Gantt timeline', description: 'See how the work fits together, from rough-in to the next inspection.', action: 'Try changing a task date', icon: ChartNoAxesGantt, audience: 'WHAT HAPPENS NEXT', preview: 'schedule' },
  { id: 'setup', title: 'Set up a project', description: 'Start a job with the customer checklist, or start with an empty plan.', action: 'Try the setup', icon: Plus },
  { id: 'plan', title: 'Project checklist', description: 'Explore all 15 phases, their work, and the checks between them.', action: 'Try the checklist', icon: ClipboardList },
  { id: 'board', title: 'Work board', description: 'Follow the work from waiting and working to ready to check.', action: 'Try the board', icon: Columns3 },
  { id: 'bid', title: 'Bids & prices', description: 'Compare labor, materials, exclusions, and what each quote includes.', action: 'Try a quote', icon: Wallet },
  { id: 'contact', title: 'People', description: 'Find contractors, suppliers, their contact details, and past experience.', action: 'Try a contact', icon: Users },
  { id: 'material', title: 'Materials', description: 'See what is ordered, what is arriving, and what still needs a decision.', action: 'Try a delivery', icon: Package },
  { id: 'check', title: 'Checks & approvals', description: 'Record an inspection result and see which work it helps release.', action: 'Try a check', icon: ShieldCheck },
  { id: 'document', title: 'Project files', description: 'See where plans, proposals, photos, and warranties belong.', action: 'Explore the files', icon: FolderOpen },
  { id: 'closeout', title: 'Closeout', description: 'Bring decisions, agreements, payments, and final handover together.', action: 'Explore closeout', icon: CheckCheck },
  { id: 'activity', title: 'Project activity', description: 'Follow the changes and see how updates become a shared record.', action: 'See the updates', icon: History },
] as const;

function WorkerPreview() {
  return <div className="rwsc-preview rwsc-worker-preview" aria-hidden="true">
    <div className="rwsc-preview-top"><span>Today on site</span><span className="rwsc-tiny-tag">Oak Street House</span></div>
    <div className="rwsc-preview-task"><span className="rwsc-check-icon"><Check size={12} /></span><div><strong>Finish kitchen rough-in</strong><span>Plumbing crew · Kitchen</span></div><span className="rwsc-pill rwsc-ready">Ready</span></div>
    <div className="rwsc-preview-task"><span className="rwsc-empty-check" /><div><strong>Confirm sink delivery</strong><span>Supplier confirmation needed</span></div><span className="rwsc-pill rwsc-waiting">Waiting</span></div>
    <div className="rwsc-preview-footer"><CalendarDays size={12} /><span>A clear next step for the crew.</span></div>
  </div>;
}

function ManagerPreview() {
  return <div className="rwsc-preview rwsc-manager-preview" aria-hidden="true">
    <div className="rwsc-preview-top"><span>Oak Street House</span><span className="rwsc-tiny-tag">Example project</span></div>
    <div className="rwsc-mini-metrics"><div><span>Ready to start</span><strong>4</strong><i className="rwsc-metric-green" /></div><div><span>Needs attention</span><strong>2</strong><i className="rwsc-metric-amber" /></div><div><span>Ready to check</span><strong>3</strong><i className="rwsc-metric-burgundy" /></div></div>
    <div className="rwsc-attention"><span className="rwsc-attention-dot" /><span>Kitchen delivery needs a follow-up</span><ArrowUpRight size={12} /></div>
  </div>;
}

function SchedulePreview() {
  return <div className="rwsc-preview rwsc-schedule-preview" aria-hidden="true">
    <div className="rwsc-preview-top"><span>Rough-in → Drywall</span><span className="rwsc-tiny-tag">Timeline</span></div>
    <div className="rwsc-gantt-head"><span>Work</span><div><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></div>
    <div className="rwsc-gantt-row"><span>Rough approvals</span><div><i className="rwsc-gantt-marker rwsc-marker-rough" /></div></div>
    <div className="rwsc-gantt-row"><span>Insulation</span><div><i className="rwsc-gantt-bar rwsc-bar-insulation" /></div></div>
    <div className="rwsc-gantt-row"><span>Insulation check</span><div><i className="rwsc-gantt-marker rwsc-marker-insulation" /></div></div>
    <div className="rwsc-gantt-row"><span>Drywall</span><div><i className="rwsc-gantt-bar rwsc-bar-three" /></div></div>
  </div>;
}

export default function ShowcaseHome() {
  const featured = SHOWCASE_VIEWS.slice(0, 3);
  const modules = SHOWCASE_VIEWS.slice(3);
  return <main className="rw-showcase">
    <div className="rwsc-shell">
      <header className="rwsc-header">
        <Link href="/" aria-label="Rockwood Projects showcase home" className="rwsc-brand"><img src="/brand/rockwood-logo.png" width="260" height="71" alt="Rockwood Development" /><span>PROJECT WORKSPACE</span></Link>
        <span className="rwsc-access"><CircleCheck size={15} /><span>No account needed</span></span>
      </header>

      <section className="rwsc-intro" aria-labelledby="rwsc-title">
        <div className="rwsc-eyebrow"><span />THE INTERACTIVE SHOWCASE</div>
        <h1 id="rwsc-title">Which view would you<br className="rwsc-desktop-break" /> like to explore?</h1>
        <p>One project, different perspectives. See how the team can plan the work, share an update, and keep the next step clear.</p>
        <div className="rwsc-intro-bottom"><span><CircleCheck size={15} />Open a view and try it yourself.</span><a href="#all-views">Browse every view<ArrowDown size={14} /></a></div>
      </section>

      <section className="rwsc-feature-grid" aria-label="Choose your perspective">
        {featured.map(view => {
          const Icon = view.icon;
          return <Link className={`rwsc-feature-card rwsc-feature-${view.id}`} href={`/showcase/${view.id}`} key={view.id}>
            <div className="rwsc-feature-heading"><span className="rwsc-feature-icon"><Icon size={21} strokeWidth={1.5} /></span><span>{'audience' in view ? view.audience : ''}</span><ArrowUpRight size={18} className="rwsc-card-arrow" /></div>
            <h2>{view.title}</h2><p>{view.description}</p>
            {'preview' in view && view.preview === 'worker' ? <WorkerPreview /> : 'preview' in view && view.preview === 'manager' ? <ManagerPreview /> : <SchedulePreview />}
            <div className="rwsc-feature-action"><span>{view.action}</span><ArrowRight size={17} /></div>
          </Link>;
        })}
      </section>

      <div className="rwsc-example-note"><FileText size={17} /><p><strong>A fictional job. Real interactions.</strong> Changes stay in this browser’s showcase and can be reset. Nothing is sent to contractors or saved to a live project.</p></div>

      <section id="all-views" className="rwsc-all-views" aria-labelledby="rwsc-all-title">
        <div className="rwsc-section-heading"><div><span className="rwsc-eyebrow">FROM THE FIRST BID TO HANDOVER</span><h2 id="rwsc-all-title">Find the part you work with.</h2></div><p>Each view opens the same example workspace.</p></div>
        <div className="rwsc-module-grid">{modules.map(view => {
          const Icon = view.icon;
          return <Link href={`/showcase/${view.id}`} key={view.id} className={`rwsc-module-card${view.id === 'setup' ? ' rwsc-module-setup' : ''}`}><span className="rwsc-module-icon"><Icon size={21} strokeWidth={1.5} /></span><h3>{view.title}</h3><p>{view.description}</p><span className="rwsc-module-action">{view.action}<ArrowUpRight size={14} /></span></Link>;
        })}</div>
      </section>

      <section className="rwsc-roadmap" aria-labelledby="rwsc-roadmap-title">
        <div className="rwsc-roadmap-heading"><span className="rwsc-roadmap-icon"><Sparkles size={21} strokeWidth={1.5} /></span><div><span className="rwsc-eyebrow">WHERE WE GO FROM HERE</span><h2 id="rwsc-roadmap-title">Start with the work. Build from there.</h2></div></div>
        <ol className="rwsc-roadmap-steps"><li className="rwsc-current-step"><span className="rwsc-step-number">01</span><div><span className="rwsc-step-label">NOW</span><h3>Explore the showcase</h3><p>Try the views and refine the workflow together.</p></div></li><li><span className="rwsc-step-number">02</span><div><span className="rwsc-step-label">NEXT</span><h3>Agent workflows</h3><p>Agree on reminders, actions, and permissions.</p></div></li><li><span className="rwsc-step-number">03</span><div><span className="rwsc-step-label">FIRST LIVE PROJECT · V1</span><h3>Put the plan to work</h3><p>Bring in real people, bids, dates, and documents.</p></div></li></ol>
      </section>

      <footer className="rwsc-footer"><span>ROCKWOOD DEVELOPMENT</span><p>Built around the way your team works.</p><span>INTERACTIVE SHOWCASE</span></footer>
    </div>
  </main>;
}
