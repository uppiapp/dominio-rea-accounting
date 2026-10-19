import { AgentRepository, createCustomerAgent, createEnterpriseAgent, createSupplierAgent, createTaxAuthorityAgent } from '../../core-rea/src/agents';
import { ResourceRepository } from '../../core-rea/src/resources';
import { DualityManager } from '../../core-rea/src/duality';
import { REAEventStore } from '../../core-rea/src/event-store';
import { EconomicAgent, AgentRole } from '../../core-rea/src/types';
import { DominioLayout19Engine } from './layouts/layout19';
import { DominioLayout3Engine } from './layouts/layout3';
import { AcumuladorMappingEngine } from './acumulador/acumulador-engine';

export interface ImportResult {
  enterprise: EconomicAgent;
  importedPartnersCount: number;
  importedInvoicesCount: number;
  generatedDualitiesCount: number;
}

export class DominioDataImporter {
  private agentRepo: AgentRepository;
  private resourceRepo: ResourceRepository;
  private dualityManager: DualityManager;
  private eventStore: REAEventStore;
  private acumuladorEngine: AcumuladorMappingEngine;

  constructor(
    agentRepo: AgentRepository,
    resourceRepo: ResourceRepository,
    dualityManager: DualityManager,
    eventStore: REAEventStore
  ) {
    this.agentRepo = agentRepo;
    this.resourceRepo = resourceRepo;
    this.dualityManager = dualityManager;
    this.eventStore = eventStore;
    this.acumuladorEngine = new AcumuladorMappingEngine();
  }

  /**
   * Importa arquivos oficiais Layout 3 e Layout 19 do Domínio Sistemas,
   * gerando agentes, recursos, eventos primitivos e dualidades REA.
   */
  importFromLayoutTexts(
    layout3ParticipantesText: string,
    layout19NotasText: string,
    enterpriseOptions?: {
      code?: string;
      name?: string;
      document?: string;
      state?: string;
    }
  ): ImportResult {
    // 1. Processa Layout 19 para obter metadados do cabeçalho da empresa
    const layout19File = DominioLayout19Engine.parse(layout19NotasText);
    const empCnpj = enterpriseOptions?.document || layout19File.header.cnpjEmpresa || '00000000000191';
    
    let enterprise = this.agentRepo.getByDocument(empCnpj);
    if (!enterprise) {
      enterprise = createEnterpriseAgent({
        code: enterpriseOptions?.code || String(layout19File.header.codigoEmpresa),
        name: enterpriseOptions?.name || `Empresa Contábil ${layout19File.header.codigoEmpresa}`,
        document: empCnpj,
        state: enterpriseOptions?.state || 'PA'
      });
      this.agentRepo.register(enterprise);
    }

    // 2. Registra Fisco / Autoridade Tributária
    const taxAuthority = createTaxAuthorityAgent({
      jurisdiction: 'ESTADUAL',
      state: enterprise.state
    });
    this.agentRepo.register(taxAuthority);

    // 3. Processa Layout 3 (Fornecedores e Clientes)
    let importedPartnersCount = 0;
    if (layout3ParticipantesText && layout3ParticipantesText.trim().length > 0) {
      const partRecords = DominioLayout3Engine.parse(layout3ParticipantesText);
      for (const rec of partRecords) {
        if (!this.agentRepo.getByDocument(rec.documento)) {
          const agent: EconomicAgent = rec.tipoRegistro === '11'
            ? createSupplierAgent({
                code: rec.codigoContaContabil,
                name: rec.razaoSocial,
                tradingName: rec.nomeReduzido,
                document: rec.documento,
                stateRegistration: rec.inscricaoEstadual,
                cityCode: rec.codigoMunicipioIbge,
                state: rec.uf,
                isSimplesNacional: rec.optanteSimples === 'S'
              })
            : createCustomerAgent({
                code: rec.codigoContaContabil,
                name: rec.razaoSocial,
                tradingName: rec.nomeReduzido,
                document: rec.documento,
                stateRegistration: rec.inscricaoEstadual,
                cityCode: rec.codigoMunicipioIbge,
                state: rec.uf,
                isSimplesNacional: rec.optanteSimples === 'S'
              });

          this.agentRepo.register(agent);
          importedPartnersCount++;
        }
      }
    }

    // 4. Converte cada Nota do Layout 19 em REA Economic Duality
    let importedInvoicesCount = 0;
    let generatedDualitiesCount = 0;

    for (const detail of layout19File.details) {
      importedInvoicesCount++;
      const partnerDoc = detail.inscricaoParceiro.replace(/\D/g, '');
      let partner = this.agentRepo.getByDocument(partnerDoc);

      if (!partner) {
        // Cria agente parceiro sob demanda caso não conste no Layout 3
        partner = detail.tipoRegistro === '02'
          ? createSupplierAgent({
              name: `Fornecedor ${partnerDoc}`,
              document: partnerDoc,
              state: detail.ufParceiro || enterprise.state
            })
          : createCustomerAgent({
              name: `Cliente ${partnerDoc}`,
              document: partnerDoc,
              state: detail.ufParceiro || enterprise.state
            });
        this.agentRepo.register(partner);
      }

      const duality = this.acumuladorEngine.mapInvoiceToREADuality(
        detail,
        enterprise,
        partner,
        taxAuthority,
        this.resourceRepo
      );

      this.dualityManager.registerDuality(duality);
      this.eventStore.appendDuality(duality);
      generatedDualitiesCount++;
    }

    // Aplica os fluxos de estoque acumulados
    this.dualityManager.applyStockFlows(this.resourceRepo);

    return {
      enterprise,
      importedPartnersCount,
      importedInvoicesCount,
      generatedDualitiesCount
    };
  }
}
