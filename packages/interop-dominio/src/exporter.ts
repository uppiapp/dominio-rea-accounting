import { EconomicAgent, EconomicDuality, EconomicEventType, AgentRole } from '../../core-rea/src/types';
import { 
  DominioLayout19Engine, 
  DominioLayout19File, 
  DominioLayout19Header, 
  DominioLayout19Detail, 
  padDate 
} from './layouts/layout19';
import { 
  DominioLayout3Engine, 
  DominioParticipanteRecord 
} from './layouts/layout3';

export class DominioDataExporter {
  /**
   * Exporta Agentes REA para arquivo posicional Layout 3 do Domínio
   */
  static exportLayout3(agents: EconomicAgent[], options?: { codigoEmpresa?: number }): string {
    const codEmp = options?.codigoEmpresa || 1;
    const records: DominioParticipanteRecord[] = [];

    for (const a of agents) {
      if (a.role === AgentRole.SUPPLIER || a.role === AgentRole.CUSTOMER) {
        records.push({
          tipoRegistro: a.role === AgentRole.SUPPLIER ? '11' : '22',
          codigoEmpresa: codEmp,
          uf: a.state || 'PA',
          codigoContaContabil: a.code || '0000000',
          codigoMunicipioIbge: a.cityCode || '1501402',
          nomeReduzido: (a.tradingName || a.name).slice(0, 10),
          razaoSocial: a.name,
          endereco: 'Logradouro Principal',
          numero: '100',
          complementoBairro: 'Centro',
          cep: '66000000',
          documento: a.document.replace(/\D/g, ''),
          inscricaoEstadual: a.stateRegistration || 'ISENTO',
          telefone: '91999999999',
          fax: '',
          produtorAgropecuario: 'N',
          optanteSimples: a.isSimplesNacional ? 'S' : 'N'
        });
      }
    }

    return DominioLayout3Engine.generate(records, { codigoEmpresa: codEmp });
  }

  /**
   * Exporta Dualidades REA para arquivo oficial Layout 19 do Domínio
   */
  static exportLayout19(
    dualities: EconomicDuality[],
    enterprise: EconomicAgent,
    options?: {
      tipoNotas?: '02' | '03';
      dataInicial?: string;
      dataFinal?: string;
    }
  ): string {
    const tipo = options?.tipoNotas || '02';
    const dates = dualities.map(d => d.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const dataIni = options?.dataInicial || (dates[0] ? padDate(dates[0]) : '01/01/2026');
    const dataFim = options?.dataFinal || (dates[dates.length - 1] ? padDate(dates[dates.length - 1]) : '31/12/2026');

    const header: DominioLayout19Header = {
      tipoRegistro: '01',
      codigoEmpresa: parseInt(enterprise.code || '1', 10) || 1,
      cnpjEmpresa: enterprise.document.replace(/\D/g, ''),
      dataInicial: dataIni,
      dataFinal: dataFim,
      fixoN: 'N',
      tipoNota: tipo,
      fixo00000: '00000',
      sistema: '1',
      versao: '19'
    };

    const details: DominioLayout19Detail[] = [];

    dualities.forEach((d, idx) => {
      // Procura evento principal de compra ou venda
      const acqEvt = d.incrementEvents.find(e => e.type === EconomicEventType.GOODS_ACQUISITION);
      const saleEvt = d.decrementEvents.find(e => e.type === EconomicEventType.GOODS_SALE);
      const mainEvt = acqEvt || saleEvt || d.incrementEvents[0];

      if (!mainEvt) return;

      const isEntrada = !!acqEvt;
      if (tipo === '02' && !isEntrada) return;
      if (tipo === '03' && isEntrada) return;

      const partnerDoc = isEntrada ? mainEvt.providerAgentId : mainEvt.receiverAgentId;
      const cleanDoc = partnerDoc.replace(/^agent-[a-z]+-/, '');

      const totValor = mainEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0);

      // Localiza evento tributário vinculado se existir
      const taxEvt = isEntrada 
        ? d.incrementEvents.find(e => e.type === EconomicEventType.TAX_CREDIT_ACCRUAL)
        : d.decrementEvents.find(e => e.type === EconomicEventType.TAX_LIABILITY_ACCRUAL);

      const vlrICMS = taxEvt ? taxEvt.stockFlows.reduce((s, f) => s + f.totalValue, 0) : 0;
      const baseICMS = taxEvt?.metadata?.taxDetails?.baseCalculo || (vlrICMS > 0 ? totValor : 0);
      const aliqICMS = taxEvt?.metadata?.taxDetails?.aliquota || (vlrICMS > 0 ? 18 : 0);

      details.push({
        tipoRegistro: isEntrada ? '02' : '03',
        sequencial: idx + 1,
        codigoEmpresa: header.codigoEmpresa,
        inscricaoParceiro: cleanDoc,
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: parseInt(mainEvt.metadata?.acumulador || (isEntrada ? '1' : '10'), 10),
        cfop: mainEvt.metadata?.cfop || (isEntrada ? '1102' : '5102'),
        unidade: '01',
        numeroDocumento: mainEvt.metadata?.documentNumber || String(idx + 1),
        serie: mainEvt.metadata?.series || '1',
        dataEntradaSaida: padDate(d.timestamp),
        dataEmissao: padDate(d.timestamp),
        valorContabil: totValor + (isEntrada ? vlrICMS : 0),
        baseICMS,
        aliquotaICMS: aliqICMS,
        valorICMS: vlrICMS,
        isentasICMS: 0,
        outrasICMS: 0,
        valorIPI: 0,
        aliquotaIPI: 0,
        chaveAcesso: mainEvt.metadata?.fiscalKey
      });
    });

    const file: DominioLayout19File = {
      header,
      details,
      totalRegistros: details.length
    };

    return DominioLayout19Engine.generate(file);
  }
}
