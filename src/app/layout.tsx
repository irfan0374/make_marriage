import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { APP_NAME } from '@/config/app';

// Fonts (architecture §18.3): Fraunces 500 for headings and large numbers, Inter 400/500 for UI.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Plan your wedding events, guests, invitations and RSVPs together.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
