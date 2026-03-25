use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ArenaConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,       // Max 500 (5%)
    pub paused: bool,
    #[max_len(4)]
    pub allowed_mints: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DuelEscrow {
    #[max_len(64)]
    pub duel_id: String,
    pub challenger: Pubkey,
    pub defender: Pubkey,     // Pubkey::default() until accepted
    pub mint: Pubkey,
    pub challenger_amount: u64,
    pub defender_amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub winner: Pubkey,       // Pubkey::default() until settled
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Pending,
    Funded,
    Settled,
    Refunded,
    Cancelled,
}
