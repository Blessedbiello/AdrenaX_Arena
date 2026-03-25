use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

pub mod errors;
pub mod events;
pub mod state;

use errors::ArenaEscrowError;
use events::*;
use state::*;

declare_id!("BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ");

const CONFIG_SEED: &[u8] = b"config";
const COMPETITION_SEED: &[u8] = b"competition";
const NO_WINNING_SIDE: u8 = u8::MAX;

#[program]
pub mod arena_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        fee_bps: u16,
        allowed_mints: Vec<Pubkey>,
    ) -> Result<()> {
        require!(fee_bps <= 500, ArenaEscrowError::InvalidFee);
        require!(!allowed_mints.is_empty(), ArenaEscrowError::InvalidMint);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.fee_bps = fee_bps;
        config.paused = false;
        config.allowed_mints = allowed_mints;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    pub fn create_competition_escrow(
        ctx: Context<CreateCompetitionEscrow>,
        escrow_id: String,
        competition_kind: CompetitionKind,
        side_b_controller: Pubkey,
        side_a_amount: u64,
        expected_side_b_amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        validate_escrow_setup(
            &ctx.accounts.config,
            &ctx.accounts.mint,
            &escrow_id,
            ctx.accounts.side_a_controller.key(),
            side_b_controller,
            side_a_amount,
            expected_side_b_amount,
            expires_at,
        )?;

        transfer_to_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts
                .side_a_controller_token_account
                .to_account_info(),
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.side_a_controller.to_account_info(),
            side_a_amount,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let status = CompetitionEscrowStatus::PartiallyFunded;

        let escrow = &mut ctx.accounts.escrow;
        escrow.escrow_id = escrow_id.clone();
        escrow.competition_kind = competition_kind;
        escrow.mint = ctx.accounts.mint.key();
        escrow.side_a_controller = ctx.accounts.side_a_controller.key();
        escrow.side_b_controller = side_b_controller;
        escrow.expected_side_a_amount = side_a_amount;
        escrow.expected_side_b_amount = expected_side_b_amount;
        escrow.side_a_amount = side_a_amount;
        escrow.side_b_amount = 0;
        escrow.status = status;
        escrow.created_at = now;
        escrow.expires_at = expires_at;
        escrow.winning_side = NO_WINNING_SIDE;
        escrow.bump = ctx.bumps.escrow;

        emit!(CompetitionEscrowCreated {
            escrow_id: escrow_id.clone(),
            competition_kind,
            mint: ctx.accounts.mint.key(),
            side_a_controller: ctx.accounts.side_a_controller.key(),
            side_b_controller,
            side_a_amount,
            expected_side_b_amount,
            expires_at,
        });

        emit!(CompetitionSideFunded {
            escrow_id,
            side: EscrowSide::SideA,
            contributor: ctx.accounts.side_a_controller.key(),
            amount: side_a_amount,
            side_total: side_a_amount,
            status,
        });

        Ok(())
    }

    pub fn fund_competition_side(
        ctx: Context<FundCompetitionSide>,
        side: EscrowSide,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ArenaEscrowError::InvalidAmount);
        require!(!ctx.accounts.config.paused, ArenaEscrowError::Paused);

        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == CompetitionEscrowStatus::PartiallyFunded,
            ArenaEscrowError::EscrowNotPending
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.expires_at, ArenaEscrowError::EscrowExpired);

        let contributor = ctx.accounts.contributor.key();
        let (controller, next_total) = match side {
            EscrowSide::SideA => {
                require!(
                    contributor == escrow.side_a_controller,
                    ArenaEscrowError::InvalidSideController
                );
                let expected_amount = escrow.expected_side_a_amount;
                let next_total = escrow
                    .side_a_amount
                    .checked_add(amount)
                    .ok_or(ArenaEscrowError::ContributionTooLarge)?;
                require!(
                    next_total <= expected_amount,
                    ArenaEscrowError::ContributionTooLarge
                );
                (escrow.side_a_controller, next_total)
            }
            EscrowSide::SideB => {
                if escrow.side_b_controller == Pubkey::default() {
                    escrow.side_b_controller = contributor;
                }
                require!(
                    contributor == escrow.side_b_controller,
                    ArenaEscrowError::InvalidSideController
                );
                let expected_amount = escrow.expected_side_b_amount;
                let next_total = escrow
                    .side_b_amount
                    .checked_add(amount)
                    .ok_or(ArenaEscrowError::ContributionTooLarge)?;
                require!(
                    next_total <= expected_amount,
                    ArenaEscrowError::ContributionTooLarge
                );
                (escrow.side_b_controller, next_total)
            }
        };

        transfer_to_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.contributor_token_account.to_account_info(),
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.contributor.to_account_info(),
            amount,
        )?;

        match side {
            EscrowSide::SideA => escrow.side_a_amount = next_total,
            EscrowSide::SideB => escrow.side_b_amount = next_total,
        }
        escrow.status = if escrow.side_a_amount == escrow.expected_side_a_amount
            && escrow.side_b_amount == escrow.expected_side_b_amount
        {
            CompetitionEscrowStatus::Funded
        } else {
            CompetitionEscrowStatus::PartiallyFunded
        };

        emit!(CompetitionSideFunded {
            escrow_id: escrow.escrow_id.clone(),
            side,
            contributor: controller,
            amount,
            side_total: next_total,
            status: escrow.status,
        });

        Ok(())
    }

    pub fn cancel_competition_escrow(ctx: Context<CancelCompetitionEscrow>) -> Result<()> {
        let caller = ctx.accounts.caller.key();
        let escrow = &ctx.accounts.escrow;
        require!(
            caller == escrow.side_a_controller
                || caller == escrow.side_b_controller
                || caller == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now >= escrow.expires_at, ArenaEscrowError::EscrowNotExpired);
        require!(
            escrow.status == CompetitionEscrowStatus::PartiallyFunded,
            ArenaEscrowError::EscrowNotPending
        );

        let side_a_amount = escrow.side_a_amount;
        let side_b_amount = escrow.side_b_amount;
        let escrow_id = escrow.escrow_id.clone();
        let bump = [escrow.bump];
        let signer = &[COMPETITION_SEED, escrow.escrow_id.as_bytes(), &bump[..]];
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let vault_info = ctx.accounts.escrow_vault.to_account_info();

        if side_a_amount > 0 {
            require!(
                ctx.accounts.side_a_token_account.owner == ctx.accounts.escrow.side_a_controller,
                ArenaEscrowError::InvalidSideController
            );
            transfer_from_vault(
                ctx.accounts.token_program.to_account_info(),
                vault_info.clone(),
                ctx.accounts.side_a_token_account.to_account_info(),
                escrow_account_info.clone(),
                signer,
                side_a_amount,
            )?;
        }

        if side_b_amount > 0 {
            require!(
                ctx.accounts.side_b_token_account.owner == ctx.accounts.escrow.side_b_controller,
                ArenaEscrowError::InvalidSideController
            );
            transfer_from_vault(
                ctx.accounts.token_program.to_account_info(),
                vault_info.clone(),
                ctx.accounts.side_b_token_account.to_account_info(),
                escrow_account_info.clone(),
                signer,
                side_b_amount,
            )?;
        }

        close_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info,
            ctx.accounts.caller.to_account_info(),
            escrow_account_info,
            signer,
        )?;

        ctx.accounts.escrow.status = CompetitionEscrowStatus::Cancelled;

        emit!(CompetitionEscrowCancelled {
            escrow_id,
            side_a_refund: side_a_amount,
            side_b_refund: side_b_amount,
        });

        Ok(())
    }

    pub fn settle_competition_winner(
        ctx: Context<SettleCompetitionWinner>,
        winner_side: EscrowSide,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );
        require!(!ctx.accounts.config.paused, ArenaEscrowError::Paused);
        require!(
            ctx.accounts.escrow.status == CompetitionEscrowStatus::Funded,
            ArenaEscrowError::EscrowNotFunded
        );

        let winner_controller = controller_for_side(&ctx.accounts.escrow, winner_side);
        require!(
            winner_controller != Pubkey::default(),
            ArenaEscrowError::InvalidWinnerSide
        );
        require!(
            ctx.accounts.winner_token_account.owner == winner_controller,
            ArenaEscrowError::InvalidSideController
        );
        require!(
            ctx.accounts.treasury_token_account.owner == ctx.accounts.config.treasury,
            ArenaEscrowError::Unauthorized
        );

        let total = ctx
            .accounts
            .escrow
            .side_a_amount
            .checked_add(ctx.accounts.escrow.side_b_amount)
            .ok_or(ArenaEscrowError::ContributionTooLarge)?;
        // Fee truncates toward zero (integer division), slightly favoring the winner.
        // This is intentional: winners receive at least the non-fee portion.
        let fee = total
            .checked_mul(ctx.accounts.config.fee_bps as u64)
            .ok_or(ArenaEscrowError::ContributionTooLarge)?
            / 10_000;
        let winner_amount = total
            .checked_sub(fee)
            .ok_or(ArenaEscrowError::ContributionTooLarge)?;
        let escrow_id = ctx.accounts.escrow.escrow_id.clone();
        let bump = [ctx.accounts.escrow.bump];
        let signer = &[
            COMPETITION_SEED,
            ctx.accounts.escrow.escrow_id.as_bytes(),
            &bump[..],
        ];
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let vault_info = ctx.accounts.escrow_vault.to_account_info();

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info.clone(),
            ctx.accounts.winner_token_account.to_account_info(),
            escrow_account_info.clone(),
            signer,
            winner_amount,
        )?;

        if fee > 0 {
            transfer_from_vault(
                ctx.accounts.token_program.to_account_info(),
                vault_info.clone(),
                ctx.accounts.treasury_token_account.to_account_info(),
                escrow_account_info.clone(),
                signer,
                fee,
            )?;
        }

        close_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info,
            ctx.accounts.authority.to_account_info(),
            escrow_account_info,
            signer,
        )?;

        ctx.accounts.escrow.status = CompetitionEscrowStatus::Settled;
        ctx.accounts.escrow.winning_side = winner_side as u8;

        emit!(CompetitionEscrowSettled {
            escrow_id,
            winner_side,
            winner_controller,
            winner_amount,
            fee_amount: fee,
        });

        Ok(())
    }

    pub fn refund_competition_draw(ctx: Context<RefundCompetitionDraw>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );
        require!(!ctx.accounts.config.paused, ArenaEscrowError::Paused);
        require!(
            ctx.accounts.escrow.status == CompetitionEscrowStatus::Funded,
            ArenaEscrowError::EscrowNotFunded
        );
        require!(
            ctx.accounts.escrow.side_b_controller != Pubkey::default(),
            ArenaEscrowError::InvalidSideSetup
        );
        require!(
            ctx.accounts.side_a_token_account.owner == ctx.accounts.escrow.side_a_controller,
            ArenaEscrowError::InvalidSideController
        );
        require!(
            ctx.accounts.side_b_token_account.owner == ctx.accounts.escrow.side_b_controller,
            ArenaEscrowError::InvalidSideController
        );

        let side_a_amount = ctx.accounts.escrow.side_a_amount;
        let side_b_amount = ctx.accounts.escrow.side_b_amount;
        let escrow_id = ctx.accounts.escrow.escrow_id.clone();
        let bump = [ctx.accounts.escrow.bump];
        let signer = &[
            COMPETITION_SEED,
            ctx.accounts.escrow.escrow_id.as_bytes(),
            &bump[..],
        ];
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let vault_info = ctx.accounts.escrow_vault.to_account_info();

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info.clone(),
            ctx.accounts.side_a_token_account.to_account_info(),
            escrow_account_info.clone(),
            signer,
            side_a_amount,
        )?;

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info.clone(),
            ctx.accounts.side_b_token_account.to_account_info(),
            escrow_account_info.clone(),
            signer,
            side_b_amount,
        )?;

        close_vault(
            ctx.accounts.token_program.to_account_info(),
            vault_info,
            ctx.accounts.authority.to_account_info(),
            escrow_account_info,
            signer,
        )?;

        ctx.accounts.escrow.status = CompetitionEscrowStatus::Refunded;

        emit!(CompetitionEscrowRefunded {
            escrow_id,
            side_a_refund: side_a_amount,
            side_b_refund: side_b_amount,
        });

        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        treasury: Option<Pubkey>,
        fee_bps: Option<u16>,
        allowed_mints: Option<Vec<Pubkey>>,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ArenaEscrowError::Unauthorized
        );
        let config = &mut ctx.accounts.config;
        if let Some(t) = treasury {
            config.treasury = t;
        }
        if let Some(f) = fee_bps {
            require!(f <= 500, ArenaEscrowError::InvalidFee);
            config.fee_bps = f;
        }
        if let Some(mints) = allowed_mints {
            require!(!mints.is_empty(), ArenaEscrowError::InvalidMint);
            config.allowed_mints = mints;
        }

        emit!(ConfigUpdated {
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

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

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ArenaConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: String)]
pub struct CreateCompetitionEscrow<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        init,
        payer = side_a_controller,
        space = 8 + CompetitionEscrow::INIT_SPACE,
        seeds = [COMPETITION_SEED, escrow_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, CompetitionEscrow>,
    #[account(mut)]
    pub side_a_controller: Signer<'info>,
    #[account(
        mut,
        constraint = side_a_controller_token_account.owner == side_a_controller.key() @ ArenaEscrowError::InvalidSideController,
        constraint = side_a_controller_token_account.mint == mint.key() @ ArenaEscrowError::InvalidMint,
    )]
    pub side_a_controller_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = side_a_controller,
        associated_token::mint = mint,
        associated_token::authority = escrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundCompetitionSide<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut, seeds = [COMPETITION_SEED, escrow.escrow_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, CompetitionEscrow>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        mut,
        constraint = contributor_token_account.owner == contributor.key() @ ArenaEscrowError::InvalidSideController,
        constraint = contributor_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub contributor_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelCompetitionEscrow<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        mut,
        close = caller,
        seeds = [COMPETITION_SEED, escrow.escrow_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, CompetitionEscrow>,
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        constraint = side_a_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
        constraint = side_a_token_account.owner == escrow.side_a_controller @ ArenaEscrowError::InvalidSideController,
    )]
    pub side_a_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = side_b_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
        constraint = escrow.side_b_amount == 0 || side_b_token_account.owner == escrow.side_b_controller @ ArenaEscrowError::InvalidSideController,
    )]
    pub side_b_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleCompetitionWinner<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        mut,
        close = authority,
        seeds = [COMPETITION_SEED, escrow.escrow_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, CompetitionEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = winner_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub winner_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundCompetitionDraw<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        mut,
        close = authority,
        seeds = [COMPETITION_SEED, escrow.escrow_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, CompetitionEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = side_a_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
        constraint = side_a_token_account.owner == escrow.side_a_controller @ ArenaEscrowError::InvalidSideController,
    )]
    pub side_a_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = side_b_token_account.mint == escrow.mint @ ArenaEscrowError::InvalidMint,
        constraint = side_b_token_account.owner == escrow.side_b_controller @ ArenaEscrowError::InvalidSideController,
    )]
    pub side_b_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseProgram<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeProgram<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    pub authority: Signer<'info>,
}

