'use client';

import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';

const G    = '#1a2e25';
const G2   = '#16271f';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';
const MUTED  = '#7a9e8e';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const isAdmin = session?.user?.isGlobalAdmin;

  const navItems = [
    { href: '/admin/rapports',       label: 'Rapports',       icon: '📋', adminOnly: false },
    { href: '/admin/workspaces',     label: 'Espaces clients', icon: '👥', adminOnly: false },
    { href: '/admin/users',          label: 'Utilisateurs',   icon: '👤', adminOnly: true  },
    { href: '/admin/configuration',  label: 'Configuration',  icon: '⚙️', adminOnly: true  },
  ];

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: G, fontFamily: "'Inter', sans-serif", color: CREAM }}>

      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        backgroundColor: G2,
        borderRight: `1px solid ${G3}`,
        display: 'flex', flexDirection: 'column',
        padding: '0',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid ${G3}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: CREAM, letterSpacing: '-0.02em' }}>
            Sonate
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Back-office
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visibleItems.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? CREAM : MUTED,
                  backgroundColor: active ? G4 : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.1s, color 0.1s',
                  borderLeft: active ? `3px solid ${ORANGE}` : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom - back to simulator */}
        <div style={{ padding: '12px 10px 20px', borderTop: `1px solid ${G3}` }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 12px', borderRadius: 8,
            fontSize: 13, fontWeight: 600,
            color: ORANGE, textDecoration: 'none',
            backgroundColor: ORANGE + '15',
            border: `1px solid ${ORANGE}33`,
          }}>
            <span>←</span> Simulateur
          </Link>
          {session?.user?.name && (
            <div style={{ marginTop: 12, padding: '0 12px' }}>
              <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.user.name}
              </div>
              <div style={{ fontSize: 10, color: G4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {session.user.email}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 40px' }}>
        {children}
      </div>
    </div>
  );
}
