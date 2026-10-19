import { 
  EconomicDuality, 
  EconomicEvent, 
  EconomicEventType, 
  ResourceType, 
  StockFlowDirection 
} from '../../core-rea/src/types';
import { ChartOfAccounts, Account } from './chart-of-accounts';

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntry {
  id: string;
  timestamp: Date;
  dualityId: string;
  businessKey?: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export class AccountingProjector {
  private chart: ChartOfAccounts;

  constructor(chart?: ChartOfAccounts) {
    this.chart = chart || new ChartOfAccounts();
  }

  /**
   * Projeta uma única Dualidade REA em um Lançamento Contábil de Partidas Dobradas
   */
  projectDualityToJournalEntry(duality: EconomicDuality): JournalEntry {
    const lines: JournalEntryLine[] = [];

    // Analisa a composição da dualidade
    const acqEvt = duality.incrementEvents.find(e => e.type === EconomicEventType.GOODS_ACQUISITION);
    const saleEvt = duality.decrementEvents.find(e => e.type === EconomicEventType.GOODS_SALE);
    const disbEvt = duality.decrementEvents.find(e => e.type === EconomicEventType.CASH_DISBURSEMENT);
    const recEvt = duality.incrementEvents.find(e => e.type === EconomicEventType.CASH_RECEIPT);

    if (acqEvt) {
      // 1. DUALIDADE DE AQUISIÇÃO (Compra de Mercadorias / Insumos)
      const acumulador = acqEvt.metadata?.acumulador || '1';
      const isUsoConsumo = acumulador === '2' || acqEvt.metadata?.cfop?.startsWith('1556') || acqEvt.metadata?.cfop?.startsWith('2556');
      
      const vlrEstoque = acqEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0);

      // Débito: Estoque ou Despesa de Uso e Consumo
      if (isUsoConsumo) {
        lines.push({
          accountCode: '5.1.1.01',
          accountName: 'Despesas com Material de Consumo',
          debit: vlrEstoque,
          credit: 0,
          description: `Compra p/ Consumo NF ${acqEvt.metadata?.documentNumber || ''}`
        });
      } else {
        lines.push({
          accountCode: '1.1.4.01',
          accountName: 'Estoques de Mercadorias para Revenda',
          debit: vlrEstoque,
          credit: 0,
          description: `Entrada Estoque NF ${acqEvt.metadata?.documentNumber || ''}`
        });
      }

      // Débito: Impostos a Recuperar (ICMS, etc.)
      const taxEvents = duality.incrementEvents.filter(e => e.type === EconomicEventType.TAX_CREDIT_ACCRUAL);
      for (const te of taxEvents) {
        const vlrTax = te.stockFlows.reduce((s, f) => s + f.totalValue, 0);
        if (vlrTax > 0) {
          lines.push({
            accountCode: '1.1.3.01',
            accountName: 'ICMS a Recuperar',
            debit: vlrTax,
            credit: 0,
            description: `ICMS s/ Compras NF ${acqEvt.metadata?.documentNumber || ''}`
          });
        }
      }

      // Crédito: Fornecedores a Pagar
      const payableEvts = duality.decrementEvents;
      for (const pe of payableEvts) {
        const vlrPay = pe.stockFlows.reduce((s, f) => s + f.totalValue, 0);
        lines.push({
          accountCode: '2.1.1.01',
          accountName: 'Fornecedores Nacionais a Pagar',
          debit: 0,
          credit: vlrPay,
          description: `Vlr Faturado NF ${acqEvt.metadata?.documentNumber || ''}`
        });
      }

    } else if (saleEvt) {
      // 2. DUALIDADE DE VENDA COMERCIAL
      // Lado 1: Faturamento e Contas a Receber
      const recClaimEvt = duality.incrementEvents.find(e => e.type === EconomicEventType.GOODS_SALE || e.type === EconomicEventType.CASH_RECEIPT);
      const grossValue = recClaimEvt ? recClaimEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0) : 0;

      // Débito: Clientes a Receber
      lines.push({
        accountCode: '1.1.2.01',
        accountName: 'Clientes / Duplicatas a Receber',
        debit: grossValue,
        credit: 0,
        description: `Venda a Prazo NF ${saleEvt.metadata?.documentNumber || ''}`
      });

      // Crédito: Receita Bruta de Vendas
      lines.push({
        accountCode: '3.1.1.01',
        accountName: 'Receita Bruta com Venda de Mercadorias',
        debit: 0,
        credit: grossValue,
        description: `Receita de Venda NF ${saleEvt.metadata?.documentNumber || ''}`
      });

      // Lado 2: Custo da Mercadoria Vendida (CMV) e Baixa do Estoque
      const custoCMV = saleEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0);
      lines.push({
        accountCode: '4.1.1.01',
        accountName: 'Custo das Mercadorias Vendidas (CMV)',
        debit: custoCMV,
        credit: 0,
        description: `CMV Ref. NF ${saleEvt.metadata?.documentNumber || ''}`
      });

      lines.push({
        accountCode: '1.1.4.01',
        accountName: 'Estoques de Mercadorias para Revenda',
        debit: 0,
        credit: custoCMV,
        description: `Baixa Estoque CMV NF ${saleEvt.metadata?.documentNumber || ''}`
      });

      // Lado 3: Tributos sobre Vendas (ICMS Débito)
      const taxLiabEvents = duality.decrementEvents.filter(e => e.type === EconomicEventType.TAX_LIABILITY_ACCRUAL);
      for (const tle of taxLiabEvents) {
        const vlrTax = tle.stockFlows.reduce((s, f) => s + f.totalValue, 0);
        if (vlrTax > 0) {
          lines.push({
            accountCode: '3.2.1.01',
            accountName: '(-) ICMS sobre Vendas',
            debit: vlrTax,
            credit: 0,
            description: `ICMS s/ Faturamento NF ${saleEvt.metadata?.documentNumber || ''}`
          });

          lines.push({
            accountCode: '2.1.2.01',
            accountName: 'ICMS a Recolher',
            debit: 0,
            credit: vlrTax,
            description: `Obrigação ICMS s/ NF ${saleEvt.metadata?.documentNumber || ''}`
          });
        }
      }

    } else if (disbEvt) {
      // 3. PAGAMENTO FINANCEIRO (Desembolso de Caixa/Banco)
      const vlrDisb = disbEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0);
      lines.push({
        accountCode: '2.1.1.01',
        accountName: 'Fornecedores Nacionais a Pagar',
        debit: vlrDisb,
        credit: 0,
        description: duality.description || 'Pagamento de Fornecedor'
      });

      lines.push({
        accountCode: '1.1.1.02',
        accountName: 'Bancos Conta Movimento',
        debit: 0,
        credit: vlrDisb,
        description: duality.description || 'Saída Bancária'
      });

    } else if (recEvt) {
      // 4. RECEBIMENTO FINANCEIRO (Entrada em Caixa/Banco)
      const vlrRec = recEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0);
      lines.push({
        accountCode: '1.1.1.02',
        accountName: 'Bancos Conta Movimento',
        debit: vlrRec,
        credit: 0,
        description: duality.description || 'Recebimento de Cliente'
      });

      lines.push({
        accountCode: '1.1.2.01',
        accountName: 'Clientes / Duplicatas a Receber',
        debit: 0,
        credit: vlrRec,
        description: duality.description || 'Baixa de Duplicata a Receber'
      });
    }

    const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
    const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      id: `entry-${duality.id}`,
      timestamp: duality.timestamp,
      dualityId: duality.id,
      businessKey: duality.businessKey,
      lines,
      totalDebit,
      totalCredit,
      isBalanced
    };
  }

  /**
   * Projeta todas as dualidades em um Livro Diário contábil completo
   */
  projectAllDualities(dualities: EconomicDuality[]): JournalEntry[] {
    return dualities
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map(d => this.projectDualityToJournalEntry(d));
  }
}
