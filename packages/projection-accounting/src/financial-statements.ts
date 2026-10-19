import { GeneralLedger, TrialBalanceReport } from './ledger';
import { AccountGroup } from './chart-of-accounts';

export interface DREReport {
  receitaBruta: number;
  deducoesReceita: number;
  receitaLiquida: number;
  custoMercadoriasVendidas: number;
  lucroBruto: number;
  despesasOperacionais: number;
  resultadoLiquidoExercicio: number; // Lucro ou Prejuízo Líquido
}

export interface BalancoPatrimonialReport {
  ativoCirculante: number;
  totalAtivo: number;
  passivoCirculante: number;
  totalPassivo: number;
  patrimonioLiquidoInicial: number;
  resultadoExercicioDRE: number;
  totalPatrimonioLiquido: number;
  totalPassivoEPL: number;
  isEquilibrado: boolean; // Ativo === Passivo + PL
}

export class FinancialStatementsEngine {
  /**
   * Deriva a Demonstração do Resultado do Exercício (DRE) diretamente do Balancete
   */
  static generateDRE(trialBalance: TrialBalanceReport): DREReport {
    let receitaBruta = 0;
    let deducoesReceita = 0;
    let custoMercadoriasVendidas = 0;
    let despesasOperacionais = 0;

    for (const item of trialBalance.items) {
      if (item.group === AccountGroup.RECEITA_BRUTA) {
        receitaBruta += item.closingBalanceCredit;
      } else if (item.group === AccountGroup.DEDUCAO_RECEITA) {
        deducoesReceita += item.closingBalanceDebit;
      } else if (item.group === AccountGroup.CUSTOS) {
        custoMercadoriasVendidas += item.closingBalanceDebit;
      } else if (item.group === AccountGroup.DESPESAS_OPERACIONAIS) {
        despesasOperacionais += item.closingBalanceDebit;
      }
    }

    receitaBruta = Math.round(receitaBruta * 100) / 100;
    deducoesReceita = Math.round(deducoesReceita * 100) / 100;
    const receitaLiquida = Math.round((receitaBruta - deducoesReceita) * 100) / 100;
    custoMercadoriasVendidas = Math.round(custoMercadoriasVendidas * 100) / 100;
    const lucroBruto = Math.round((receitaLiquida - custoMercadoriasVendidas) * 100) / 100;
    despesasOperacionais = Math.round(despesasOperacionais * 100) / 100;
    const resultadoLiquidoExercicio = Math.round((lucroBruto - despesasOperacionais) * 100) / 100;

    return {
      receitaBruta,
      deducoesReceita,
      receitaLiquida,
      custoMercadoriasVendidas,
      lucroBruto,
      despesasOperacionais,
      resultadoLiquidoExercicio
    };
  }

  /**
   * Deriva o Balanço Patrimonial garantindo a igualdade fundamental da contabilidade:
   * Ativo = Passivo + Patrimônio Líquido (integrado com o resultado da DRE)
   */
  static generateBalancoPatrimonial(trialBalance: TrialBalanceReport, dre: DREReport): BalancoPatrimonialReport {
    let ativoCirculante = 0;
    let passivoCirculante = 0;
    let patrimonioLiquidoInicial = 0;

    for (const item of trialBalance.items) {
      if (item.group === AccountGroup.ATIVO_CIRCULANTE || item.group === AccountGroup.ATIVO_NAO_CIRCULANTE) {
        ativoCirculante += (item.closingBalanceDebit - item.closingBalanceCredit);
      } else if (item.group === AccountGroup.PASSIVO_CIRCULANTE || item.group === AccountGroup.PASSIVO_NAO_CIRCULANTE) {
        passivoCirculante += (item.closingBalanceCredit - item.closingBalanceDebit);
      } else if (item.group === AccountGroup.PATRIMONIO_LIQUIDO) {
        patrimonioLiquidoInicial += (item.closingBalanceCredit - item.closingBalanceDebit);
      }
    }

    ativoCirculante = Math.round(ativoCirculante * 100) / 100;
    const totalAtivo = ativoCirculante;

    passivoCirculante = Math.round(passivoCirculante * 100) / 100;
    const totalPassivo = passivoCirculante;

    patrimonioLiquidoInicial = Math.round(patrimonioLiquidoInicial * 100) / 100;
    const resultadoExercicioDRE = dre.resultadoLiquidoExercicio;
    const totalPatrimonioLiquido = Math.round((patrimonioLiquidoInicial + resultadoExercicioDRE) * 100) / 100;

    const totalPassivoEPL = Math.round((totalPassivo + totalPatrimonioLiquido) * 100) / 100;
    const isEquilibrado = Math.abs(totalAtivo - totalPassivoEPL) < 0.01;

    return {
      ativoCirculante,
      totalAtivo,
      passivoCirculante,
      totalPassivo,
      patrimonioLiquidoInicial,
      resultadoExercicioDRE,
      totalPatrimonioLiquido,
      totalPassivoEPL,
      isEquilibrado
    };
  }
}
