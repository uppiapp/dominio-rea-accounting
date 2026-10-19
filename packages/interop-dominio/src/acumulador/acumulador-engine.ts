import { 
  EconomicDuality, 
  EconomicEvent, 
  EconomicAgent, 
  ResourceType, 
  EconomicEventType,
  StockFlowDirection
} from '../../../core-rea/src/types';
import { 
  createPhysicalGoodsResource, 
  createTaxCreditClaimResource, 
  createTaxLiabilityClaimResource, 
  createFinancialClaimResource, 
  ResourceRepository 
} from '../../../core-rea/src/resources';
import { 
  createGoodsAcquisitionEvent, 
  createGoodsSaleEvent, 
  createTaxCreditAccrualEvent, 
  createTaxLiabilityAccrualEvent, 
  createFinancialClaimPayableEvent, 
  createFinancialClaimReceivableEvent 
} from '../../../core-rea/src/events';
import { buildAcquisitionDuality, buildSaleDuality } from '../../../core-rea/src/duality';
import { DominioLayout19Detail } from '../layouts/layout19';

export interface AcumuladorDefinition {
  codigo: number;
  descricao: string;
  tipoOperacao: 'ENTRADA' | 'SAIDA' | 'SERVICO';
  natureza: 'REVENDA' | 'USO_CONSUMO' | 'ATIVO_IMOBILIZADO' | 'SERVICO' | 'VENDA';
  creditaICMS: boolean;
  creditaPISCOFINS: boolean;
  debitaICMS: boolean;
  debitaPISCOFINS: boolean;
  retencaoISS: boolean;
}

export const ACUMULADORES_PADRAO: Record<number, AcumuladorDefinition> = {
  1: {
    codigo: 1,
    descricao: 'Compra de Mercadorias para Revenda',
    tipoOperacao: 'ENTRADA',
    natureza: 'REVENDA',
    creditaICMS: true,
    creditaPISCOFINS: true,
    debitaICMS: false,
    debitaPISCOFINS: false,
    retencaoISS: false
  },
  2: {
    codigo: 2,
    descricao: 'Compra para Uso e Consumo',
    tipoOperacao: 'ENTRADA',
    natureza: 'USO_CONSUMO',
    creditaICMS: false,
    creditaPISCOFINS: false,
    debitaICMS: false,
    debitaPISCOFINS: false,
    retencaoISS: false
  },
  10: {
    codigo: 10,
    descricao: 'Venda de Mercadorias no Mercado Interno',
    tipoOperacao: 'SAIDA',
    natureza: 'VENDA',
    creditaICMS: false,
    creditaPISCOFINS: false,
    debitaICMS: true,
    debitaPISCOFINS: true,
    retencaoISS: false
  },
  50: {
    codigo: 50,
    descricao: 'Prestação de Serviços Sujeita ao ISS',
    tipoOperacao: 'SAIDA',
    natureza: 'SERVICO',
    creditaICMS: false,
    creditaPISCOFINS: false,
    debitaICMS: false,
    debitaPISCOFINS: true,
    retencaoISS: true
  }
};

export class AcumuladorMappingEngine {
  private customAcumuladores: Map<number, AcumuladorDefinition> = new Map();

  constructor() {
    for (const [k, v] of Object.entries(ACUMULADORES_PADRAO)) {
      this.customAcumuladores.set(Number(k), v);
    }
  }

  registerAcumulador(def: AcumuladorDefinition): void {
    this.customAcumuladores.set(def.codigo, def);
  }

  getAcumulador(codigo: number): AcumuladorDefinition {
    return this.customAcumuladores.get(codigo) || {
      codigo,
      descricao: `Acumulador Personalizado ${codigo}`,
      tipoOperacao: codigo >= 10 ? 'SAIDA' : 'ENTRADA',
      natureza: codigo >= 10 ? 'VENDA' : 'REVENDA',
      creditaICMS: codigo < 10,
      creditaPISCOFINS: false,
      debitaICMS: codigo >= 10,
      debitaPISCOFINS: false,
      retencaoISS: false
    };
  }

