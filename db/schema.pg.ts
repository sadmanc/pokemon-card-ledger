import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, real, text } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const items = pgTable("items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  itemType: text("item_type").notNull().default("card"),
  setName: text("set_name").notNull().default(""),
  cardNumber: text("card_number").notNull().default(""),
  condition: text("condition").notNull().default("Near Mint"),
  grade: text("grade").notNull().default("Raw"),
  quantity: integer("quantity").notNull().default(0),
  costBasisCad: real("cost_basis_cad").notNull().default(0),
  currentValueCad: real("current_value_cad").notNull().default(0),
  valuationDate: text("valuation_date").notNull().default(""),
  valuationSource: text("valuation_source").notNull().default("PriceCharting"),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  ...timestamps,
});

export const transactions = pgTable("transactions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  transactionDate: text("transaction_date").notNull(),
  itemId: integer("item_id"),
  itemName: text("item_name").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  amountCad: real("amount_cad").notNull().default(0),
  cashDeltaCad: real("cash_delta_cad").notNull().default(0),
  creditDeltaCad: real("credit_delta_cad").notNull().default(0),
  feesCad: real("fees_cad").notNull().default(0),
  shippingCad: real("shipping_cad").notNull().default(0),
  taxCad: real("tax_cad").notNull().default(0),
  acquisitionCostCad: real("acquisition_cost_cad").notNull().default(0),
  realizedProfitCad: real("realized_profit_cad").notNull().default(0),
  source: text("source").notNull().default("Manual"),
  notes: text("notes").notNull().default(""),
  ...timestamps,
});

export const transactionItems = pgTable("transaction_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  transactionId: integer("transaction_id").notNull(),
  itemId: integer("item_id"),
  itemName: text("item_name").notNull(),
  itemType: text("item_type").notNull().default("card"),
  setName: text("set_name").notNull().default(""),
  cardNumber: text("card_number").notNull().default(""),
  condition: text("condition").notNull().default("Near Mint"),
  grade: text("grade").notNull().default("Raw"),
  quantity: integer("quantity").notNull().default(1),
  amountCad: real("amount_cad").notNull().default(0),
  acquisitionCostCad: real("acquisition_cost_cad").notNull().default(0),
  currentValueCad: real("current_value_cad").notNull().default(0),
  valuationDate: text("valuation_date").notNull().default(""),
  valuationSource: text("valuation_source").notNull().default("PriceCharting"),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const trades = pgTable("trades", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  tradeDate: text("trade_date").notNull(),
  givenItems: text("given_items").notNull().default(""),
  receivedItems: text("received_items").notNull().default(""),
  valueGivenCad: real("value_given_cad").notNull().default(0),
  valueReceivedCad: real("value_received_cad").notNull().default(0),
  cashDeltaCad: real("cash_delta_cad").notNull().default(0),
  notes: text("notes").notNull().default(""),
  ...timestamps,
});

export const tradeItems = pgTable("trade_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  tradeId: integer("trade_id").notNull(),
  side: text("side").notNull(),
  itemId: integer("item_id"),
  itemName: text("item_name").notNull(),
  itemType: text("item_type").notNull().default("card"),
  setName: text("set_name").notNull().default(""),
  cardNumber: text("card_number").notNull().default(""),
  condition: text("condition").notNull().default("Near Mint"),
  grade: text("grade").notNull().default("Raw"),
  quantity: integer("quantity").notNull().default(1),
  valueCad: real("value_cad").notNull().default(0),
  currentValueCad: real("current_value_cad").notNull().default(0),
  valuationDate: text("valuation_date").notNull().default(""),
  valuationSource: text("valuation_source").notNull().default("PriceCharting"),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const priceObservations = pgTable("price_observations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  itemId: integer("item_id").notNull(),
  observedDate: text("observed_date").notNull(),
  valueCad: real("value_cad").notNull(),
  source: text("source").notNull().default("PriceCharting"),
  sourceUrl: text("source_url").notNull().default(""),
  isOverride: boolean("is_override").notNull().default(false),
});

export const snapshots = pgTable("snapshots", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerId: text("owner_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  holdingsValueCad: real("holdings_value_cad").notNull().default(0),
  cashReserveCad: real("cash_reserve_cad").notNull().default(0),
  creditReserveCad: real("credit_reserve_cad").notNull().default(0),
  totalValueCad: real("total_value_cad").notNull().default(0),
  realizedProfitCad: real("realized_profit_cad").notNull().default(0),
  cumulativeContributionsCad: real("cumulative_contributions_cad").notNull().default(0),
});
