import { AgentRole, EconomicAgent } from './types';

export class AgentRepository {
  private agents: Map<string, EconomicAgent> = new Map();

  register(agent: EconomicAgent): EconomicAgent {
    this.agents.set(agent.id, agent);
    return agent;
  }

  getById(id: string): EconomicAgent | undefined {
    return this.agents.get(id);
  }

  getByDocument(doc: string): EconomicAgent | undefined {
    const cleanDoc = doc.replace(/\D/g, '');
    for (const a of this.agents.values()) {
      if (a.document.replace(/\D/g, '') === cleanDoc) {
        return a;
      }
    }
    return undefined;
  }

  getByCode(code: string): EconomicAgent | undefined {
    for (const a of this.agents.values()) {
      if (a.code === code) return a;
    }
    return undefined;
  }

  getAll(): EconomicAgent[] {
    return Array.from(this.agents.values());
  }

  clear(): void {
    this.agents.clear();
  }
}

export function createEnterpriseAgent(params: {
  id?: string;
  code?: string;
  name: string;
  tradingName?: string;
  document: string;
  stateRegistration?: string;
  cityCode?: string;
  state: string;
  isSimplesNacional?: boolean;
}): EconomicAgent {
  return {
    id: params.id || `agent-ent-${params.document.replace(/\D/g, '')}`,
    code: params.code || '0000001',
    name: params.name,
    tradingName: params.tradingName,
    document: params.document,
    stateRegistration: params.stateRegistration,
    cityCode: params.cityCode,
    state: params.state,
    role: AgentRole.ENTERPRISE,
    isSimplesNacional: params.isSimplesNacional ?? false
  };
}

export function createSupplierAgent(params: {
  id?: string;
  code?: string;
  name: string;
  tradingName?: string;
  document: string;
  stateRegistration?: string;
  cityCode?: string;
  state: string;
  isSimplesNacional?: boolean;
}): EconomicAgent {
  return {
    id: params.id || `agent-sup-${params.document.replace(/\D/g, '')}`,
    code: params.code,
    name: params.name,
    tradingName: params.tradingName,
    document: params.document,
    stateRegistration: params.stateRegistration,
    cityCode: params.cityCode,
    state: params.state,
    role: AgentRole.SUPPLIER,
    isSimplesNacional: params.isSimplesNacional ?? false
  };
}

export function createCustomerAgent(params: {
  id?: string;
  code?: string;
  name: string;
  tradingName?: string;
  document: string;
  stateRegistration?: string;
  cityCode?: string;
  state: string;
  isSimplesNacional?: boolean;
}): EconomicAgent {
  return {
    id: params.id || `agent-cust-${params.document.replace(/\D/g, '')}`,
    code: params.code,
    name: params.name,
    tradingName: params.tradingName,
    document: params.document,
    stateRegistration: params.stateRegistration,
    cityCode: params.cityCode,
    state: params.state,
    role: AgentRole.CUSTOMER,
    isSimplesNacional: params.isSimplesNacional ?? false
  };
}

export function createTaxAuthorityAgent(params: {
  jurisdiction: 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL';
  state?: string;
  name?: string;
}): EconomicAgent {
  const name = params.name || (
    params.jurisdiction === 'FEDERAL' ? 'Receita Federal do Brasil' :
    params.jurisdiction === 'ESTADUAL' ? `Secretaria da Fazenda Estadual (${params.state || 'UF'})` :
    'Prefeitura Municipal'
  );
  return {
    id: `agent-tax-${params.jurisdiction.toLowerCase()}-${params.state || 'br'}`,
    name,
    document: params.jurisdiction === 'FEDERAL' ? '00394460000141' : '00000000000000',
    state: params.state || 'BR',
    role: AgentRole.TAX_AUTHORITY
  };
}

export function createEmployeeAgent(params: {
  id?: string;
  code?: string;
  name: string;
  cpf: string;
  state?: string;
}): EconomicAgent {
  return {
    id: params.id || `agent-emp-${params.cpf.replace(/\D/g, '')}`,
    code: params.code,
    name: params.name,
    document: params.cpf,
    state: params.state || 'PA',
    role: AgentRole.EMPLOYEE
  };
}
