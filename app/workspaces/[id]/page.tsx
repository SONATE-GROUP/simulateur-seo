'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
export default function WorkspaceDetailRedirect() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  useEffect(() => { router.replace(`/admin/workspaces/${params.id}`); }, [router, params.id]);
  return null;
}
