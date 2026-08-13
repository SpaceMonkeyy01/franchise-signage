import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  // The product is "Franchise by Signage" — never "Signize" (the engine vendor,
  // invisible to users) and never "Signage Studio".
  title: 'Franchise by Signage',
  description: 'Signage workflow for franchise brands, their franchisees, and their vendors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
