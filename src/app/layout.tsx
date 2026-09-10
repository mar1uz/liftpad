import type { Metadata } from 'next';
import { Instrument_Sans, Fraunces } from 'next/font/google';
import './globals.css';

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'LIFT — Launch on six networks', template: '%s · LIFT' },
  description: 'Discover and launch community tokens across six networks, including Stock Token pairs on Robinhood Chain.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
