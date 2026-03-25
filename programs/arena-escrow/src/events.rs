use crate::state::{CompetitionEscrowStatus, CompetitionKind, EscrowSide};
use anchor_lang::prelude::*;

#[event]
pub struct CompetitionEscrowCreated {
    pub escrow_id: String,
    pub competition_kind: CompetitionKind,
    pub mint: Pubkey,
    pub side_a_controller: Pubkey,
    pub side_b_controller: Pubkey,
    pub side_a_amount: u64,
    pub expected_side_b_amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct CompetitionSideFunded {
    pub escrow_id: String,
    pub side: EscrowSide,
    pub contributor: Pubkey,
    pub amount: u64,
    pub side_total: u64,
    pub status: CompetitionEscrowStatus,
}

#[event]
pub struct CompetitionEscrowCancelled {
    pub escrow_id: String,
    pub side_a_refund: u64,
    pub side_b_refund: u64,
}

#[event]
pub struct CompetitionEscrowSettled {
    pub escrow_id: String,
    pub winner_side: EscrowSide,
    pub winner_controller: Pubkey,
    pub winner_amount: u64,
    pub fee_amount: u64,
}

#[event]
pub struct CompetitionEscrowRefunded {
    pub escrow_id: String,
    pub side_a_refund: u64,
    pub side_b_refund: u64,
}

#[event]
pub struct ProgramPaused {
    pub authority: Pubkey,
}

#[event]
pub struct ProgramResumed {
    pub authority: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
}
