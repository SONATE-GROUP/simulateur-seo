'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function WorkspacesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/workspaces'); }, [router]);
  return null;
}
