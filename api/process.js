const { AgentRepository } = require('../dist/packages/core-rea/src/agents');
const { ResourceRepository } = require('../dist/packages/core-rea/src/resources');
const { DualityManager } = require('../dist/packages/core-rea/src/duality');
const { REAEventStore } = require('../dist/packages/core-rea/src/event-store');
const { DominioDataImporter } = require('../dist/packages/interop-dominio/src/importer');
const { DominioDataExporter } = require('../dist/packages/interop-dominio/src/exporter');
const { DominioLayout19Engine } = require('../dist/packages/interop-dominio/src/layouts/layout19');
const { DominioLayout3Engine } = require('../dist/packages/interop-dominio/src/layouts/layout3');
const { AccountingProjector } = require('../dist/packages/projection-accounting/src/projector');
const { GeneralLedger } = require('../dist/packages/projection-accounting/src/ledger');
const { FinancialStatementsEngine } = require('../dist/packages/projection-accounting/src/financial-statements');

module.exports = async (req, res) => {
  // Configuração CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = req.body || {};
    let layout3Text = body.layout3Text;
    let layout19Text = body.layout19Text;
    const company = body.company || {
      code: '1',
      name: 'Mega Varejista do Pará Ltda',
      document: '18.493.821/0001-40',
      state: 'PA'
    };

    // Dados padrão caso chamada venha vazia (demonstração imediata)
    if (!layout3Text || !layout19Text) {
      layout3Text = DominioLayout3Engine.generate([
        {
          tipoRegistro: '11',
          codigoEmpresa: 1,
          uf: 'PA',
          codigoMunicipioIbge: '1501402',
          nomeReduzido: 'FORNECEDOR',
          razaoSocial: 'Distribuidora Paraense de Alimentos Ltda',
          tipoInscricao: '1',
          inscricaoFederal: '04825944000190'
        },
        {
          tipoRegistro: '11',
          codigoEmpresa: 1,
          uf: 'PA',
          codigoMunicipioIbge: '1501402',
          nomeReduzido: 'CLIENTE',
          razaoSocial: 'Supermercado Central de Belém Ltda',
          tipoInscricao: '1',
          inscricaoFederal: '28491823000188'
        }
      ]);

      layout19Text = DominioLayout19Engine.generate({
        header: {
          tipoRegistro: '01',
          codigoEmpresa: 1,
          cnpjEmpresa: '18493821000140',
          dataInicial: '01/03/2026',
          dataFinal: '31/03/2026',
          fixoN: 'N',
          tipoNota: '02',
          fixo00000: '00000',
          sistema: '1',
          versao: '19'
        },
        details: [
          {
            tipoRegistro: '02',
            sequencial: 1,
            codigoEmpresa: 1,
            inscricaoParceiro: '04825944000190',
            codigoEspecie: '0000055',
            exclusaoDief: '00',
            codigoAcumulador: 1,
            cfop: '1102',
            unidade: '01',
            numeroDocumento: '10045',
            serie: '1',
            dataEntradaSaida: '02/03/2026',
            dataEmissao: '02/03/2026',
            valorContabil: 50000.00,
            baseICMS: 50000.00,
            aliquotaICMS: 18.00,
            valorICMS: 9000.00,
            isentasICMS: 0,
            outrasICMS: 0,
            valorIPI: 0,
            aliquotaIPI: 0,
            chaveAcesso: '15260304825944000190550010000100451004928172'
          },
          {
            tipoRegistro: '02',
            sequencial: 2,
            codigoEmpresa: 1,
            inscricaoParceiro: '04825944000190',
            codigoEspecie: '0000055',
            exclusaoDief: '00',
            codigoAcumulador: 2,
            cfop: '1556',
            unidade: '01',
            numeroDocumento: '10080',
            serie: '1',
            dataEntradaSaida: '04/03/2026',
            dataEmissao: '04/03/2026',
            valorContabil: 3000.00,
            baseICMS: 0,
            aliquotaICMS: 0,
            valorICMS: 0,
            isentasICMS: 0,
            outrasICMS: 3000.00,
            valorIPI: 0,
            aliquotaIPI: 0,
            chaveAcesso: '15260304825944000190550010000100801992817281'
          },
          {
            tipoRegistro: '03',
            sequencial: 3,
            codigoEmpresa: 1,
            inscricaoParceiro: '28491823000188',
            codigoEspecie: '0000055',
            exclusaoDief: '00',
            codigoAcumulador: 10,
            cfop: '5102',
            unidade: '01',
            numeroDocumento: '5001',
            serie: '1',
            dataEntradaSaida: '15/03/2026',
            dataEmissao: '15/03/2026',
            valorContabil: 42000.00,
            baseICMS: 42000.00,
            aliquotaICMS: 18.00,
            valorICMS: 7560.00,
            isentasICMS: 0,
            outrasICMS: 0,
            valorIPI: 0,
            aliquotaIPI: 0,
            chaveAcesso: '15260318493821000140550010000050011982736451'
          }
        ],
        totalRegistros: 3
      });
    }

    // Instancia repositórios da Ontologia REA
    const agentRepo = new AgentRepository();
    const resourceRepo = new ResourceRepository();
    const dualityMgr = new DualityManager();
    const eventStore = new REAEventStore();

    const importer = new DominioDataImporter(agentRepo, resourceRepo, dualityMgr, eventStore);
    const importStats = importer.importFromLayoutTexts(layout3Text, layout19Text, company);

    // Projeta lançamentos contábeis
    const projector = new AccountingProjector();
    const journalEntries = projector.projectAllDualities(dualityMgr.getAll());

    // Carrega Razão e gera Balancete
    const ledger = new GeneralLedger();
    ledger.loadEntries(journalEntries);
    const trialBalance = ledger.generateTrialBalance();

    // DRE e Balanço Patrimonial
    const dre = FinancialStatementsEngine.generateDRE(trialBalance);
    const balanco = FinancialStatementsEngine.generateBalancoPatrimonial(trialBalance, dre);

    // Exportação reversa compatível com Domínio Sistemas
    const exportedLayout3 = DominioDataExporter.exportLayout3(agentRepo.getAll(), { codigoEmpresa: 1 });
    const exportedLayout19 = DominioDataExporter.exportLayout19(dualityMgr.getAll(), importStats.enterprise, { tipoNotas: '02' });

    res.status(200).json({
      success: true,
      standard: 'ISO/IEC 15944-4 (REA Ontology)',
      enterprise: importStats.enterprise,
      stats: {
        agentsCount: agentRepo.getAll().length,
        resourcesCount: resourceRepo.getAll().length,
        dualitiesCount: importStats.generatedDualitiesCount,
        eventsCount: eventStore.getAllEvents().length
      },
      agents: agentRepo.getAll(),
      resources: resourceRepo.getAll(),
      journalEntries,
      trialBalance,
      dre,
      balancoPatrimonial: balanco,
      exportedDominio: {
        layout3: exportedLayout3,
        layout19: exportedLayout19
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Erro interno ao processar ontologia REA.'
    });
  }
};
