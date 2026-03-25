use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaEscrowError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Token mint is not in the allowlist")]
    InvalidMint,
    #[msg("Duel escrow is not in Pending status")]
    DuelNotPending,
    #[msg("Duel escrow is not in Funded status")]
    DuelNotFunded,
    #[msg("Duel has not expired yet")]
    DuelNotExpired,
    #[msg("Duel has expired")]
    DuelExpired,
    #[msg("Unauthorized — only the authority can perform this action")]
    Unauthorized,
    #[msg("Fee basis points exceeds maximum (500 = 5%)")]
    InvalidFee,
    #[msg("Duel already accepted by a defender")]
    AlreadyAccepted,
    #[msg("Duel has already been settled")]
    AlreadySettled,
    #[msg("Cannot duel yourself")]
    SelfDuel,
    #[msg("Winner must be either the challenger or defender")]
    InvalidWinner,
    #[msg("Deposit amount must match challenger amount")]
    AmountMismatch,
    #[msg("Duel ID must be between 1 and 32 characters")]
    InvalidDuelId,
}
