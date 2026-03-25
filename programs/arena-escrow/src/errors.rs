use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaEscrowError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Token mint is not in the allowlist")]
    InvalidMint,
    #[msg("Escrow is not in a pending or partially funded state")]
    EscrowNotPending,
    #[msg("Escrow is not fully funded")]
    EscrowNotFunded,
    #[msg("Escrow cannot be refunded from its current state")]
    EscrowNotRefundable,
    #[msg("Escrow has not expired yet")]
    EscrowNotExpired,
    #[msg("Escrow has expired")]
    EscrowExpired,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Fee basis points exceeds maximum (500 = 5%)")]
    InvalidFee,
    #[msg("Escrow identifier must be between 1 and 32 characters")]
    InvalidEscrowId,
    #[msg("Side contribution exceeds the configured target amount")]
    ContributionTooLarge,
    #[msg("A contribution amount must be greater than zero")]
    InvalidAmount,
    #[msg("Winner side is invalid")]
    InvalidWinnerSide,
    #[msg("The contributor does not control this escrow side")]
    InvalidSideController,
    #[msg("Side B controller must be distinct when preconfigured")]
    InvalidSideSetup,
}
