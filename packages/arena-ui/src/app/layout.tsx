import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AdrenaX Arena',
  description: 'Peer-to-peer trading duels on Solana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
