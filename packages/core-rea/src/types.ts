/**
 * REA Accounting Ontology (ISO/IEC 15944-4) Core Types
 * 
 * Formalized model of Resource-Event-Agent for Brazilian Fiscal & Financial Accounting
 */

export enum AgentRole {
  ENTERPRISE = 'ENTERPRISE', // The reporting entity (empresa contábil)
  SUPPLIER = 'SUPPLIER', // Fornecedor de mercadorias / serviços
  CUSTOMER = 'CUSTOMER', // Cliente tomador de mercadorias / serviços
  TAX_AUTHORITY = 'TAX_AUTHORITY', // Receita Federal / SEFAZ / Prefeitura
  EMPLOYEE = 'EMPLOYEE', // Colaborador / Empregado (eSocial)
  FINANCIAL_INSTITUTION = 'FINANCIAL_INSTITUTION' // Banco / Instituição Financeira
}

export interface EconomicAgent {
  id: string;
  code?: string; // Código Domínio (e.g. Fornecedor 0000001)
  name: string; // Razão Social / Nome
  tradingName?: string; // Nome Fantasia
  document: string; // CNPJ ou CPF
  stateRegistration?: string; // Inscrição Estadual
  cityCode?: string; // Código IBGE do Município
  state: string; // UF (ex: PA, SP)
  role: AgentRole;
  isSimplesNacional?: boolean;
}

export enum ResourceType {
  PHYSICAL_GOODS = 'PHYSICAL_GOODS', // Mercadoria para revenda / matéria-prima / consumo
  TAX_CREDIT_CLAIM = 'TAX_CREDIT_CLAIM', // Direito de crédito tributário (ICMS, PIS, COFINS a recuperar)
  TAX_LIABILITY_CLAIM = 'TAX_LIABILITY_CLAIM', // Obrigação tributária perante o Fisco (ICMS, ISS a recolher)
  FINANCIAL_CLAIM = 'FINANCIAL_CLAIM', // Duplicatas a pagar / receber (Contas a Pagar/Receber)
  MONEY_CASH = 'MONEY_CASH', // Moeda em caixa ou saldo bancário
  LABOR_RESOURCE = 'LABOR_RESOURCE' // Capacidade/horas de trabalho de colaboradores
}

export interface EconomicResource {
  id: string;
  type: ResourceType;
  name: string;
  sku?: string; // Código do Produto no Domínio / NCM
  ncm?: string;
  unitOfMeasure?: string; // UN, KG, CX, HR
  balance: number; // Quantidade ou valor corrente
  valuation: number; // Valor monetário corrente (BRL)
}

export enum StockFlowDirection {
  INCREMENT = 'INCREMENT', // Entrada de recurso no patrimônio (+ estoque, + crédito, + caixa)
  DECREMENT = 'DECREMENT'  // Saída de recurso do patrimônio (- estoque, - caixa, consumo)
}

export enum EconomicEventType {
  GOODS_ACQUISITION = 'GOODS_ACQUISITION', // Compra de mercadorias / insumos
  GOODS_SALE = 'GOODS_SALE',               // Venda de mercadorias
  LABOR_CONSUMPTION = 'LABOR_CONSUMPTION', // Utilização de mão-de-obra produtiva/administrativa
  TAX_CREDIT_ACCRUAL = 'TAX_CREDIT_ACCRUAL', // Reconhecimento de crédito de imposto (ICMS/PIS/COFINS entrada)
  TAX_LIABILITY_ACCRUAL = 'TAX_LIABILITY_ACCRUAL', // Reconhecimento de obrigação tributária (ICMS/ISS saída)
  TAX_SETTLEMENT = 'TAX_SETTLEMENT',       // Apuração / compensação e recolhimento de tributo
  CASH_DISBURSEMENT = 'CASH_DISBURSEMENT', // Pagamento em moeda / banco (baixa de passivo)
  CASH_RECEIPT = 'CASH_RECEIPT'            // Recebimento em moeda / banco (baixa de ativo cliente)
}

export interface StockFlow {
  resourceId: string;
  direction: StockFlowDirection;
  quantity: number;
  unitValue: number;
  totalValue: number;
}

export interface EconomicEvent {
  id: string;
  type: EconomicEventType;
  timestamp: Date;
  providerAgentId: string; // Quem cede o recurso no evento
  receiverAgentId: string; // Quem recebe o recurso no evento
  stockFlows: StockFlow[];
  metadata?: {
    documentNumber?: string;
    series?: string;
    fiscalKey?: string; // Chave NF-e 44 dígitos
    cfop?: string;
    acumulador?: string; // Acumulador Domínio Sistemas
    observation?: string;
    taxDetails?: {
      baseCalculo?: number;
      aliquota?: number;
      imposto?: string; // 'ICMS' | 'PIS' | 'COFINS' | 'ISS' | 'IPI'
    };
  };
}

export enum DualityType {
  EXCHANGE = 'EXCHANGE',         // Troca mercantil com agentes externos (Compra / Venda / Pagamento)
  CONVERSION = 'CONVERSION',     // Conversão interna (Produção / Consumo interno)
  TAX_OBLIGATION = 'TAX_OBLIGATION' // Tributação incidente sobre operação econômica
}

export interface EconomicDuality {
  id: string;
  dualityType: DualityType;
  description: string;
  timestamp: Date;
  incrementEvents: EconomicEvent[]; // Eventos que representam o que foi obtido/incrementado
  decrementEvents: EconomicEvent[]; // Eventos que representam o que foi cedido/sacrificado
  businessKey?: string; // e.g. NF-e Chave de Acesso
}
