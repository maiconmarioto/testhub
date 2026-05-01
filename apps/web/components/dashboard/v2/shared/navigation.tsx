'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, Settings2, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AuthMe, Role } from '../types';
import { initials } from './formUtils';

export function UserSidebarMenu({ me, role, busy, onLogout }: { me: AuthMe | null; role: Role; busy: boolean; onLogout: () => void }) {
  if (!me) {
    return (
      <a href="/settings" aria-label="Sessão" className={buttonVariants({ variant: 'outline', size: 'icon', className: 'rounded-lg border-white/15 bg-transparent text-[#f7f6f0] hover:bg-white/10' })}>
        <Settings2 data-icon="inline-start" />
      </a>
    );
  }
  const label = me.user.name || me.user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Menu do usuário" title={label} className="grid rounded-full ring-1 ring-white/15 transition hover:ring-[#d7e35f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7e35f]">
          <Avatar className="h-11 w-11 border border-white/10 bg-[#d7e35f] text-[#111611]">
            <AvatarFallback className="bg-[#d7e35f] font-bold text-[#111611]">{initials(label)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={12} className="w-72">
        <DropdownMenuLabel>
          <span className="block truncate">{label}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{me.organization.name} · {role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings2 data-icon="inline-start" />
              Perfil e sistema
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout} disabled={busy} variant="destructive">
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogOut data-icon="inline-start" />}
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RailIcon({ icon: Icon, active, label, onClick }: { icon: LucideIcon; active?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn('grid h-10 w-10 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 hover:text-[#d7e35f]', active ? 'bg-white/10 text-[#d7e35f]' : 'text-[#9da596] ring-1 ring-white/10')}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function RailLink({ icon: Icon, active, label, href }: { icon: LucideIcon; active?: boolean; label: string; href: string }) {
  const router = useRouter();

  return (
    <a
      aria-label={label}
      title={label}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        router.push(href);
      }}
      className={cn('grid h-10 w-10 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 hover:text-[#d7e35f]', active ? 'bg-white/10 text-[#d7e35f]' : 'text-[#9da596] ring-1 ring-white/10')}
    >
      <Icon className="h-5 w-5" />
    </a>
  );
}
