use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ArenaConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    #[max_len(8)]
    pub allowed_mints: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CompetitionEscrow {
    #[max_len(32)]
    pub escrow_id: String,
    pub competition_kind: CompetitionKind,
    pub mint: Pubkey,
    pub side_a_controller: Pubkey,
    pub side_b_controller: Pubkey,
    pub expected_side_a_amount: u64,
    pub expected_side_b_amount: u64,
    pub side_a_amount: u64,
    pub side_b_amount: u64,
    pub status: CompetitionEscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub winning_side: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CompetitionKind {
    Duel,
    ClanWar,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CompetitionEscrowStatus {
    Pending,
    PartiallyFunded,
    Funded,
    Settled,
    Refunded,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowSide {
    SideA,
    SideB,
}
