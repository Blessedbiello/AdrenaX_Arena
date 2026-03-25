import { Suspense } from 'react';
import DuelsPageClient from './DuelsPageClient';

export default function DuelsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-arena-bg" />}>
      <DuelsPageClient />
    </Suspense>
  );
}
