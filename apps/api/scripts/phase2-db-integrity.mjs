import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const entry = await prisma.ledgerEntry.findFirst();
  if (entry) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { amount: entry.amount },
        });
        throw new Error('APPEND_ONLY_TRIGGER_MISSING');
      });
    } catch (error) {
      if (String(error).includes('APPEND_ONLY_TRIGGER_MISSING')) throw error;
      console.log('PASS ledger append-only trigger rejected UPDATE');
    }
  } else {
    console.log('SKIP append-only probe: no ledger entry');
  }

  const rows = await prisma.$queryRaw`
    SELECT
      w.user_id,
      w.balance,
      COALESCE(SUM(
        CASE
          WHEN le.credit_account_id = la.id THEN le.amount
          WHEN le.debit_account_id = la.id THEN -le.amount
          ELSE 0
        END
      ), 0)::int AS ledger_balance
    FROM wallets w
    JOIN ledger_accounts la ON la.owner_user_id = w.user_id
    LEFT JOIN ledger_entries le
      ON le.credit_account_id = la.id OR le.debit_account_id = la.id
    GROUP BY w.user_id, w.balance
  `;
  const inconsistent = rows.filter((row) => row.balance !== row.ledger_balance);
  console.log(
    `Wallet reconciliation: ${rows.length} checked, ${inconsistent.length} inconsistent`,
  );
  if (inconsistent.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
