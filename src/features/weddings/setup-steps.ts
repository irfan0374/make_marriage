// The dashboard's "Finish setting up" checklist (PRD DASH-7, Stitch "Dashboard"). Each step is
// done from real data, or marked "soon" until its feature exists. Client-safe, no React.

export type SetupStepKey = 'events' | 'guests' | 'invitation' | 'send' | 'team' | 'website';

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  done: boolean;
  /** Where to do it; `null` while the feature isn't built yet ("Soon"). */
  href: string | null;
}

export interface SetupFacts {
  weddingId: string;
  /** People on the team, including the couple. */
  teamSize: number;
}

/** In the order a couple usually goes: events, guests, the invite, family, the website. */
export function setupSteps({ weddingId, teamSize }: SetupFacts): SetupStep[] {
  const base = `/app/${weddingId}`;
  return [
    { key: 'events', title: 'Add events', done: false, href: null },
    { key: 'guests', title: 'Add guests', done: false, href: null },
    { key: 'invitation', title: 'Upload invitation', done: false, href: null },
    { key: 'send', title: 'Send invitations', done: false, href: null },
    { key: 'team', title: 'Invite your family', done: teamSize > 1, href: `${base}/team` },
    { key: 'website', title: 'Publish website', done: false, href: null },
  ];
}

/** "Good morning" / "Good afternoon" / "Good evening" for an hour of the day (0–23). */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The first word of a name, for "Good morning, Nafiya". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
