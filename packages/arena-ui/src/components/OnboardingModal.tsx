'use client';

import { useState } from 'react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: 'connect' | 'first_trade' | 'rookie_quest';
}

const steps = {
  connect: {
    title: 'Connect Your Wallet',
    description: 'Connect your Solana wallet to start predicting duel outcomes and earning Mutagen.',
    cta: 'Connect Wallet',
  },
  first_trade: {
    title: 'Make Your First Trade',
    description: 'Complete any trade on Adrena (even $10) to unlock Honor Duels. Challenge anyone, for free!',
    cta: 'Go to Adrena',
  },
  rookie_quest: {
    title: 'Complete Rookie Quest',
    description: 'Complete 3 trades to unlock the Gauntlet and Staked Duels. You\'re almost there!',
    cta: 'View Progress',
  },
};

export default function OnboardingModal({ isOpen, onClose, step }: OnboardingModalProps) {
  if (!isOpen) return null;

  const content = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-arena-card border border-arena-border rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-arena-accent/20 flex items-center justify-center text-3xl mx-auto mb-4">
            {step === 'connect' ? '🔗' : step === 'first_trade' ? '📈' : '🏆'}
          </div>
          <h2 className="text-xl font-bold mb-2">{content.title}</h2>
          <p className="text-arena-muted mb-6">{content.description}</p>

          <div className="space-y-3">
            <button className="w-full bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold py-3 rounded-lg transition-colors">
              {content.cta}
            </button>
            <button
              onClick={onClose}
              className="w-full text-arena-muted hover:text-arena-text py-2 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mt-6">
          {(['connect', 'first_trade', 'rookie_quest'] as const).map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${s === step ? 'bg-arena-accent' : 'bg-arena-border'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
