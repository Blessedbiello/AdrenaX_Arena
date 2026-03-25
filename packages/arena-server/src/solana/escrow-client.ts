import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { childLogger } from '../logger.js';
import { env } from '../config.js';

const log = childLogger('escrow');

const CONFIG_SEED = Buffer.from('config');
const COMPETITION_SEED = Buffer.from('competition');
const ZERO_PUBKEY = new PublicKey(new Uint8Array(32));

export type EscrowMintSymbol = 'ADX' | 'USDC';
export type CompetitionEscrowKind = 'duel' | 'clan_war';
export type EscrowSide = 'side_a' | 'side_b';
export type EscrowRole = 'challenger' | 'defender' | 'clan_challenger' | 'clan_defender';

export interface EscrowTransactionIntent {
  role: EscrowRole;
  competitionType: CompetitionEscrowKind;
  competitionId: string;
  duelId?: string;
  warId?: string;
  mint: EscrowMintSymbol;
  amount: number;
  rpcUrl: string;
  programId: string;
  serializedTransaction: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  escrowPda: string;
  escrowVaultAta: string;
  mintAddress: string;
  expiresAt: string;
}

interface OperatorEscrowContext {
  competitionId: string;
  mint: EscrowMintSymbol;
}

export class EscrowClient {
  private readonly connection: Connection;
  private readonly programId: PublicKey | null;
  private readonly adxMint: PublicKey | null;
  private readonly usdcMint: PublicKey | null;
  private readonly treasury: PublicKey | null;
  private operatorKeypair: Keypair | null | undefined;

  constructor() {
    this.connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');
    this.programId = env.PROGRAM_ID ? new PublicKey(env.PROGRAM_ID) : null;
    this.adxMint = env.ADX_MINT ? new PublicKey(env.ADX_MINT) : null;
    this.usdcMint = env.USDC_MINT ? new PublicKey(env.USDC_MINT) : null;
    this.treasury = env.TREASURY_PUBKEY ? new PublicKey(env.TREASURY_PUBKEY) : null;
  }

  get isConfigured(): boolean {
    return !!(this.programId && this.adxMint && this.usdcMint);
  }

  get canOperateSettlements(): boolean {
    return this.isConfigured && !!env.OPERATOR_KEYPAIR_PATH && !!this.treasury;
  }

  assertAvailable(): void {
    if (!this.isConfigured) {
      throw new Error('ESCROW_NOT_CONFIGURED');
    }
  }

  async buildChallengerDepositIntent(
    duelId: string,
    challengerPubkey: string,
    mint: EscrowMintSymbol,
    amount: number,
    expiresAt: Date,
    defenderPubkey?: string | null,
  ): Promise<EscrowTransactionIntent> {
    return this.buildCreateCompetitionIntent({
      competitionType: 'duel',
      role: 'challenger',
      competitionId: duelId,
      controllerPubkey: challengerPubkey,
      sideBControllerPubkey: defenderPubkey ?? null,
      mint,
      amount,
      expiresAt,
    });
  }

  async buildDefenderDepositIntent(
    duelId: string,
    defenderPubkey: string,
    mint: EscrowMintSymbol,
    amount: number,
    expiresAt: Date,
  ): Promise<EscrowTransactionIntent> {
    return this.buildFundCompetitionIntent({
      competitionType: 'duel',
      role: 'defender',
      competitionId: duelId,
      contributorPubkey: defenderPubkey,
      side: 'side_b',
      mint,
      amount,
      expiresAt,
    });
  }

  async buildClanChallengerDepositIntent(
    warId: string,
    challengerLeaderPubkey: string,
    mint: EscrowMintSymbol,
    amount: number,
    expiresAt: Date,
    defenderLeaderPubkey: string,
  ): Promise<EscrowTransactionIntent> {
    return this.buildCreateCompetitionIntent({
      competitionType: 'clan_war',
      role: 'clan_challenger',
      competitionId: warId,
      controllerPubkey: challengerLeaderPubkey,
      sideBControllerPubkey: defenderLeaderPubkey,
      mint,
      amount,
      expiresAt,
    });
  }

