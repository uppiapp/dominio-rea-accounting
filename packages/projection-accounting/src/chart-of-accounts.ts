export enum AccountNature {
  DEBIT = 'DEBIT',   // Natureza Devedora (Ativo, Custo, Despesa, Dedução)
  CREDIT = 'CREDIT'  // Natureza Credora (Passivo, PL, Receita)
}

export enum AccountGroup {
  ATIVO_CIRCULANTE = 'ATIVO_CIRCULANTE',
  ATIVO_NAO_CIRCULANTE = 'ATIVO_NAO_CIRCULANTE',
  PASSIVO_CIRCULANTE = 'PASSIVO_CIRCULANTE',
  PASSIVO_NAO_CIRCULANTE = 'PASSIVO_NAO_CIRCULANTE',
  PATRIMONIO_LIQUIDO = 'PATRIMONIO_LIQUIDO',
  RECEITA_BRUTA = 'RECEITA_BRUTA',
  DEDUCAO_RECEITA = 'DEDUCAO_RECEITA',
  CUSTOS = 'CUSTOS',
  DESPESAS_OPERACIONAIS = 'DESPESAS_OPERACIONAIS'
}

export interface Account {
  code: string;        // ex: '1.1.1.01.0001'
  name: string;        // ex: 'Caixa Geral'
  group: AccountGroup;
  nature: AccountNature;
  dominioCode?: number; // Código reduzido no Domínio Contábil
}

export class ChartOfAccounts {
  private accounts: Map<string, Account> = new Map();

  constructor() {
    this.initStandardBrazilianChart();
  }

  addAccount(account: Account): void {
    this.accounts.set(account.code, account);
  }

  getAccount(code: string): Account | undefined {
    return this.accounts.get(code);
  }

  getAllAccounts(): Account[] {
    return Array.from(this.accounts.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Plano de Contas Padrão Domínio Sistemas / CFC
   */
  private initStandardBrazilianChart(): void {
    const list: Account[] = [
      // 1. ATIVO
      { code: '1.1.1.01', name: 'Caixa Geral', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 1 },
      { code: '1.1.1.02', name: 'Bancos Conta Movimento', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 2 },
      { code: '1.1.2.01', name: 'Clientes / Duplicatas a Receber', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 10 },
      { code: '1.1.3.01', name: 'ICMS a Recuperar', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 20 },
      { code: '1.1.3.02', name: 'PIS a Recuperar', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 21 },
      { code: '1.1.3.03', name: 'COFINS a Recuperar', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 22 },
      { code: '1.1.4.01', name: 'Estoques de Mercadorias para Revenda', group: AccountGroup.ATIVO_CIRCULANTE, nature: AccountNature.DEBIT, dominioCode: 30 },

      // 2. PASSIVO & PATRIMÔNIO LÍQUIDO
      { code: '2.1.1.01', name: 'Fornecedores Nacionais a Pagar', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 100 },
      { code: '2.1.2.01', name: 'ICMS a Recolher', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 110 },
      { code: '2.1.2.02', name: 'PIS a Recolher', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 111 },
      { code: '2.1.2.03', name: 'COFINS a Recolher', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 112 },
      { code: '2.1.2.04', name: 'ISS a Recolher', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 113 },
      { code: '2.1.3.01', name: 'Salários e Ordenados a Pagar', group: AccountGroup.PASSIVO_CIRCULANTE, nature: AccountNature.CREDIT, dominioCode: 120 },
      { code: '2.3.1.01', name: 'Capital Social Integralizado', group: AccountGroup.PATRIMONIO_LIQUIDO, nature: AccountNature.CREDIT, dominioCode: 200 },
      { code: '2.3.2.01', name: 'Lucros ou Prejuízos Acumulados', group: AccountGroup.PATRIMONIO_LIQUIDO, nature: AccountNature.CREDIT, dominioCode: 210 },

      // 3. RECEITAS E DEDUÇÕES
      { code: '3.1.1.01', name: 'Receita Bruta com Venda de Mercadorias', group: AccountGroup.RECEITA_BRUTA, nature: AccountNature.CREDIT, dominioCode: 300 },
      { code: '3.1.1.02', name: 'Receita com Prestação de Serviços', group: AccountGroup.RECEITA_BRUTA, nature: AccountNature.CREDIT, dominioCode: 301 },
      { code: '3.2.1.01', name: '(-) ICMS sobre Vendas', group: AccountGroup.DEDUCAO_RECEITA, nature: AccountNature.DEBIT, dominioCode: 310 },
      { code: '3.2.1.02', name: '(-) PIS sobre Faturamento', group: AccountGroup.DEDUCAO_RECEITA, nature: AccountNature.DEBIT, dominioCode: 311 },
      { code: '3.2.1.03', name: '(-) COFINS sobre Faturamento', group: AccountGroup.DEDUCAO_RECEITA, nature: AccountNature.DEBIT, dominioCode: 312 },
      { code: '3.2.1.04', name: '(-) ISS sobre Serviços', group: AccountGroup.DEDUCAO_RECEITA, nature: AccountNature.DEBIT, dominioCode: 313 },

      // 4. CUSTOS
      { code: '4.1.1.01', name: 'Custo das Mercadorias Vendidas (CMV)', group: AccountGroup.CUSTOS, nature: AccountNature.DEBIT, dominioCode: 400 },

      // 5. DESPESAS OPERACIONAIS
      { code: '5.1.1.01', name: 'Despesas com Material de Consumo', group: AccountGroup.DESPESAS_OPERACIONAIS, nature: AccountNature.DEBIT, dominioCode: 500 },
      { code: '5.1.2.01', name: 'Despesas com Pessoal e Salários', group: AccountGroup.DESPESAS_OPERACIONAIS, nature: AccountNature.DEBIT, dominioCode: 510 }
    ];

    for (const a of list) {
      this.accounts.set(a.code, a);
    }
  }
}