fn validate_escrow_setup(
    config: &Account<ArenaConfig>,
    mint: &Account<Mint>,
    escrow_id: &str,
    side_a_controller: Pubkey,
    side_b_controller: Pubkey,
    side_a_amount: u64,
    expected_side_b_amount: u64,
    expires_at: i64,
) -> Result<()> {
    require!(!config.paused, ArenaEscrowError::Paused);
    require!(
        !escrow_id.is_empty() && escrow_id.len() <= 32,
        ArenaEscrowError::InvalidEscrowId
    );
    require!(
        config.allowed_mints.contains(&mint.key()),
        ArenaEscrowError::InvalidMint
    );
    require!(side_a_amount > 0, ArenaEscrowError::InvalidAmount);
    require!(expected_side_b_amount > 0, ArenaEscrowError::InvalidAmount);
    require!(
        side_b_controller == Pubkey::default() || side_b_controller != side_a_controller,
        ArenaEscrowError::InvalidSideSetup
    );

    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, ArenaEscrowError::EscrowExpired);
    Ok(())
}

fn controller_for_side(escrow: &CompetitionEscrow, side: EscrowSide) -> Pubkey {
    match side {
        EscrowSide::SideA => escrow.side_a_controller,
        EscrowSide::SideB => escrow.side_b_controller,
    }
}

fn transfer_to_vault<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    token::transfer(
        CpiContext::new(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
        ),
        amount,
    )
}

fn transfer_from_vault<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
            &[signer_seeds],
        ),
        amount,
    )
}

fn close_vault<'info>(
    token_program: AccountInfo<'info>,
    account: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    token::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account,
            destination,
            authority,
        },
        &[signer_seeds],
    ))
}
