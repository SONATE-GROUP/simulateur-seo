import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SONATE SEO',
  description: 'Simulateur de potentiel SEO — projetez votre ROI organique',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
