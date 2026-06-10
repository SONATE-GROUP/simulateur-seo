'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function RapportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/rapports'); }, [router]);
  return null;
}
