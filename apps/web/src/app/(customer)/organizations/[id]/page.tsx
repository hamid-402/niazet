'use client';
import { use } from 'react';
import { OrganizationWorkspace } from '@/components/organization-workspace';
export default function OrganizationPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <OrganizationWorkspace key={id} id={id} />; }
