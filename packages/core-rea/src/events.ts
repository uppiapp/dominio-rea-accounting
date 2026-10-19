import { EconomicEvent, EconomicEventType, StockFlow, StockFlowDirection } from './types';

export function createGoodsAcquisitionEvent(params: {
  id?: string;
  timestamp: Date;
  supplierAgentId: string;
  enterpriseAgentId: string;
  goodsResourceId: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  const stockFlow: StockFlow = {
    resourceId: params.goodsResourceId,
    direction: StockFlowDirection.INCREMENT,
    quantity: params.quantity,
    unitValue: params.unitValue,
    totalValue: params.totalValue
  };

  return {
    id: params.id || `evt-acq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.GOODS_ACQUISITION,
    timestamp: params.timestamp,
    providerAgentId: params.supplierAgentId,
    receiverAgentId: params.enterpriseAgentId,
    stockFlows: [stockFlow],
    metadata: params.metadata
  };
}

export function createGoodsSaleEvent(params: {
  id?: string;
  timestamp: Date;
  enterpriseAgentId: string;
  customerAgentId: string;
  goodsResourceId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  const stockFlow: StockFlow = {
    resourceId: params.goodsResourceId,
    direction: StockFlowDirection.DECREMENT,
    quantity: params.quantity,
    unitValue: params.unitCost,
    totalValue: params.totalCost
  };

  return {
    id: params.id || `evt-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.GOODS_SALE,
    timestamp: params.timestamp,
    providerAgentId: params.enterpriseAgentId,
    receiverAgentId: params.customerAgentId,
    stockFlows: [stockFlow],
    metadata: params.metadata
  };
}

export function createTaxCreditAccrualEvent(params: {
  id?: string;
  timestamp: Date;
  taxAuthorityAgentId: string;
  enterpriseAgentId: string;
  taxCreditResourceId: string;
  amount: number;
  taxType: 'ICMS' | 'PIS' | 'COFINS' | 'IPI';
  baseCalculo?: number;
  aliquota?: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  const stockFlow: StockFlow = {
    resourceId: params.taxCreditResourceId,
    direction: StockFlowDirection.INCREMENT,
    quantity: params.amount,
    unitValue: 1.0,
    totalValue: params.amount
  };

  return {
    id: params.id || `evt-taxcred-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.TAX_CREDIT_ACCRUAL,
    timestamp: params.timestamp,
    providerAgentId: params.taxAuthorityAgentId,
    receiverAgentId: params.enterpriseAgentId,
    stockFlows: [stockFlow],
    metadata: {
      ...params.metadata,
      taxDetails: {
        baseCalculo: params.baseCalculo,
        aliquota: params.aliquota,
        imposto: params.taxType
      }
    }
  };
}

export function createTaxLiabilityAccrualEvent(params: {
  id?: string;
  timestamp: Date;
  enterpriseAgentId: string;
  taxAuthorityAgentId: string;
  taxLiabilityResourceId: string;
  amount: number;
  taxType: 'ICMS' | 'PIS' | 'COFINS' | 'ISS' | 'IRRF' | 'INSS' | 'SIMPLES';
  baseCalculo?: number;
  aliquota?: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  // Obrigação tributária perante o Estado gerada pela operação mercantil/serviço
  const stockFlow: StockFlow = {
    resourceId: params.taxLiabilityResourceId,
    direction: StockFlowDirection.INCREMENT, // Incrementa a obrigação a recolher
    quantity: params.amount,
    unitValue: 1.0,
    totalValue: params.amount
  };

  return {
    id: params.id || `evt-taxliab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.TAX_LIABILITY_ACCRUAL,
    timestamp: params.timestamp,
    providerAgentId: params.enterpriseAgentId,
    receiverAgentId: params.taxAuthorityAgentId,
    stockFlows: [stockFlow],
    metadata: {
      ...params.metadata,
      taxDetails: {
        baseCalculo: params.baseCalculo,
        aliquota: params.aliquota,
        imposto: params.taxType
      }
    }
  };
}

export function createFinancialClaimPayableEvent(params: {
  id?: string;
  timestamp: Date;
  enterpriseAgentId: string;
  supplierAgentId: string;
  claimResourceId: string;
  amount: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  // Emissão de direito financeiro do fornecedor (Obrigação da empresa / Duplicata a Pagar)
  const stockFlow: StockFlow = {
    resourceId: params.claimResourceId,
    direction: StockFlowDirection.INCREMENT,
    quantity: params.amount,
    unitValue: 1.0,
    totalValue: params.amount
  };

  return {
    id: params.id || `evt-claim-pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.GOODS_ACQUISITION, // Dual side of exchange
    timestamp: params.timestamp,
    providerAgentId: params.enterpriseAgentId,
    receiverAgentId: params.supplierAgentId,
    stockFlows: [stockFlow],
    metadata: params.metadata
  };
}

export function createFinancialClaimReceivableEvent(params: {
  id?: string;
  timestamp: Date;
  customerAgentId: string;
  enterpriseAgentId: string;
  claimResourceId: string;
  amount: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  // Reconhecimento do direito a receber da empresa contra o cliente
  const stockFlow: StockFlow = {
    resourceId: params.claimResourceId,
    direction: StockFlowDirection.INCREMENT,
    quantity: params.amount,
    unitValue: 1.0,
    totalValue: params.amount
  };

  return {
    id: params.id || `evt-claim-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.GOODS_SALE, // Dual side of exchange
    timestamp: params.timestamp,
    providerAgentId: params.customerAgentId,
    receiverAgentId: params.enterpriseAgentId,
    stockFlows: [stockFlow],
    metadata: params.metadata
  };
}

export function createCashDisbursementEvent(params: {
  id?: string;
  timestamp: Date;
  enterpriseAgentId: string;
  beneficiaryAgentId: string;
  cashResourceId: string;
  claimResourceId?: string;
  amount: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  const stockFlows: StockFlow[] = [
    {
      resourceId: params.cashResourceId,
      direction: StockFlowDirection.DECREMENT, // Sai dinheiro do caixa/banco
      quantity: params.amount,
      unitValue: 1.0,
      totalValue: params.amount
    }
  ];

  if (params.claimResourceId) {
    stockFlows.push({
      resourceId: params.claimResourceId,
      direction: StockFlowDirection.DECREMENT, // Baixa o passivo a pagar
      quantity: params.amount,
      unitValue: 1.0,
      totalValue: params.amount
    });
  }

  return {
    id: params.id || `evt-disb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.CASH_DISBURSEMENT,
    timestamp: params.timestamp,
    providerAgentId: params.enterpriseAgentId,
    receiverAgentId: params.beneficiaryAgentId,
    stockFlows,
    metadata: params.metadata
  };
}

export function createCashReceiptEvent(params: {
  id?: string;
  timestamp: Date;
  payerAgentId: string;
  enterpriseAgentId: string;
  cashResourceId: string;
  claimResourceId?: string;
  amount: number;
  metadata?: EconomicEvent['metadata'];
}): EconomicEvent {
  const stockFlows: StockFlow[] = [
    {
      resourceId: params.cashResourceId,
      direction: StockFlowDirection.INCREMENT, // Entra dinheiro no caixa/banco
      quantity: params.amount,
      unitValue: 1.0,
      totalValue: params.amount
    }
  ];

  if (params.claimResourceId) {
    stockFlows.push({
      resourceId: params.claimResourceId,
      direction: StockFlowDirection.DECREMENT, // Baixa o direito a receber
      quantity: params.amount,
      unitValue: 1.0,
      totalValue: params.amount
    });
  }

  return {
    id: params.id || `evt-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: EconomicEventType.CASH_RECEIPT,
    timestamp: params.timestamp,
    providerAgentId: params.payerAgentId,
    receiverAgentId: params.enterpriseAgentId,
    stockFlows,
    metadata: params.metadata
  };
}
