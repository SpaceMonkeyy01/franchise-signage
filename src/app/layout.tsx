import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

/** The release shown in the footer credit. Raise it with each release. */
const MVP_VERSION = '1.0';

export const metadata: Metadata = {
  // The product is "Franchise by Signage" — never "Signize" (the engine vendor,
  // invisible to users) and never "Signage Studio".
  title: 'Franchise by Signage',
  description: 'Signage workflow for franchise brands, their franchisees, and their vendors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* The build's credit, on every screen and never on paper: printed
            pages go to lenders and landlords. */}
        <footer className="px-4 py-4 text-center text-[11px] text-gray-500 print:hidden">
          Franchise by Signage · MVP v{MVP_VERSION} by Saad A.
        </footer>
      </body>
    </html>
  );
}
