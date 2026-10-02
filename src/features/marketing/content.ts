import {
  CalendarDays,
  EyeOff,
  Hand,
  Images,
  Link2,
  MailCheck,
  MessageCircle,
  Radio,
  ReceiptText,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

// Homepage copy (PRD §5.12). Every claim here must match a requirement in the PRD.

export const ROUTES = {
  signup: '/signup',
  login: '/login',
} as const;

export const SECTION_IDS = {
  features: 'features',
  howItWorks: 'how-it-works',
  sampleInvite: 'sample-invite',
} as const;

type Item = { icon: LucideIcon; title: string; body: string };

export const FEATURES: Item[] = [
  {
    icon: CalendarDays,
    title: 'Every event',
    body: 'Mehendi to Reception, each with its own date, venue and guests.',
  },
  {
    icon: MailCheck,
    title: 'Guests and RSVP',
    body: 'Invite families, not just names. Track replies per event.',
  },
  {
    icon: UsersRound,
    title: 'Family team',
    body: 'Parents and siblings can help, with access you control.',
  },
  {
    icon: ReceiptText,
    title: 'Expenses',
    body: "See what's spent by event, vendor and who paid.",
  },
  {
    icon: Radio,
    title: 'Website and live stream',
    body: 'A simple wedding page with your YouTube live stream.',
  },
  {
    icon: Images,
    title: 'Photo gallery',
    body: 'Guests scan a QR code and share their photos with you.',
  },
];

export const STEPS = [
  {
    title: 'Add your events',
    body: 'Set the date and venue for each event, from Haldi to Reception.',
  },
  {
    title: 'Invite your families',
    body: "Group guests by household, set headcounts, and share each family's private link.",
  },
  {
    title: 'Track everything',
    body: 'See replies as they arrive, know your headcount per event, and record what you spend.',
  },
];

export const GUEST_POINTS: Item[] = [
  {
    icon: MessageCircle,
    title: 'Share on WhatsApp',
    body: "Each family's link opens WhatsApp with a message ready to send.",
  },
  {
    icon: Hand,
    title: 'One reply per event',
    body: 'Families say yes or no to each event separately.',
  },
  {
    icon: Users,
    title: 'Headcount and a note',
    body: 'They tell you how many are coming and can leave you a note.',
  },
];

export const PRIVACY_POINTS: Item[] = [
  {
    icon: Link2,
    title: 'A private link for every family',
    body: 'No public guest list. Each household gets its own link, hidden from search engines.',
  },
  {
    icon: EyeOff,
    title: 'You decide who sees what',
    body: "Families see only the events they're invited to, and helpers get the access you give them.",
  },
  {
    icon: UsersRound,
    title: 'Your guest list stays yours',
    body: 'Only you and the family members you add can see your guests and replies.',
  },
];
