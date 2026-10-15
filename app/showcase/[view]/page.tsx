import { notFound, redirect } from 'next/navigation';

const routes = {
  today: { initialView: 'today' },
  overview: { initialView: 'overview' },
  gantt: { initialView: 'plan', initialPlanView: 'timeline', initialPhaseFilter: '7' },
  plan: { initialView: 'plan', initialPlanView: 'list' },
  board: { initialView: 'plan', initialPlanView: 'board' },
  bid: { initialView: 'bid' },
  contact: { initialView: 'contact' },
  material: { initialView: 'material' },
  check: { initialView: 'check' },
  document: { initialView: 'document' },
  closeout: { initialView: 'closeout' },
  activity: { initialView: 'activity' },
  setup: { initialView: 'overview', openProjectSetup: true },
} as const;

export function generateStaticParams() {
  return Object.keys(routes).map(view => ({ view }));
}

export default async function ShowcasePage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!Object.hasOwn(routes, view)) notFound();
  redirect('/workspace');
}