  /**
   * Converte uma nota fiscal do Layout 19 do Domínio em uma Dualidade Econômica REA
   */
  mapInvoiceToREADuality(
    invoice: DominioLayout19Detail,
    enterprise: EconomicAgent,
    partner: EconomicAgent,
    taxAuthority: EconomicAgent,
    resourceRepo: ResourceRepository
  ): EconomicDuality {
    const acumulador = this.getAcumulador(invoice.codigoAcumulador);
    const dateParts = invoice.dataEmissao.split('/');
    const timestamp = dateParts.length === 3 
      ? new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]))
      : new Date();

    const businessKey = invoice.chaveAcesso || `NF-${invoice.numeroDocumento}-SERIE-${invoice.serie}`;

    if (invoice.tipoRegistro === '02') {
      // ENTRADA (Compra de Mercadorias / Insumos)
      const vlrTotal = invoice.valorContabil;
      let vlrICMSCredito = 0;

      if (acumulador.creditaICMS && invoice.valorICMS > 0) {
        vlrICMSCredito = invoice.valorICMS;
      }

      // No REA, o recurso mercadoria entra pelo custo líquido de tributos recuperáveis
      const vlrLiquidoMercadoria = Math.max(0, vlrTotal - vlrICMSCredito);

      const goodsRes = resourceRepo.getOrCreate(
        createPhysicalGoodsResource({
          name: `Mercadoria NF ${invoice.numeroDocumento}`,
          sku: `ITEM-${invoice.cfop}`
        })
      );

      const claimPayableRes = resourceRepo.getOrCreate(
        createFinancialClaimResource({
          agentDocument: partner.document,
          claimType: 'PAYABLE',
          documentReference: invoice.numeroDocumento
        })
      );

      // Evento 1: Entrada física do recurso mercadoria
      const goodsAcqEvent = createGoodsAcquisitionEvent({
        timestamp,
        supplierAgentId: partner.id,
        enterpriseAgentId: enterprise.id,
        goodsResourceId: goodsRes.id,
        quantity: 1,
        unitValue: vlrLiquidoMercadoria,
        totalValue: vlrLiquidoMercadoria,
        metadata: {
          documentNumber: invoice.numeroDocumento,
          series: invoice.serie,
          fiscalKey: invoice.chaveAcesso,
          cfop: invoice.cfop,
          acumulador: String(invoice.codigoAcumulador)
        }
      });

      // Evento 2: Reconhecimento do Crédito Tributário (se creditável)
      const taxEvents: EconomicEvent[] = [];
      if (vlrICMSCredito > 0) {
        const icmsRes = resourceRepo.getOrCreate(createTaxCreditClaimResource('ICMS'));
        const taxEvent = createTaxCreditAccrualEvent({
          timestamp,
          taxAuthorityAgentId: taxAuthority.id,
          enterpriseAgentId: enterprise.id,
          taxCreditResourceId: icmsRes.id,
          amount: vlrICMSCredito,
          taxType: 'ICMS',
          baseCalculo: invoice.baseICMS,
          aliquota: invoice.aliquotaICMS,
          metadata: {
            documentNumber: invoice.numeroDocumento,
            fiscalKey: invoice.chaveAcesso
          }
        });
        taxEvents.push(taxEvent);
      }

      // Evento 3: Reconhecimento da Obrigação Financeira (Duplicata a Pagar Fornecedor)
      const payableEvent = createFinancialClaimPayableEvent({
        timestamp,
        enterpriseAgentId: enterprise.id,
        supplierAgentId: partner.id,
        claimResourceId: claimPayableRes.id,
        amount: vlrTotal,
        metadata: {
          documentNumber: invoice.numeroDocumento,
          fiscalKey: invoice.chaveAcesso
        }
      });

      return buildAcquisitionDuality({
        timestamp,
        businessKey,
        description: `Aquisição de Mercadorias (Acumulador ${acumulador.codigo} - ${acumulador.descricao}) - NF ${invoice.numeroDocumento}`,
        goodsEvent: goodsAcqEvent,
        taxCreditEvents: taxEvents,
        payableClaimEvent: payableEvent
      });

    } else {
      // SAÍDA (Venda de Mercadorias ou Serviços)
      const vlrTotal = invoice.valorContabil;
      const vlrICMSDebito = (acumulador.debitaICMS && invoice.valorICMS > 0) ? invoice.valorICMS : 0;
      // Custo estimado do estoque baixado (margem presumida de 60% custo / 40% margem comercial)
      const custoMercadoriaVendida = Math.round(vlrTotal * 0.60 * 100) / 100;

      const goodsRes = resourceRepo.getOrCreate(
        createPhysicalGoodsResource({
          name: `Mercadoria NF ${invoice.numeroDocumento}`,
          sku: `ITEM-${invoice.cfop}`
        })
      );

      const claimReceivableRes = resourceRepo.getOrCreate(
        createFinancialClaimResource({
          agentDocument: partner.document,
          claimType: 'RECEIVABLE',
          documentReference: invoice.numeroDocumento
        })
      );

      // Evento 1: Reconhecimento do Direito Financeiro (Duplicata a Receber Cliente)
      const receivableEvent = createFinancialClaimReceivableEvent({
        timestamp,
        customerAgentId: partner.id,
        enterpriseAgentId: enterprise.id,
        claimResourceId: claimReceivableRes.id,
        amount: vlrTotal,
        metadata: {
          documentNumber: invoice.numeroDocumento,
          series: invoice.serie,
          fiscalKey: invoice.chaveAcesso,
          cfop: invoice.cfop,
          acumulador: String(invoice.codigoAcumulador)
        }
      });

      // Evento 2: Baixa física do estoque de mercadorias pelo custo (CMV)
      const goodsDeliveryEvent = createGoodsSaleEvent({
        timestamp,
        enterpriseAgentId: enterprise.id,
        customerAgentId: partner.id,
        goodsResourceId: goodsRes.id,
        quantity: 1,
        unitCost: custoMercadoriaVendida,
        totalCost: custoMercadoriaVendida,
        metadata: {
          documentNumber: invoice.numeroDocumento,
          fiscalKey: invoice.chaveAcesso
        }
      });

      // Evento 3: Reconhecimento da Obrigação Tributária sobre Venda (ICMS a recolher)
      const taxEvents: EconomicEvent[] = [];
      if (vlrICMSDebito > 0) {
        const icmsLiabRes = resourceRepo.getOrCreate(createTaxLiabilityClaimResource('ICMS'));
        const taxEvent = createTaxLiabilityAccrualEvent({
          timestamp,
          enterpriseAgentId: enterprise.id,
          taxAuthorityAgentId: taxAuthority.id,
          taxLiabilityResourceId: icmsLiabRes.id,
          amount: vlrICMSDebito,
          taxType: 'ICMS',
          baseCalculo: invoice.baseICMS,
          aliquota: invoice.aliquotaICMS,
          metadata: {
            documentNumber: invoice.numeroDocumento,
            fiscalKey: invoice.chaveAcesso
          }
        });
        taxEvents.push(taxEvent);
      }

      return buildSaleDuality({
        timestamp,
        businessKey,
        description: `Venda Comercial (Acumulador ${acumulador.codigo} - ${acumulador.descricao}) - NF ${invoice.numeroDocumento}`,
        receivableClaimEvent: receivableEvent,
        goodsDeliveryEvent: goodsDeliveryEvent,
        taxLiabilityEvents: taxEvents
      });
    }
  }
}
