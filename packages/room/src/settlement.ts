import { PlayerIdSchema } from "@nostakes/engine";
import { AmountSchema, NetSchema } from "@nostakes/ledger";
import { Schema } from "effect";

export const BalanceSchema = Schema.Struct({
  boughtIn: Schema.Int,
  cashedOut: Schema.Int,
  net: NetSchema,
  player: PlayerIdSchema,
});

export type Balance = typeof BalanceSchema.Type;

export const TransferSchema = Schema.Struct({
  amount: AmountSchema,
  from: PlayerIdSchema,
  to: PlayerIdSchema,
});

export type Transfer = typeof TransferSchema.Type;

export const SettlementSchema = Schema.Struct({
  balances: Schema.Array(BalanceSchema),
  transfers: Schema.Array(TransferSchema),
});

export type Settlement = typeof SettlementSchema.Type;
