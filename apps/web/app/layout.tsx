import type { Metadata } from 'next';
import type React from 'react';
import { Providers } from './providers';
import './styles.css';

export const metadata: Metadata = {
  title: 'TestHub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
