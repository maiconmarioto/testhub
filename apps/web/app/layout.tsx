import type { Metadata } from 'next';
import type React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import './styles.css';

export const metadata: Metadata = {
  title: 'TestHub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
