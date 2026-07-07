'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function ConfigurationRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/configuration'); }, [router]);
  return null;
}
