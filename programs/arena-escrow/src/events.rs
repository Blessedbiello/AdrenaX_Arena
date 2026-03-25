use anchor_lang::prelude::*;

#[event]
pub struct EscrowCreated {
    pub duel_id: String,
    pub challenger: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct EscrowAccepted {
    pub duel_id: String,
    pub defender: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowCancelled {
    pub duel_id: String,
    pub challenger: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct EscrowSettled {
    pub duel_id: String,
    pub winner: Pubkey,
    pub winner_amount: u64,
    pub fee_amount: u64,
}

#[event]
pub struct EscrowRefunded {
    pub duel_id: String,
    pub challenger_refund: u64,
    pub defender_refund: u64,
}

#[event]
pub struct ProgramPaused {
    pub authority: Pubkey,
}

#[event]
pub struct ProgramResumed {
    pub authority: Pubkey,
}
