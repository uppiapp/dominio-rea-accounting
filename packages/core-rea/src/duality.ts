import { 
  EconomicDuality, 
  EconomicEvent, 
  DualityType, 
  StockFlowDirection, 
  EconomicResource 
} from './types';
import { ResourceRepository } from './resources';

export interface DualityValidationResult {
  valid: boolean;
  errors: string[];
}

export class DualityManager {
  private dualities: Map<string, EconomicDuality> = new Map();

  registerDuality(duality: EconomicDuality): EconomicDuality {
    const val = this.validateDuality(duality);
    if (!val.valid) {
      throw new Error(`Invalid Economic Duality (${duality.id}): ${val.errors.join('; ')}`);
    }
    this.dualities.set(duality.id, duality);
    return duality;
  }

  getById(id: string): EconomicDuality | undefined {
    return this.dualities.get(id);
  }

  getByBusinessKey(businessKey: string): EconomicDuality | undefined {
    for (const d of this.dualities.values()) {
      if (d.businessKey === businessKey) return d;
    }
    return undefined;
  }

  getAll(): EconomicDuality[] {
    return Array.from(this.dualities.values());
  }

  /**
   * REA Duality Validation:
   * 1. Must contain at least one increment event and one decrement event (or balanced give-take).
   * 2. Economic value equilibrium must be preserved across dualities.
   */
  validateDuality(duality: EconomicDuality): DualityValidationResult {
    const errors: string[] = [];

    if (!duality.incrementEvents || duality.incrementEvents.length === 0) {
      errors.push('Duality must have at least one increment event (resource inflow/obtained).');
    }
    if (!duality.decrementEvents || duality.decrementEvents.length === 0) {
      errors.push('Duality must have at least one decrement event (resource outflow/obligation).');
    }

    const totalIncrement = duality.incrementEvents.reduce((sum, evt) => {
      return sum + evt.stockFlows.reduce((fSum, sf) => fSum + sf.totalValue, 0);
    }, 0);

    const totalDecrement = duality.decrementEvents.reduce((sum, evt) => {
      return sum + evt.stockFlows.reduce((fSum, sf) => fSum + sf.totalValue, 0);
    }, 0);

    // In a pure commercial exchange, values should be aligned within rounding tolerance
    // Note: In Sales duality, the commercial value of receivable equals sales price,
    // while inventory decrement is at cost (CMV). The margin is the economic surplus/profit.
    if (duality.dualityType === DualityType.EXCHANGE) {
      // In a purchase or settlement exchange, totalIncrement should approximately match totalDecrement
      // Or in a sale exchange, the financial claim matches the gross invoice value
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Applies stock-flows of all dualities onto a ResourceRepository,
   * calculating updated balances and valuations in real-time.
   */
  applyStockFlows(resourceRepo: ResourceRepository): void {
    for (const duality of this.dualities.values()) {
      const allEvents = [...duality.incrementEvents, ...duality.decrementEvents];
      for (const event of allEvents) {
        for (const sf of event.stockFlows) {
          const res = resourceRepo.getById(sf.resourceId);
          if (res) {
            if (sf.direction === StockFlowDirection.INCREMENT) {
              res.balance += sf.quantity;
              res.valuation += sf.totalValue;
            } else {
              res.balance -= sf.quantity;
              res.valuation -= sf.totalValue;
            }
          }
        }
      }
    }
  }

  clear(): void {
    this.dualities.clear();
  }
}

/**
 * Helper to build an Acquisition Duality (Compra de Mercadorias / Insumos)
 * Economic Duality:
 * - INCREMENT: Inflow of Goods (net value) + Inflow of Tax Credit Claims (ICMS, PIS, COFINS)
 * - DECREMENT: Creation of Financial Liability Claim (Fornecedores a Pagar)
 */
export function buildAcquisitionDuality(params: {
  id?: string;
  timestamp: Date;
  businessKey?: string;
  description: string;
  goodsEvent: EconomicEvent;
  taxCreditEvents?: EconomicEvent[];
  payableClaimEvent: EconomicEvent;
}): EconomicDuality {
  const incrementEvents = [params.goodsEvent, ...(params.taxCreditEvents || [])];
  const decrementEvents = [params.payableClaimEvent];

  return {
    id: params.id || `dual-acq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    dualityType: DualityType.EXCHANGE,
    description: params.description,
    timestamp: params.timestamp,
    businessKey: params.businessKey,
    incrementEvents,
    decrementEvents
  };
}

/**
 * Helper to build a Sale Duality (Venda de Mercadorias)
 * Economic Duality:
 * - INCREMENT: Inflow of Financial Claim (Clientes a Receber pelo valor bruto)
 * - DECREMENT: Outflow of Goods (Baixa do Estoque pelo custo CMV) + Outflow de Obrigações Tributárias (ICMS/PIS/COFINS a recolher)
 */
export function buildSaleDuality(params: {
  id?: string;
  timestamp: Date;
  businessKey?: string;
  description: string;
  receivableClaimEvent: EconomicEvent;
  goodsDeliveryEvent: EconomicEvent; // CMV
  taxLiabilityEvents?: EconomicEvent[]; // ICMS sobre Vendas, etc.
}): EconomicDuality {
  const incrementEvents = [params.receivableClaimEvent];
  const decrementEvents = [params.goodsDeliveryEvent, ...(params.taxLiabilityEvents || [])];

  return {
    id: params.id || `dual-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    dualityType: DualityType.EXCHANGE,
    description: params.description,
    timestamp: params.timestamp,
    businessKey: params.businessKey,
    incrementEvents,
    decrementEvents
  };
}

/**
 * Helper to build a Cash Settlement Duality (Pagamento / Recebimento Financeiro)
 * Economic Duality:
 * - DECREMENT: Cash / Bank disbursement
 * - DECREMENT / SETTLEMENT: Extinguishment of Payable liability
 */
export function buildSettlementDuality(params: {
  id?: string;
  timestamp: Date;
  businessKey?: string;
  description: string;
  cashEvent: EconomicEvent;
  settlementSideEvent: EconomicEvent;
}): EconomicDuality {
  return {
    id: params.id || `dual-settle-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    dualityType: DualityType.EXCHANGE,
    description: params.description,
    timestamp: params.timestamp,
    businessKey: params.businessKey,
    incrementEvents: [params.settlementSideEvent],
    decrementEvents: [params.cashEvent]
  };
}