  async buildClanDefenderDepositIntent(
    warId: string,
    defenderLeaderPubkey: string,
    mint: EscrowMintSymbol,
    amount: number,
    expiresAt: Date,
  ): Promise<EscrowTransactionIntent> {
    return this.buildFundCompetitionIntent({
      competitionType: 'clan_war',
      role: 'clan_defender',
      competitionId: warId,
      contributorPubkey: defenderLeaderPubkey,
      side: 'side_b',
      mint,
      amount,
      expiresAt,
    });
  }

  async verifyUserEscrowSignature(
    signature: string,
    expectedSigner: string,
    expectedCompetitionId?: string,
  ): Promise<void> {
    this.assertAvailable();
    const tx = await this.connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      throw new Error('ESCROW_TX_NOT_CONFIRMED');
    }

    const expectedProgram = this.programId!.toBase58();
    const signerFound = tx.transaction.message.accountKeys.some((account) => account.pubkey.toBase58() === expectedSigner);
    const escrowPda = expectedCompetitionId ? this.deriveEscrowAccounts(expectedCompetitionId, this.resolveMintFromParsedTx(tx)).escrowPda.toBase58() : null;
    const programInstructionFound = tx.transaction.message.instructions.some((instruction: any) => {
      const programId = instruction.programId?.toBase58?.();
      if (programId !== expectedProgram) return false;
      if (!escrowPda) return true;
      return Array.isArray(instruction.accounts)
        && instruction.accounts.some((account: PublicKey) => account.toBase58() === escrowPda);
    });

