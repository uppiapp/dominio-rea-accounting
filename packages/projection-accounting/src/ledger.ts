import { ChartOfAccounts, AccountNature, AccountGroup, Account } from './chart-of-accounts';
import { JournalEntry, JournalEntryLine } from './projector';

export interface TAccountMovement {
  date: Date;
  entryDescription: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

export interface TAccount {
  account: Account;
  initialBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  nature: AccountNature;
  movements: TAccountMovement[];
}

export interface TrialBalanceItem {
  accountCode: string;
  accountName: string;
  group: AccountGroup;
  initialBalance: number;
  debitMovement: number;
  creditMovement: number;
  closingBalanceDebit: number;
  closingBalanceCredit: number;
}

export interface TrialBalanceReport {
  items: TrialBalanceItem[];
  totalDebits: number;
  totalCredits: number;
  totalClosingDebits: number;
  totalClosingCredits: number;
  isEquilibrated: boolean;
}

export class GeneralLedger {
  private chart: ChartOfAccounts;
  private entries: JournalEntry[] = [];

  constructor(chart?: ChartOfAccounts) {
    this.chart = chart || new ChartOfAccounts();
  }

  loadEntries(entries: JournalEntry[]): void {
    this.entries = [...entries];
  }

  addEntry(entry: JournalEntry): void {
    this.entries.push(entry);
  }

  getEntries(): JournalEntry[] {
    return this.entries;
  }

  /**
   * Constrói o Livro Razão completo com todas as contas T (T-Accounts)
   */
  buildLedgerAccounts(initialBalances?: Map<string, number>): Map<string, TAccount> {
    const tAccounts = new Map<string, TAccount>();

    // Inicializa todas as contas conhecidas no Plano
    for (const acc of this.chart.getAllAccounts()) {
      const initBal = initialBalances?.get(acc.code) || 0;
      tAccounts.set(acc.code, {
        account: acc,
        initialBalance: initBal,
        totalDebits: 0,
        totalCredits: 0,
        closingBalance: initBal,
        nature: acc.nature,
        movements: []
      });
    }

    // Processa os lançamentos em ordem cronológica
    const sortedEntries = [...this.entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    for (const entry of sortedEntries) {
      for (const line of entry.lines) {
        let tAcc = tAccounts.get(line.accountCode);
        if (!tAcc) {
          // Conta não mapeada no plano inicial: cria sob demanda
          const newAcc: Account = {
            code: line.accountCode,
            name: line.accountName,
            group: AccountGroup.ATIVO_CIRCULANTE,
            nature: AccountNature.DEBIT
          };
          tAcc = {
            account: newAcc,
            initialBalance: 0,
            totalDebits: 0,
            totalCredits: 0,
            closingBalance: 0,
            nature: newAcc.nature,
            movements: []
          };
          tAccounts.set(line.accountCode, tAcc);
        }

        tAcc.totalDebits += line.debit;
        tAcc.totalCredits += line.credit;

        // Atualiza saldo acumulado de acordo com a natureza da conta
        let currentBal = tAcc.closingBalance;
        if (tAcc.nature === AccountNature.DEBIT) {
          currentBal = currentBal + line.debit - line.credit;
        } else {
          currentBal = currentBal + line.credit - line.debit;
        }
        tAcc.closingBalance = Math.round(currentBal * 100) / 100;

        tAcc.movements.push({
          date: entry.timestamp,
          entryDescription: line.description,
          debit: line.debit,
          credit: line.credit,
          balanceAfter: tAcc.closingBalance
        });
      }
    }

    return tAccounts;
  }

  /**
   * Gera o Balancete de Verificação de 4 colunas (Débito, Crédito, Saldo Devedor, Saldo Credor)
   */
  generateTrialBalance(initialBalances?: Map<string, number>): TrialBalanceReport {
    const tAccounts = this.buildLedgerAccounts(initialBalances);
    const items: TrialBalanceItem[] = [];

    let totalDebits = 0;
    let totalCredits = 0;
    let totalClosingDebits = 0;
    let totalClosingCredits = 0;

    for (const tAcc of tAccounts.values()) {
      // Pula contas sem movimento e com saldo zero
      if (tAcc.initialBalance === 0 && tAcc.totalDebits === 0 && tAcc.totalCredits === 0) {
        continue;
      }

      totalDebits += tAcc.totalDebits;
      totalCredits += tAcc.totalCredits;

      let closingDebit = 0;
      let closingCredit = 0;

      if (tAcc.nature === AccountNature.DEBIT) {
        if (tAcc.closingBalance >= 0) {
          closingDebit = tAcc.closingBalance;
        } else {
          closingCredit = Math.abs(tAcc.closingBalance);
        }
      } else {
        if (tAcc.closingBalance >= 0) {
          closingCredit = tAcc.closingBalance;
        } else {
          closingDebit = Math.abs(tAcc.closingBalance);
        }
      }

      totalClosingDebits += closingDebit;
      totalClosingCredits += closingCredit;

      items.push({
        accountCode: tAcc.account.code,
        accountName: tAcc.account.name,
        group: tAcc.account.group,
        initialBalance: tAcc.initialBalance,
        debitMovement: Math.round(tAcc.totalDebits * 100) / 100,
        creditMovement: Math.round(tAcc.totalCredits * 100) / 100,
        closingBalanceDebit: Math.round(closingDebit * 100) / 100,
        closingBalanceCredit: Math.round(closingCredit * 100) / 100
      });
    }

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    totalClosingDebits = Math.round(totalClosingDebits * 100) / 100;
    totalClosingCredits = Math.round(totalClosingCredits * 100) / 100;

    const isEquilibrated = 
      Math.abs(totalDebits - totalCredits) < 0.01 &&
      Math.abs(totalClosingDebits - totalClosingCredits) < 0.01;

    return {
      items: items.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
      totalDebits,
      totalCredits,
      totalClosingDebits,
      totalClosingCredits,
      isEquilibrated
    };
  }
}
