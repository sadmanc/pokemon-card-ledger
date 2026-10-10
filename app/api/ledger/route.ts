import { and, desc, eq, type InferSelectModel } from "drizzle-orm";
import { getDb } from "../../../db";
import { getGoogleSession } from "../../google-session";
import * as postgresSchema from "../../../db/schema.pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { items, priceObservations, snapshots, trades, transactions, transactionItems, tradeItems } = postgresSchema as any;
type ItemRow = InferSelectModel<typeof postgresSchema.items>;
type TransactionRow = InferSelectModel<typeof postgresSchema.transactions>;
type TradeRow = InferSelectModel<typeof postgresSchema.trades>;
type SnapshotRow = InferSelectModel<typeof postgresSchema.snapshots>;
type ObservationRow = InferSelectModel<typeof postgresSchema.priceObservations>;
type TransactionItemRow = InferSelectModel<typeof postgresSchema.transactionItems>;
type TradeItemRow = InferSelectModel<typeof postgresSchema.tradeItems>;

function numberValue(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function today() { return new Date().toISOString().slice(0, 10); }
async function ownerId() { return (await getGoogleSession())?.email ?? null; }
function routeError(error: unknown) { const message = error instanceof Error ? error.message : "Unexpected error"; return message.includes("no such table") ? "Your ledger database is not ready yet. Apply the database migration and redeploy." : message; }
function safeDate(value: unknown, fallback: string) { return String(value || fallback); }

function cleanLine(raw: Record<string, unknown>, date: string, valueKey: "amountCad" | "valueCad" = "amountCad") {
  return { itemId: raw.itemId ? numberValue(raw.itemId) : null, itemName: String(raw.itemName ?? raw.name ?? "").trim(), itemType: String(raw.itemType ?? "card"), setName: String(raw.setName ?? ""), cardNumber: String(raw.cardNumber ?? ""), condition: String(raw.condition ?? "Near Mint"), grade: String(raw.grade ?? "Raw"), quantity: Math.max(0, Math.floor(numberValue(raw.quantity || 1))), amountCad: valueKey === "amountCad" ? numberValue(raw.amountCad) : 0, valueCad: valueKey === "valueCad" ? numberValue(raw.valueCad) : 0, acquisitionCostCad: numberValue(raw.acquisitionCostCad), currentValueCad: numberValue(raw.currentValueCad), valuationDate: safeDate(raw.valuationDate, date), valuationSource: String(raw.valuationSource ?? "PriceCharting"), sourceUrl: String(raw.sourceUrl ?? ""), notes: String(raw.notes ?? "") };
}
function legacyTransactionLines(payload: Record<string, unknown>, date: string) { return [cleanLine({ itemId: payload.itemId, itemName: payload.itemName, itemType: payload.itemType, quantity: payload.quantity, amountCad: payload.amountCad, acquisitionCostCad: payload.acquisitionCostCad, currentValueCad: payload.currentValueCad, valuationDate: payload.valuationDate, valuationSource: payload.valuationSource, sourceUrl: payload.sourceUrl, notes: payload.notes }, date)]; }
function allocate(total: number, lines: { amountCad?: number; valueCad?: number }[], index: number) { const values = lines.map((line) => numberValue(line.amountCad ?? line.valueCad)); const sum = values.reduce((result, value) => result + value, 0); return sum > 0 ? total * (values[index] / sum) : total / Math.max(lines.length, 1); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readState(db: any, userId: string) {
  const [itemRows, transactionRows, tradeRows, snapshotRows, observationRows, transactionLineRows, tradeLineRows] = await Promise.all([
    db.select().from(items).where(eq(items.ownerId, userId)).orderBy(desc(items.updatedAt), desc(items.id)),
    db.select().from(transactions).where(eq(transactions.ownerId, userId)).orderBy(desc(transactions.transactionDate), desc(transactions.id)),
    db.select().from(trades).where(eq(trades.ownerId, userId)).orderBy(desc(trades.tradeDate), desc(trades.id)),
    db.select().from(snapshots).where(eq(snapshots.ownerId, userId)).orderBy(snapshots.snapshotDate, snapshots.id),
    db.select().from(priceObservations).where(eq(priceObservations.ownerId, userId)).orderBy(priceObservations.observedDate, priceObservations.id),
    db.select().from(transactionItems).where(eq(transactionItems.ownerId, userId)).orderBy(transactionItems.id),
    db.select().from(tradeItems).where(eq(tradeItems.ownerId, userId)).orderBy(tradeItems.id),
  ]) as [ItemRow[], TransactionRow[], TradeRow[], SnapshotRow[], ObservationRow[], TransactionItemRow[], TradeItemRow[]];
  const transactionLinesById = new Map<number, TransactionItemRow[]>(); transactionLineRows.forEach((line) => transactionLinesById.set(line.transactionId, [...(transactionLinesById.get(line.transactionId) ?? []), line]));
  const tradeLinesById = new Map<number, TradeItemRow[]>(); tradeLineRows.forEach((line) => tradeLinesById.set(line.tradeId, [...(tradeLinesById.get(line.tradeId) ?? []), line]));
  const holdingsValueCad = itemRows.reduce((sum, item) => sum + item.quantity * item.currentValueCad, 0);
  const cashReserveCad = transactionRows.reduce((sum, row) => sum + row.cashDeltaCad, 0) + tradeRows.reduce((sum, row) => sum + row.cashDeltaCad, 0);
  const creditReserveCad = transactionRows.reduce((sum, row) => sum + row.creditDeltaCad, 0);
  const realizedProfitCad = transactionRows.reduce((sum, row) => sum + row.realizedProfitCad, 0);
  const costBasisCad = itemRows.reduce((sum, item) => sum + item.costBasisCad, 0);
  const movementByDate = new Map<string, { date: string; inflow: number; outflow: number; net: number }>();
  for (const row of transactionRows) { const current = movementByDate.get(row.transactionDate) ?? { date: row.transactionDate, inflow: 0, outflow: 0, net: 0 }; current.inflow += Math.max(0, row.cashDeltaCad) + Math.max(0, row.creditDeltaCad); current.outflow += Math.abs(Math.min(0, row.cashDeltaCad)) + Math.abs(Math.min(0, row.creditDeltaCad)); current.net += row.cashDeltaCad + row.creditDeltaCad; movementByDate.set(row.transactionDate, current); }
  for (const row of tradeRows) { const current = movementByDate.get(row.tradeDate) ?? { date: row.tradeDate, inflow: 0, outflow: 0, net: 0 }; current.inflow += Math.max(0, row.cashDeltaCad); current.outflow += Math.abs(Math.min(0, row.cashDeltaCad)); current.net += row.cashDeltaCad; movementByDate.set(row.tradeDate, current); }
  return { items: itemRows, transactions: transactionRows.map((row) => ({ ...row, lineItems: transactionLinesById.get(row.id) ?? [] })), trades: tradeRows.map((row) => ({ ...row, items: tradeLinesById.get(row.id) ?? [] })), snapshots: snapshotRows, observations: observationRows, metrics: { holdingsValueCad, cashReserveCad, creditReserveCad, spendingPowerCad: cashReserveCad + creditReserveCad, totalValueCad: holdingsValueCad + cashReserveCad + creditReserveCad, realizedProfitCad, costBasisCad, unrealizedProfitCad: holdingsValueCad - costBasisCad, cumulativeContributionsCad: transactionRows.filter((row) => row.kind === "deposit" || row.kind === "withdrawal").reduce((sum, row) => sum + row.cashDeltaCad, 0), profitOutsideHoldingsCad: realizedProfitCad }, movements: [...movementByDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordSnapshot(db: any, userId: string, snapshotDate: string) { const state = await readState(db, userId); await db.insert(snapshots).values({ ownerId: userId, snapshotDate, holdingsValueCad: state.metrics.holdingsValueCad, cashReserveCad: state.metrics.cashReserveCad, creditReserveCad: state.metrics.creditReserveCad, totalValueCad: state.metrics.totalValueCad, realizedProfitCad: state.metrics.realizedProfitCad, cumulativeContributionsCad: state.metrics.cumulativeContributionsCad }); }

export async function GET() { try { const db = getDb(); const userId = await ownerId(); if (!userId) return Response.json({ error: "Sign in with Google to access your ledger." }, { status: 401 }); return Response.json(await readState(db, userId)); } catch (error) { return Response.json({ error: routeError(error) }, { status: 500 }); } }

export async function POST(request: Request) {
  try {
    const db = getDb(); const userId = await ownerId(); if (!userId) return Response.json({ error: "Sign in with Google to access your ledger." }, { status: 401 });
    const payload = await request.json() as Record<string, unknown>; const action = String(payload.action ?? "");
    if (action === "transaction") {
      const kind = String(payload.kind ?? ""); const transactionDate = String(payload.transactionDate ?? today()); const feesCad = numberValue(payload.feesCad); const shippingCad = numberValue(payload.shippingCad); const taxCad = numberValue(payload.taxCad);
      const lineItems = ["buy", "sell"].includes(kind) ? (Array.isArray(payload.lines) ? (payload.lines as Record<string, unknown>[]).map((line) => cleanLine(line, transactionDate)) : legacyTransactionLines(payload, transactionDate)) : [];
      if (!kind || (["buy", "sell"].includes(kind) && (!lineItems.length || lineItems.some((line) => !line.itemName || line.quantity < 1 || line.amountCad < 0)))) return Response.json({ error: "Add at least one item with a name, quantity, and non-negative amount." }, { status: 400 });
      let amountCad = numberValue(payload.amountCad); let quantity = Math.max(0, Math.floor(numberValue(payload.quantity))); let itemId = payload.itemId ? numberValue(payload.itemId) : null; let itemName = String(payload.itemName ?? "").trim(); let acquisitionCostCad = numberValue(payload.acquisitionCostCad); let realizedProfitCad = 0; let cashDeltaCad = 0; let creditDeltaCad = 0;
      const savedLineItems: Array<ReturnType<typeof cleanLine> & { acquisitionCostCad: number }> = [];
      if (kind === "buy" || kind === "sell") {
        amountCad = lineItems.reduce((sum, line) => sum + line.amountCad, 0); quantity = lineItems.reduce((sum, line) => sum + line.quantity, 0); itemId = lineItems[0].itemId; itemName = lineItems[0].itemName; const sharedCosts = feesCad + shippingCad + taxCad;
        for (const [index, line] of lineItems.entries()) {
          const existing = line.itemId ? (await db.select().from(items).where(and(eq(items.id, line.itemId), eq(items.ownerId, userId))))[0] : undefined;
          if (line.itemId && !existing) return Response.json({ error: `${line.itemName} is no longer in your holdings.` }, { status: 400 });
          if (kind === "sell" && existing && line.quantity > existing.quantity) return Response.json({ error: `You only have ${existing.quantity} of ${line.itemName} recorded.` }, { status: 400 });
          const allocatedCosts = allocate(sharedCosts, lineItems, index); const lineAcquisition = kind === "buy" ? line.amountCad + allocatedCosts : existing ? (existing.quantity ? existing.costBasisCad / existing.quantity : 0) * line.quantity : line.acquisitionCostCad; savedLineItems.push({ ...line, acquisitionCostCad: lineAcquisition });
          if (kind === "buy") {
            const itemValues = { name: line.itemName, itemType: line.itemType, setName: line.setName, cardNumber: line.cardNumber, condition: line.condition, grade: line.grade, currentValueCad: line.currentValueCad, valuationDate: line.valuationDate || transactionDate, valuationSource: line.valuationSource, sourceUrl: line.sourceUrl, notes: line.notes };
            if (existing) { await db.update(items).set({ ...itemValues, quantity: existing.quantity + line.quantity, costBasisCad: existing.costBasisCad + lineAcquisition, updatedAt: new Date().toISOString() }).where(and(eq(items.id, existing.id), eq(items.ownerId, userId))); if (!itemId) itemId = existing.id; }
            else { const [createdItem] = await db.insert(items).values({ ownerId: userId, ...itemValues, quantity: line.quantity, costBasisCad: lineAcquisition }).returning(); line.itemId = createdItem.id; if (!itemId) itemId = createdItem.id; }
            if (line.currentValueCad > 0 && line.itemId) await db.insert(priceObservations).values({ ownerId: userId, itemId: line.itemId, observedDate: line.valuationDate || transactionDate, valueCad: line.currentValueCad, source: line.valuationSource, sourceUrl: line.sourceUrl, isOverride: line.valuationSource.toLowerCase().includes("manual") });
          } else if (existing) await db.update(items).set({ quantity: existing.quantity - line.quantity, costBasisCad: Math.max(0, existing.costBasisCad - lineAcquisition), updatedAt: new Date().toISOString() }).where(and(eq(items.id, existing.id), eq(items.ownerId, userId)));
        }
        acquisitionCostCad = savedLineItems.reduce((sum, line) => sum + line.acquisitionCostCad, 0); cashDeltaCad = kind === "buy" ? -(amountCad + sharedCosts) : amountCad - sharedCosts; realizedProfitCad = kind === "sell" ? savedLineItems.reduce((sum, line, index) => sum + line.amountCad - allocate(sharedCosts, lineItems, index) - line.acquisitionCostCad, 0) : 0;
      } else if (kind === "deposit") { amountCad = numberValue(payload.amountCad); cashDeltaCad = amountCad; }
      else if (["withdrawal", "fee", "expense"].includes(kind)) { amountCad = numberValue(payload.amountCad); cashDeltaCad = -amountCad; }
      else if (kind === "credit") { amountCad = numberValue(payload.amountCad); creditDeltaCad = amountCad; }
      else return Response.json({ error: "Unsupported transaction type." }, { status: 400 });
      const [created] = await db.insert(transactions).values({ ownerId: userId, kind, transactionDate, itemId, itemName, quantity, amountCad, cashDeltaCad, creditDeltaCad, feesCad, shippingCad, taxCad, acquisitionCostCad, realizedProfitCad, source: String(payload.source ?? "Manual"), notes: String(payload.notes ?? "") }).returning();
      if (savedLineItems.length) await db.insert(transactionItems).values(savedLineItems.map((line) => ({ ownerId: userId, transactionId: created.id, itemId: line.itemId, itemName: line.itemName, itemType: line.itemType, setName: line.setName, cardNumber: line.cardNumber, condition: line.condition, grade: line.grade, quantity: line.quantity, amountCad: line.amountCad, acquisitionCostCad: line.acquisitionCostCad, currentValueCad: line.currentValueCad, valuationDate: line.valuationDate, valuationSource: line.valuationSource, sourceUrl: line.sourceUrl, notes: line.notes })));
      await recordSnapshot(db, userId, transactionDate); return Response.json({ transaction: created }, { status: 201 });
    }
    if (action === "holding") {
      const name = String(payload.name ?? "").trim(); if (!name) return Response.json({ error: "Item name is required." }, { status: 400 });
      const values = { ownerId: userId, name, itemType: String(payload.itemType ?? "card"), setName: String(payload.setName ?? ""), cardNumber: String(payload.cardNumber ?? ""), condition: String(payload.condition ?? "Near Mint"), grade: String(payload.grade ?? "Raw"), quantity: Math.max(0, Math.floor(numberValue(payload.quantity))), costBasisCad: numberValue(payload.costBasisCad), currentValueCad: numberValue(payload.currentValueCad), valuationDate: String(payload.valuationDate ?? today()), valuationSource: String(payload.valuationSource ?? "PriceCharting"), sourceUrl: String(payload.sourceUrl ?? ""), notes: String(payload.notes ?? ""), updatedAt: new Date().toISOString() }; const id = payload.id ? numberValue(payload.id) : 0; let saved; if (id) [saved] = await db.update(items).set(values).where(and(eq(items.id, id), eq(items.ownerId, userId))).returning(); else [saved] = await db.insert(items).values(values).returning(); if (!saved) return Response.json({ error: "Holding not found." }, { status: 404 });
      await db.insert(priceObservations).values({ ownerId: userId, itemId: saved.id, observedDate: values.valuationDate || today(), valueCad: values.currentValueCad, source: values.valuationSource, sourceUrl: values.sourceUrl, isOverride: values.valuationSource.toLowerCase().includes("manual") }); await recordSnapshot(db, userId, values.valuationDate || today()); return Response.json({ item: saved }, { status: 201 });
    }
    if (action === "trade") {
      const tradeDate = String(payload.tradeDate ?? today()); const givenLines = Array.isArray(payload.givenLines) ? (payload.givenLines as Record<string, unknown>[]).map((line) => cleanLine(line, tradeDate, "valueCad")) : []; const receivedLines = Array.isArray(payload.receivedLines) ? (payload.receivedLines as Record<string, unknown>[]).map((line) => cleanLine(line, tradeDate, "valueCad")) : []; const allLines = [...givenLines, ...receivedLines];
      if (allLines.some((line) => !line.itemName || line.quantity < 1 || line.valueCad < 0)) return Response.json({ error: "Each trade item needs a name, quantity, and non-negative value." }, { status: 400 });
      const givenItems = givenLines.length ? givenLines.map((line) => line.itemName).join("\n") : String(payload.givenItems ?? ""); const receivedItems = receivedLines.length ? receivedLines.map((line) => line.itemName).join("\n") : String(payload.receivedItems ?? ""); const valueGivenCad = givenLines.length ? givenLines.reduce((sum, line) => sum + line.valueCad, 0) : numberValue(payload.valueGivenCad); const valueReceivedCad = receivedLines.length ? receivedLines.reduce((sum, line) => sum + line.valueCad, 0) : numberValue(payload.valueReceivedCad);
      const [created] = await db.insert(trades).values({ ownerId: userId, tradeDate, givenItems, receivedItems, valueGivenCad, valueReceivedCad, cashDeltaCad: numberValue(payload.cashDeltaCad), notes: String(payload.notes ?? "") }).returning(); if (allLines.length) await db.insert(tradeItems).values(allLines.map((line, index) => ({ ownerId: userId, tradeId: created.id, side: index < givenLines.length ? "given" : "received", itemId: line.itemId, itemName: line.itemName, itemType: line.itemType, setName: line.setName, cardNumber: line.cardNumber, condition: line.condition, grade: line.grade, quantity: line.quantity, valueCad: line.valueCad, currentValueCad: line.currentValueCad, valuationDate: line.valuationDate, valuationSource: line.valuationSource, sourceUrl: line.sourceUrl, notes: line.notes })));
      await recordSnapshot(db, userId, tradeDate); return Response.json({ trade: created }, { status: 201 });
    }
    if (action === "snapshot") { const state = await readState(db, userId); const [created] = await db.insert(snapshots).values({ ownerId: userId, snapshotDate: String(payload.snapshotDate ?? today()), holdingsValueCad: state.metrics.holdingsValueCad, cashReserveCad: state.metrics.cashReserveCad, creditReserveCad: state.metrics.creditReserveCad, totalValueCad: state.metrics.totalValueCad, realizedProfitCad: state.metrics.realizedProfitCad, cumulativeContributionsCad: state.metrics.cumulativeContributionsCad }).returning(); return Response.json({ snapshot: created }, { status: 201 }); }
    return Response.json({ error: "Unknown ledger action." }, { status: 400 });
  } catch (error) { return Response.json({ error: routeError(error) }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const db = getDb(); const userId = await ownerId(); if (!userId) return Response.json({ error: "Sign in with Google to access your ledger." }, { status: 401 }); const url = new URL(request.url); const entity = url.searchParams.get("entity"); const id = numberValue(url.searchParams.get("id")); if (!id || !entity) return Response.json({ error: "entity and id are required." }, { status: 400 });
    if (entity === "transaction") {
      const row = (await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.ownerId, userId))))[0]; if (!row) return Response.json({ error: "Transaction not found." }, { status: 404 }); const lines = await db.select().from(transactionItems).where(and(eq(transactionItems.transactionId, id), eq(transactionItems.ownerId, userId)));
      if (lines.length) { for (const line of lines) { if (!line.itemId) continue; const item = (await db.select().from(items).where(and(eq(items.id, line.itemId), eq(items.ownerId, userId))))[0]; if (!item) continue; const quantity = row.kind === "buy" ? item.quantity - line.quantity : item.quantity + line.quantity; const costBasis = row.kind === "buy" ? item.costBasisCad - line.acquisitionCostCad : item.costBasisCad + line.acquisitionCostCad; await db.update(items).set({ quantity: Math.max(0, quantity), costBasisCad: Math.max(0, costBasis), updatedAt: new Date().toISOString() }).where(and(eq(items.id, item.id), eq(items.ownerId, userId))); } await db.delete(transactionItems).where(and(eq(transactionItems.transactionId, id), eq(transactionItems.ownerId, userId))); }
      else if (row.itemId && (row.kind === "buy" || row.kind === "sell")) { const item = (await db.select().from(items).where(and(eq(items.id, row.itemId), eq(items.ownerId, userId))))[0]; if (item) { const totalBuyCost = row.amountCad + row.feesCad + row.shippingCad + row.taxCad; const quantity = row.kind === "buy" ? item.quantity - row.quantity : item.quantity + row.quantity; const costBasis = row.kind === "buy" ? item.costBasisCad - totalBuyCost : item.costBasisCad + row.acquisitionCostCad; await db.update(items).set({ quantity: Math.max(0, quantity), costBasisCad: Math.max(0, costBasis), updatedAt: new Date().toISOString() }).where(and(eq(items.id, item.id), eq(items.ownerId, userId))); } }
      await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.ownerId, userId)));
    } else if (entity === "holding") { await db.delete(priceObservations).where(and(eq(priceObservations.itemId, id), eq(priceObservations.ownerId, userId))); await db.delete(items).where(and(eq(items.id, id), eq(items.ownerId, userId))); }
    else if (entity === "trade") { await db.delete(tradeItems).where(and(eq(tradeItems.tradeId, id), eq(tradeItems.ownerId, userId))); await db.delete(trades).where(and(eq(trades.id, id), eq(trades.ownerId, userId))); }
    else if (entity === "snapshot") await db.delete(snapshots).where(and(eq(snapshots.id, id), eq(snapshots.ownerId, userId)));
    else return Response.json({ error: "Unsupported ledger record." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: routeError(error) }, { status: 500 }); }
}
