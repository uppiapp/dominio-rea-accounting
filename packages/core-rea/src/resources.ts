import { EconomicResource, ResourceType } from './types';

export class ResourceRepository {
  private resources: Map<string, EconomicResource> = new Map();

  register(resource: EconomicResource): EconomicResource {
    this.resources.set(resource.id, resource);
    return resource;
  }

  getById(id: string): EconomicResource | undefined {
    return this.resources.get(id);
  }

  getOrCreate(resource: EconomicResource): EconomicResource {
    const existing = this.resources.get(resource.id);
    if (existing) return existing;
    this.resources.set(resource.id, resource);
    return resource;
  }

  getAll(): EconomicResource[] {
    return Array.from(this.resources.values());
  }

  getByType(type: ResourceType): EconomicResource[] {
    return Array.from(this.resources.values()).filter(r => r.type === type);
  }

  clear(): void {
    this.resources.clear();
  }
}

export function createPhysicalGoodsResource(params: {
  id?: string;
  name: string;
  sku?: string;
  ncm?: string;
  unitOfMeasure?: string;
  initialQuantity?: number;
  initialValuation?: number;
}): EconomicResource {
  const id = params.id || `res-goods-${params.sku || params.name.toLowerCase().replace(/\s+/g, '-')}`;
  return {
    id,
    type: ResourceType.PHYSICAL_GOODS,
    name: params.name,
    sku: params.sku,
    ncm: params.ncm,
    unitOfMeasure: params.unitOfMeasure || 'UN',
    balance: params.initialQuantity || 0,
    valuation: params.initialValuation || 0
  };
}

export function createTaxCreditClaimResource(taxType: 'ICMS' | 'PIS' | 'COFINS' | 'IPI'): EconomicResource {
  return {
    id: `res-taxcredit-${taxType.toLowerCase()}`,
    type: ResourceType.TAX_CREDIT_CLAIM,
    name: `Crédito Tributário a Recuperar (${taxType})`,
    unitOfMeasure: 'BRL',
    balance: 0,
    valuation: 0
  };
}

export function createTaxLiabilityClaimResource(taxType: 'ICMS' | 'PIS' | 'COFINS' | 'ISS' | 'IRRF' | 'INSS' | 'SIMPLES'): EconomicResource {
  return {
    id: `res-taxliability-${taxType.toLowerCase()}`,
    type: ResourceType.TAX_LIABILITY_CLAIM,
    name: `Obrigação Tributária a Recolher (${taxType})`,
    unitOfMeasure: 'BRL',
    balance: 0,
    valuation: 0
  };
}

export function createFinancialClaimResource(params: {
  agentDocument: string;
  claimType: 'PAYABLE' | 'RECEIVABLE';
  documentReference?: string;
}): EconomicResource {
  const cleanDoc = params.agentDocument.replace(/\D/g, '');
  const prefix = params.claimType === 'PAYABLE' ? 'payable' : 'receivable';
  const docRef = params.documentReference ? `-${params.documentReference}` : '';
  return {
    id: `res-claim-${prefix}-${cleanDoc}${docRef}`,
    type: ResourceType.FINANCIAL_CLAIM,
    name: `${params.claimType === 'PAYABLE' ? 'Fornecedores a Pagar' : 'Clientes a Receber'} (${cleanDoc})`,
    unitOfMeasure: 'BRL',
    balance: 0,
    valuation: 0
  };
}

export function createMoneyCashResource(params?: {
  accountName?: string;
  bankCode?: string;
}): EconomicResource {
  const account = params?.accountName || 'Caixa Geral / Banco';
  const id = params?.bankCode ? `res-money-bank-${params.bankCode}` : 'res-money-cash';
  return {
    id,
    type: ResourceType.MONEY_CASH,
    name: account,
    unitOfMeasure: 'BRL',
    balance: 0,
    valuation: 0
  };
}

export function createLaborResource(params: {
  employeeId: string;
  description?: string;
}): EconomicResource {
  return {
    id: `res-labor-${params.employeeId}`,
    type: ResourceType.LABOR_RESOURCE,
    name: params.description || `Mão-de-Obra / Serviços Colaborador ${params.employeeId}`,
    unitOfMeasure: 'HR',
    balance: 0,
    valuation: 0
  };
}