    if (!signerFound || !programInstructionFound) {
      throw new Error('ESCROW_TX_MISMATCH');
    }
  }

  async settleDuelWinner(
    context: OperatorEscrowContext,
    winnerPubkey: string,
    winnerSide: EscrowSide,
  ): Promise<string | null> {
    return this.settleCompetitionWinner(context, winnerPubkey, winnerSide);
  }

  async refundVoidDuel(
    context: OperatorEscrowContext,
    challengerPubkey: string,
    defenderPubkey: string,
  ): Promise<string | null> {
    return this.refundCompetitionDraw(context, challengerPubkey, defenderPubkey);
  }

  async cancelExpiredDuel(
    context: OperatorEscrowContext,
    challengerPubkey: string,
    defenderPubkey?: string | null,
  ): Promise<string | null> {
    return this.cancelExpiredCompetition(context, challengerPubkey, defenderPubkey ?? challengerPubkey);
  }

  async settleClanWarWinner(
    context: OperatorEscrowContext,
    winnerLeaderPubkey: string,
    winnerSide: EscrowSide,
  ): Promise<string | null> {
    return this.settleCompetitionWinner(context, winnerLeaderPubkey, winnerSide);
  }

  async refundClanWarDraw(
    context: OperatorEscrowContext,
    challengerLeaderPubkey: string,
    defenderLeaderPubkey: string,
  ): Promise<string | null> {
    return this.refundCompetitionDraw(context, challengerLeaderPubkey, defenderLeaderPubkey);
  }

  async cancelExpiredClanWar(
    context: OperatorEscrowContext,
    challengerLeaderPubkey: string,
    defenderLeaderPubkey: string,
  ): Promise<string | null> {
    return this.cancelExpiredCompetition(context, challengerLeaderPubkey, defenderLeaderPubkey);
  }

  async pauseProgram(): Promise<string | null> {
    if (!this.canOperateSettlements) {
      log.warn('Cannot pause escrow program because operator settlement is not configured');
      return null;
    }
    const operator = await this.getOperatorKeypair();
    const tx = await this.createUnsignedTransaction(operator.publicKey);
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePauseProgramInstruction(),
    }));
    return sendAndConfirmTransaction(this.connection, tx, [operator], { commitment: 'confirmed' });
  }

  async resumeProgram(): Promise<string | null> {
    if (!this.canOperateSettlements) {
      log.warn('Cannot resume escrow program because operator settlement is not configured');
      return null;
    }
    const operator = await this.getOperatorKeypair();
    const tx = await this.createUnsignedTransaction(operator.publicKey);
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeResumeProgramInstruction(),
    }));
    return sendAndConfirmTransaction(this.connection, tx, [operator], { commitment: 'confirmed' });
  }

  private async buildCreateCompetitionIntent(params: {
    competitionType: CompetitionEscrowKind;
    role: EscrowRole;
    competitionId: string;
    controllerPubkey: string;
    sideBControllerPubkey?: string | null;
    mint: EscrowMintSymbol;
    amount: number;
    expiresAt: Date;
  }): Promise<EscrowTransactionIntent> {
    this.assertAvailable();
    const controller = new PublicKey(params.controllerPubkey);
    const mintPubkey = this.resolveMint(params.mint);
    const sideBController = params.sideBControllerPubkey ? new PublicKey(params.sideBControllerPubkey) : ZERO_PUBKEY;
    const { escrowPda, vaultAta } = this.deriveEscrowAccounts(params.competitionId, mintPubkey);
    const controllerTokenAta = getAssociatedTokenAddressSync(mintPubkey, controller);
    const tx = await this.createUnsignedTransaction(controller);

    const escrowId = params.competitionId.replace(/-/g, '');
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: controller, isSigner: true, isWritable: true },
        { pubkey: controllerTokenAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeCreateCompetitionEscrowInstruction(
        escrowId,
        params.competitionType,
        sideBController,
        params.amount,
        params.amount,
        params.expiresAt,
      ),
    }));

    return this.serializeIntent(
      params.role,
      params.competitionType,
      params.competitionId,
      params.mint,
      params.amount,
      params.expiresAt,
      tx,
      escrowPda,
      vaultAta,
      mintPubkey,
    );
  }

  private async buildFundCompetitionIntent(params: {
    competitionType: CompetitionEscrowKind;
    role: EscrowRole;
    competitionId: string;
    contributorPubkey: string;
    side: EscrowSide;
    mint: EscrowMintSymbol;
    amount: number;
    expiresAt: Date;
  }): Promise<EscrowTransactionIntent> {
    this.assertAvailable();
    const contributor = new PublicKey(params.contributorPubkey);
    const mintPubkey = this.resolveMint(params.mint);
    const { escrowPda, vaultAta } = this.deriveEscrowAccounts(params.competitionId, mintPubkey);
    const contributorTokenAta = getAssociatedTokenAddressSync(mintPubkey, contributor);
    const tx = await this.createUnsignedTransaction(contributor);

    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: contributor, isSigner: true, isWritable: true },
        { pubkey: contributorTokenAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: encodeFundCompetitionSideInstruction(params.side, params.amount),
    }));

    return this.serializeIntent(
      params.role,
      params.competitionType,
      params.competitionId,
      params.mint,
      params.amount,
      params.expiresAt,
      tx,
      escrowPda,
      vaultAta,
      mintPubkey,
    );
  }

  private async settleCompetitionWinner(
    context: OperatorEscrowContext,
    winnerPubkey: string,
    winnerSide: EscrowSide,
  ): Promise<string | null> {
    if (!this.canOperateSettlements) {
      log.warn({ competitionId: context.competitionId }, 'Escrow settlement skipped because operator settlement is not configured');
      return null;
    }

    const mintPubkey = this.resolveMint(context.mint);
    const winner = new PublicKey(winnerPubkey);
    const { escrowPda, vaultAta } = this.deriveEscrowAccounts(context.competitionId, mintPubkey);
    const winnerAta = getAssociatedTokenAddressSync(mintPubkey, winner);
    const treasuryAta = getAssociatedTokenAddressSync(mintPubkey, this.treasury!);
    const operator = await this.getOperatorKeypair();
    const tx = await this.createUnsignedTransaction(operator.publicKey);

    await this.maybeAppendCreateAta(tx, operator.publicKey, winnerAta, winner, mintPubkey);
    await this.maybeAppendCreateAta(tx, operator.publicKey, treasuryAta, this.treasury!, mintPubkey);
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: winnerAta, isSigner: false, isWritable: true },
        { pubkey: treasuryAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeSettleCompetitionWinnerInstruction(winnerSide),
    }));

    return sendAndConfirmTransaction(this.connection, tx, [operator], { commitment: 'confirmed' });
  }

  private async refundCompetitionDraw(
    context: OperatorEscrowContext,
    sideAPubkey: string,
    sideBPubkey: string,
  ): Promise<string | null> {
    if (!this.canOperateSettlements) {
      log.warn({ competitionId: context.competitionId }, 'Escrow refund skipped because operator settlement is not configured');
      return null;
    }

    const mintPubkey = this.resolveMint(context.mint);
    const sideA = new PublicKey(sideAPubkey);
    const sideB = new PublicKey(sideBPubkey);
    const sideAAta = getAssociatedTokenAddressSync(mintPubkey, sideA);
    const sideBAta = getAssociatedTokenAddressSync(mintPubkey, sideB);
    const { escrowPda, vaultAta } = this.deriveEscrowAccounts(context.competitionId, mintPubkey);
    const operator = await this.getOperatorKeypair();
    const tx = await this.createUnsignedTransaction(operator.publicKey);

    await this.maybeAppendCreateAta(tx, operator.publicKey, sideAAta, sideA, mintPubkey);
    await this.maybeAppendCreateAta(tx, operator.publicKey, sideBAta, sideB, mintPubkey);
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: sideAAta, isSigner: false, isWritable: true },
        { pubkey: sideBAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeRefundCompetitionDrawInstruction(),
    }));

    return sendAndConfirmTransaction(this.connection, tx, [operator], { commitment: 'confirmed' });
  }

  private async cancelExpiredCompetition(
    context: OperatorEscrowContext,
    sideAPubkey: string,
    sideBPubkey: string,
  ): Promise<string | null> {
    if (!this.canOperateSettlements) {
      log.warn({ competitionId: context.competitionId }, 'Escrow cancel skipped because operator settlement is not configured');
      return null;
    }

    const mintPubkey = this.resolveMint(context.mint);
    const sideA = new PublicKey(sideAPubkey);
    const sideB = new PublicKey(sideBPubkey);
    const sideAAta = getAssociatedTokenAddressSync(mintPubkey, sideA);
    const sideBAta = getAssociatedTokenAddressSync(mintPubkey, sideB);
    const { escrowPda, vaultAta } = this.deriveEscrowAccounts(context.competitionId, mintPubkey);
    const operator = await this.getOperatorKeypair();
    const tx = await this.createUnsignedTransaction(operator.publicKey);

    await this.maybeAppendCreateAta(tx, operator.publicKey, sideAAta, sideA, mintPubkey);
    await this.maybeAppendCreateAta(tx, operator.publicKey, sideBAta, sideB, mintPubkey);
    tx.add(new TransactionInstruction({
      programId: this.programId!,
      keys: [
        { pubkey: this.getConfigPda(), isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: sideAAta, isSigner: false, isWritable: true },
        { pubkey: sideBAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeCancelCompetitionEscrowInstruction(),
    }));

    return sendAndConfirmTransaction(this.connection, tx, [operator], { commitment: 'confirmed' });
  }

  private async createUnsignedTransaction(feePayer: PublicKey): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    const tx = new Transaction();
    tx.feePayer = feePayer;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    return tx;
  }

  private async serializeIntent(
    role: EscrowRole,
    competitionType: CompetitionEscrowKind,
    competitionId: string,
    mint: EscrowMintSymbol,
    amount: number,
    expiresAt: Date,
    tx: Transaction,
    escrowPda: PublicKey,
    vaultAta: PublicKey,
    mintPubkey: PublicKey,
  ): Promise<EscrowTransactionIntent> {
    return {
      role,
      competitionType,
      competitionId,
      duelId: competitionType === 'duel' ? competitionId : undefined,
      warId: competitionType === 'clan_war' ? competitionId : undefined,
      mint,
      amount,
      rpcUrl: env.SOLANA_RPC_URL,
      programId: this.programId!.toBase58(),
      serializedTransaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      recentBlockhash: tx.recentBlockhash!,
      lastValidBlockHeight: tx.lastValidBlockHeight!,
      escrowPda: escrowPda.toBase58(),
      escrowVaultAta: vaultAta.toBase58(),
      mintAddress: mintPubkey.toBase58(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async maybeAppendCreateAta(
    tx: Transaction,
    payer: PublicKey,
    ata: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
  ): Promise<void> {
    const existing = await this.connection.getAccountInfo(ata, 'confirmed');
    if (existing) return;

    tx.add(createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ));
  }

  private deriveEscrowAccounts(competitionId: string, mint: PublicKey): { escrowPda: PublicKey; vaultAta: PublicKey } {
    const escrowId = competitionId.replace(/-/g, '');
    const [escrowPda] = PublicKey.findProgramAddressSync([COMPETITION_SEED, Buffer.from(escrowId)], this.programId!);
    const vaultAta = getAssociatedTokenAddressSync(mint, escrowPda, true);
    return { escrowPda, vaultAta };
  }

  private resolveMint(symbol: EscrowMintSymbol): PublicKey {
    if (symbol === 'ADX' && this.adxMint) return this.adxMint;
    if (symbol === 'USDC' && this.usdcMint) return this.usdcMint;
    throw new Error(`ESCROW_MINT_NOT_CONFIGURED:${symbol}`);
  }

  private resolveMintFromParsedTx(tx: Awaited<ReturnType<Connection['getParsedTransaction']>>): PublicKey {
    const mintAddresses = [this.adxMint, this.usdcMint].filter((mint): mint is PublicKey => !!mint).map((mint) => mint.toBase58());
    for (const account of tx?.transaction.message.accountKeys ?? []) {
      const key = account.pubkey.toBase58();
      if (mintAddresses.includes(key)) {
        return new PublicKey(key);
      }
    }
    throw new Error('ESCROW_TX_MINT_NOT_FOUND');
  }

  private getConfigPda(): PublicKey {
    if (env.ESCROW_CONFIG_PDA) {
      return new PublicKey(env.ESCROW_CONFIG_PDA);
    }
    return PublicKey.findProgramAddressSync([CONFIG_SEED], this.programId!)[0];
  }

  private async getOperatorKeypair(): Promise<Keypair> {
    if (this.operatorKeypair !== undefined) {
      if (!this.operatorKeypair) {
        throw new Error('ESCROW_OPERATOR_NOT_CONFIGURED');
      }
      return this.operatorKeypair;
    }

    if (!env.OPERATOR_KEYPAIR_PATH) {
      this.operatorKeypair = null;
      throw new Error('ESCROW_OPERATOR_NOT_CONFIGURED');
    }

    const raw = await readFile(env.OPERATOR_KEYPAIR_PATH, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
    this.operatorKeypair = Keypair.fromSecretKey(secretKey);
    return this.operatorKeypair;
  }
}

let _client: EscrowClient | undefined;

export function getEscrowClient(): EscrowClient {
  if (!_client) {
    _client = new EscrowClient();
  }
  return _client;
}

function encodeCreateCompetitionEscrowInstruction(
  competitionId: string,
  competitionType: CompetitionEscrowKind,
  sideBController: PublicKey,
  sideAAmount: number,
  expectedSideBAmount: number,
  expiresAt: Date,
): Buffer {
  return Buffer.concat([
    anchorDiscriminator('create_competition_escrow'),
    encodeString(competitionId),
    encodeCompetitionKind(competitionType),
    sideBController.toBuffer(),
    encodeU64(sideAAmount),
    encodeU64(expectedSideBAmount),
    encodeI64(Math.floor(expiresAt.getTime() / 1000)),
  ]);
}

function encodeFundCompetitionSideInstruction(side: EscrowSide, amount: number): Buffer {
  return Buffer.concat([
    anchorDiscriminator('fund_competition_side'),
    encodeEscrowSide(side),
    encodeU64(amount),
  ]);
}

function encodeSettleCompetitionWinnerInstruction(side: EscrowSide): Buffer {
  return Buffer.concat([
    anchorDiscriminator('settle_competition_winner'),
    encodeEscrowSide(side),
  ]);
}

function encodeRefundCompetitionDrawInstruction(): Buffer {
  return anchorDiscriminator('refund_competition_draw');
}

function encodeCancelCompetitionEscrowInstruction(): Buffer {
  return anchorDiscriminator('cancel_competition_escrow');
}

function encodePauseProgramInstruction(): Buffer {
  return anchorDiscriminator('pause_program');
}

function encodeResumeProgramInstruction(): Buffer {
  return anchorDiscriminator('resume_program');
}

function encodeCompetitionKind(kind: CompetitionEscrowKind): Buffer {
  return Buffer.from([kind === 'duel' ? 0 : 1]);
}

function encodeEscrowSide(side: EscrowSide): Buffer {
  return Buffer.from([side === 'side_a' ? 0 : 1]);
}

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function encodeU64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(Math.trunc(value)), 0);
  return buf;
}

function encodeI64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(Math.trunc(value)), 0);
  return buf;
}
