use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod state;

use errors::ArenaEscrowError;
use events::*;
use state::*;

declare_id!("BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ");

#[program]
pub mod arena_escrow {
    use super::*;

    /// Initialize the arena config with treasury, fee, and allowed mints.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        fee_bps: u16,
        allowed_mints: Vec<Pubkey>,
    ) -> Result<()> {
        require!(fee_bps <= 500, ArenaEscrowError::InvalidFee);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.fee_bps = fee_bps;
        config.paused = false;
        config.allowed_mints = allowed_mints;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    /// Create a duel escrow — challenger deposits their stake.
    pub fn create_duel_escrow(
        ctx: Context<CreateDuelEscrow>,
        duel_id: String,
        amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        // CRITICAL-4: validate duel_id length before any state writes
        require!(
            !duel_id.is_empty() && duel_id.len() <= 32,
            ArenaEscrowError::InvalidDuelId
        );

        let config = &ctx.accounts.config;
        require!(!config.paused, ArenaEscrowError::Paused);
        require!(
            config.allowed_mints.contains(&ctx.accounts.mint.key()),
            ArenaEscrowError::InvalidMint
        );

        // MINOR-2: expires_at must be in the future
        let now = Clock::get()?.unix_timestamp;
        require!(expires_at > now, ArenaEscrowError::DuelExpired);

        // Transfer challenger's tokens to escrow vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.challenger_token_account.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.challenger.to_account_info(),
                },
            ),
            amount,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.duel_id = duel_id.clone();
        escrow.challenger = ctx.accounts.challenger.key();
        escrow.defender = Pubkey::default();
        escrow.mint = ctx.accounts.mint.key();
        escrow.challenger_amount = amount;
        escrow.defender_amount = 0;
        escrow.status = EscrowStatus::Pending;
        escrow.created_at = now;
        escrow.expires_at = expires_at;
        escrow.winner = Pubkey::default();
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowCreated {
            duel_id,
            challenger: ctx.accounts.challenger.key(),
            mint: ctx.accounts.mint.key(),
            amount,
            expires_at,
        });

        Ok(())
    }

    /// Accept a duel — defender deposits matching stake.
    pub fn accept_duel_escrow(ctx: Context<AcceptDuelEscrow>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ArenaEscrowError::Paused);

        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Pending,
            ArenaEscrowError::DuelNotPending
        );
        require!(
            ctx.accounts.defender.key() != escrow.challenger,
            ArenaEscrowError::SelfDuel
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.expires_at, ArenaEscrowError::DuelExpired);
        require!(
            amount == escrow.challenger_amount,
            ArenaEscrowError::AmountMismatch
        );

        // Transfer defender's tokens to escrow vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.defender_token_account.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.defender.to_account_info(),
                },
            ),
            amount,
        )?;

        escrow.defender = ctx.accounts.defender.key();
        escrow.defender_amount = amount;
        escrow.status = EscrowStatus::Funded;

        emit!(EscrowAccepted {
            duel_id: escrow.duel_id.clone(),
            defender: ctx.accounts.defender.key(),
            amount,
        });

        Ok(())
    }

    /// Cancel an expired duel — permissionless, refunds challenger.
    pub fn cancel_expired_duel(ctx: Context<CancelExpiredDuel>) -> Result<()> {
        require!(
            ctx.accounts.escrow.status == EscrowStatus::Pending,
            ArenaEscrowError::DuelNotPending
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.escrow.expires_at, ArenaEscrowError::DuelNotExpired);

        // Extract all values before any borrows that conflict with CPI.
        // CRITICAL-5: escrow account will be closed (close = caller) after this handler returns,
        // so all needed data must be read into locals first.
        let refund = ctx.accounts.escrow.challenger_amount;
        let duel_id_bytes = ctx.accounts.escrow.duel_id.as_bytes().to_vec();
        let bump = ctx.accounts.escrow.bump;
        let challenger = ctx.accounts.escrow.challenger;
        let duel_id_str = ctx.accounts.escrow.duel_id.clone();
        let escrow_account_info = ctx.accounts.escrow.to_account_info();

        let seeds: &[&[u8]] = &[b"duel", &duel_id_bytes, &[bump]];
        let signer_seeds = &[seeds];

        // Refund challenger
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.challenger_token_account.to_account_info(),
                    authority: escrow_account_info,
                },
                signer_seeds,
            ),
            refund,
        )?;

        // Mark status before Anchor closes the account
        ctx.accounts.escrow.status = EscrowStatus::Cancelled;

        emit!(EscrowCancelled {
            duel_id: duel_id_str,
            challenger,
            refund_amount: refund,
        });

        Ok(())
    }

    /// Settle a duel — authority transfers winnings to winner, fee to treasury.
    pub fn settle_duel_winner(
        ctx: Context<SettleDuelWinner>,
        winner: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.escrow.status == EscrowStatus::Funded,
            ArenaEscrowError::DuelNotFunded
        );
        require!(
            winner == ctx.accounts.escrow.challenger || winner == ctx.accounts.escrow.defender,
            ArenaEscrowError::InvalidWinner
        );

        // CRITICAL-2: winner_token_account.owner cannot be constrained at account-context level
        // because `winner` is an instruction arg, not an account. Runtime check required.
        require!(
            ctx.accounts.winner_token_account.owner == winner,
            ArenaEscrowError::InvalidWinner
        );

        // Extract all values before any borrows that conflict with CPI.
        // CRITICAL-5: escrow will be closed (close = authority) after handler returns.
        let challenger_amount = ctx.accounts.escrow.challenger_amount;
        let defender_amount = ctx.accounts.escrow.defender_amount;
        // MAJOR-5: use checked arithmetic to prevent overflow
        let total = challenger_amount
            .checked_add(defender_amount)
            .ok_or(ArenaEscrowError::AmountMismatch)?;
        let fee = total * (ctx.accounts.config.fee_bps as u64) / 10_000;
        let winner_amount = total - fee;
        let duel_id_bytes = ctx.accounts.escrow.duel_id.as_bytes().to_vec();
        let bump = ctx.accounts.escrow.bump;
        let duel_id_str = ctx.accounts.escrow.duel_id.clone();
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let escrow_account_info2 = ctx.accounts.escrow.to_account_info();

        let seeds: &[&[u8]] = &[b"duel", &duel_id_bytes, &[bump]];
        let signer_seeds = &[seeds];

        // Transfer to winner
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: escrow_account_info,
                },
                signer_seeds,
            ),
            winner_amount,
        )?;

        // Transfer fee to treasury
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.treasury_token_account.to_account_info(),
                        authority: escrow_account_info2,
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        // Mark status and winner before Anchor closes the account
        ctx.accounts.escrow.status = EscrowStatus::Settled;
        ctx.accounts.escrow.winner = winner;

        emit!(EscrowSettled {
            duel_id: duel_id_str,
            winner,
            winner_amount,
            fee_amount: fee,
        });

        Ok(())
    }

    /// Refund a voided duel — authority returns stakes to both parties.
    pub fn refund_void_duel(ctx: Context<RefundVoidDuel>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.escrow.status == EscrowStatus::Funded,
            ArenaEscrowError::DuelNotFunded
        );

        // Extract all values before any borrows that conflict with CPI
        let duel_id_bytes = ctx.accounts.escrow.duel_id.as_bytes().to_vec();
        let bump = ctx.accounts.escrow.bump;
        let challenger_amount = ctx.accounts.escrow.challenger_amount;
        let defender_amount = ctx.accounts.escrow.defender_amount;
        let duel_id_str = ctx.accounts.escrow.duel_id.clone();
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let escrow_account_info2 = ctx.accounts.escrow.to_account_info();

        let seeds: &[&[u8]] = &[b"duel", &duel_id_bytes, &[bump]];
        let signer_seeds = &[seeds];

        // Refund challenger
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.challenger_token_account.to_account_info(),
                    authority: escrow_account_info,
                },
                signer_seeds,
            ),
            challenger_amount,
        )?;

        // Refund defender
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.defender_token_account.to_account_info(),
                    authority: escrow_account_info2,
                },
                signer_seeds,
            ),
            defender_amount,
        )?;

        // Mark status before Anchor closes the account
        ctx.accounts.escrow.status = EscrowStatus::Refunded;

        emit!(EscrowRefunded {
            duel_id: duel_id_str,
            challenger_refund: challenger_amount,
            defender_refund: defender_amount,
        });

        Ok(())
    }

    /// Pause the program — authority only.
    pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            ArenaEscrowError::Unauthorized
        );
        config.paused = true;

        emit!(ProgramPaused {
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    /// Resume the program — authority only.
    pub fn resume_program(ctx: Context<ResumeProgram>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            ArenaEscrowError::Unauthorized
        );
        config.paused = false;

        emit!(ProgramResumed {
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }
}

// ── Account Contexts ──

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ArenaConfig::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(duel_id: String)]
pub struct CreateDuelEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        init,
        payer = challenger,
        space = 8 + DuelEscrow::INIT_SPACE,
        seeds = [b"duel", duel_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, DuelEscrow>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(
        mut,
        constraint = challenger_token_account.mint == mint.key() @ ArenaEscrowError::InvalidMint,
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    /// Escrow vault token account — must be pre-created by the client
    /// as an associated token account owned by the escrow PDA.
    /// CRITICAL-1: vault must be owned by the escrow PDA and hold the correct mint.
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow.key() @ ArenaEscrowError::Unauthorized,
        constraint = escrow_vault.mint == mint.key() @ ArenaEscrowError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    // MINOR-5: rent sysvar removed; not needed with Anchor's init macro
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptDuelEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut, seeds = [b"duel", escrow.duel_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, DuelEscrow>,
    #[account(mut)]
    pub defender: Signer<'info>,
    #[account(
        mut,
        constraint = defender_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub defender_token_account: Account<'info, TokenAccount>,
    /// CRITICAL-1: vault must be owned by the escrow PDA and hold the correct mint.
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow.key() @ ArenaEscrowError::Unauthorized,
        constraint = escrow_vault.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelExpiredDuel<'info> {
    /// CRITICAL-5: close the escrow account and return rent to caller after the handler returns.
    #[account(
        mut,
        close = caller,
        seeds = [b"duel", escrow.duel_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, DuelEscrow>,
    /// Anyone can call cancel on an expired duel
    #[account(mut)]
    pub caller: Signer<'info>,
    /// MAJOR-2: constrain both owner and mint on the challenger refund account.
    #[account(
        mut,
        constraint = challenger_token_account.owner == escrow.challenger @ ArenaEscrowError::Unauthorized,
        constraint = challenger_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    /// CRITICAL-1: vault must be owned by the escrow PDA and hold the correct mint.
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow.key() @ ArenaEscrowError::Unauthorized,
        constraint = escrow_vault.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleDuelWinner<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    /// CRITICAL-5: close the escrow account and return rent to authority after handler returns.
    #[account(
        mut,
        close = authority,
        seeds = [b"duel", escrow.duel_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, DuelEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CRITICAL-2: mint check enforced here; owner check done at runtime (winner is an arg).
    #[account(
        mut,
        constraint = winner_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub winner_token_account: Account<'info, TokenAccount>,
    /// CRITICAL-3: treasury token account must be owned by the config treasury and correct mint.
    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury @ ArenaEscrowError::Unauthorized,
        constraint = treasury_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    /// CRITICAL-1: vault must be owned by the escrow PDA and hold the correct mint.
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow.key() @ ArenaEscrowError::Unauthorized,
        constraint = escrow_vault.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundVoidDuel<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    /// CRITICAL-5: close the escrow account and return rent to authority after handler returns.
    #[account(
        mut,
        close = authority,
        seeds = [b"duel", escrow.duel_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, DuelEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// MAJOR-2: constrain both owner and mint on the challenger refund account.
    #[account(
        mut,
        constraint = challenger_token_account.owner == escrow.challenger @ ArenaEscrowError::Unauthorized,
        constraint = challenger_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    /// MAJOR-2: constrain both owner and mint on the defender refund account.
    #[account(
        mut,
        constraint = defender_token_account.owner == escrow.defender @ ArenaEscrowError::Unauthorized,
        constraint = defender_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub defender_token_account: Account<'info, TokenAccount>,
    /// CRITICAL-1: vault must be owned by the escrow PDA and hold the correct mint.
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow.key() @ ArenaEscrowError::Unauthorized,
        constraint = escrow_vault.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseProgram<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeProgram<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    pub authority: Signer<'info>,
}
