import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  DominioLayout19Engine, 
  DominioLayout19File 
} from '../packages/interop-dominio/src/layouts/layout19';
import { 
  DominioLayout3Engine, 
  DominioParticipanteRecord 
} from '../packages/interop-dominio/src/layouts/layout3';
import { AcumuladorMappingEngine } from '../packages/interop-dominio/src/acumulador/acumulador-engine';
import { DominioDataImporter } from '../packages/interop-dominio/src/importer';
import { DominioDataExporter } from '../packages/interop-dominio/src/exporter';
import { AgentRepository, createEnterpriseAgent, createSupplierAgent, createTaxAuthorityAgent } from '../packages/core-rea/src/agents';
import { ResourceRepository } from '../packages/core-rea/src/resources';
import { DualityManager } from '../packages/core-rea/src/duality';
import { REAEventStore } from '../packages/core-rea/src/event-store';

describe('Domínio Sistemas Interoperability Engine', () => {
  test('Layout 19 Generator produces valid structure and Parser recovers fields', () => {
    const originalFile: DominioLayout19File = {
      header: {
        tipoRegistro: '01',
        codigoEmpresa: 1,
        cnpjEmpresa: '12345678000195',
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
          inscricaoParceiro: '98765432000109',
          codigoEspecie: '0000055',
          exclusaoDief: '00',
          codigoAcumulador: 1,
          cfop: '1102',
          unidade: '01',
          numeroDocumento: '1050',
          serie: '1',
          dataEntradaSaida: '10/03/2026',
          dataEmissao: '10/03/2026',
          valorContabil: 1500.00,
          baseICMS: 1500.00,
          aliquotaICMS: 18.00,
          valorICMS: 270.00,
          isentasICMS: 0,
          outrasICMS: 0,
          valorIPI: 0,
          aliquotaIPI: 0,
          chaveAcesso: '15260398765432000109550010000010501234567890'
        }
      ],
      totalRegistros: 1
    };

    const txt = DominioLayout19Engine.generate(originalFile);
    assert.ok(txt.startsWith('0100000011234567800019501/03/202631/03/2026N0200000119'));
    assert.ok(txt.includes('990000003')); // 1 header + 1 detail + 1 trailer = 3

    const parsed = DominioLayout19Engine.parse(txt);
    assert.strictEqual(parsed.header.codigoEmpresa, 1);
    assert.strictEqual(parsed.header.tipoNota, '02');
    assert.strictEqual(parsed.details.length, 1);
    assert.strictEqual(parsed.details[0].numeroDocumento, '1050');
    assert.strictEqual(parsed.details[0].valorContabil, 1500.00);
    assert.strictEqual(parsed.details[0].baseICMS, 1500.00);
    assert.strictEqual(parsed.details[0].aliquotaICMS, 18.00);
    assert.strictEqual(parsed.details[0].valorICMS, 270.00);
    assert.strictEqual(parsed.details[0].chaveAcesso, '15260398765432000109550010000010501234567890');
    assert.strictEqual(parsed.details[0].codigoAcumulador, 1);
    assert.strictEqual(parsed.details[0].cfop, '1102');
  });

  test('Layout 3 Generator produces 224-column fixed text and Parser parses records', () => {
    const participantes: DominioParticipanteRecord[] = [
      {
        tipoRegistro: '11',
        codigoEmpresa: 1,
        uf: 'PA',
        codigoMunicipioIbge: '1501402',
        nomeReduzido: 'FORNECEDOR',
        razaoSocial: 'Fornecedor Distribuidora Paraense Ltda',
        endereco: 'Av Presidente Vargas',
        numero: '500',
        cep: '66000000',
        documento: '98765432000109',
        optanteSimples: 'S'
      },
      {
        tipoRegistro: '22',
        codigoEmpresa: 1,
        uf: 'PA',
        codigoMunicipioIbge: '1501402',
        nomeReduzido: 'CLIENTE',
        razaoSocial: 'Comercio e Varejo Belem Ltda',
        endereco: 'Travessa Castelo Branco',
        numero: '120',
        cep: '66060170',
        documento: '11222333000144',
        optanteSimples: 'S'
      }
    ];

    const txt = DominioLayout3Engine.generate(participantes);
    const lines = txt.split(/\r?\n/).filter(Boolean);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].length, 224); // Exatamente 224 posições conforme layout Domínio
    assert.strictEqual(lines[1].length, 224);

    const parsed = DominioLayout3Engine.parse(txt);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].tipoRegistro, '11');
    assert.strictEqual(parsed[0].razaoSocial, 'Fornecedor Distribuidora Paraense Ltda');
    assert.strictEqual(parsed[1].tipoRegistro, '22');
    assert.strictEqual(parsed[1].razaoSocial, 'Comercio e Varejo Belem Ltda');
  });

  test('AcumuladorMappingEngine maps Domínio Acumuladores to REA dualities', () => {
    const engine = new AcumuladorMappingEngine();
    const agentRepo = new AgentRepository();
    const resourceRepo = new ResourceRepository();

    const enterprise = agentRepo.register(createEnterpriseAgent({
      code: '1',
      name: 'Empresa Teste',
      document: '12345678000195',
      state: 'PA'
    }));

    const supplier = agentRepo.register(createSupplierAgent({
      name: 'Fornecedor Teste',
      document: '98765432000109',
      state: 'PA'
    }));

    const taxAuth = agentRepo.register(createTaxAuthorityAgent({
      jurisdiction: 'ESTADUAL',
      state: 'PA'
    }));

    // Teste Acumulador 1 (Compra Mercadoria Revenda com crédito ICMS)
    const invoiceEntrada = {
      tipoRegistro: '02' as const,
      sequencial: 1,
      codigoEmpresa: 1,
      inscricaoParceiro: '98765432000109',
      codigoEspecie: '0000055',
      exclusaoDief: '00',
      codigoAcumulador: 1,
      cfop: '1102',
      unidade: '01',
      numeroDocumento: '2001',
      serie: '1',
      dataEntradaSaida: '05/03/2026',
      dataEmissao: '05/03/2026',
      valorContabil: 1000.00,
      baseICMS: 1000.00,
      aliquotaICMS: 18.00,
      valorICMS: 180.00,
      isentasICMS: 0,
      outrasICMS: 0,
      valorIPI: 0,
      aliquotaIPI: 0
    };

    const duality = engine.mapInvoiceToREADuality(
      invoiceEntrada,
      enterprise,
      supplier,
      taxAuth,
      resourceRepo
    );

    assert.ok(duality);
    assert.strictEqual(duality.incrementEvents.length, 2); // 1 goods + 1 tax credit
    assert.strictEqual(duality.decrementEvents.length, 1); // 1 financial payable claim
    
    // Total increment: Mercadoria líquida (820) + ICMS crédito (180) = 1000
    const incVal = duality.incrementEvents.reduce((s, e) => s + e.stockFlows.reduce((fs, f) => fs + f.totalValue, 0), 0);
    const decVal = duality.decrementEvents.reduce((s, e) => s + e.stockFlows.reduce((fs, f) => fs + f.totalValue, 0), 0);
    assert.strictEqual(incVal, 1000.00);
    assert.strictEqual(decVal, 1000.00);
  });

  test('DominioDataImporter and Exporter roundtrip completes successfully', () => {
    const agentRepo = new AgentRepository();
    const resourceRepo = new ResourceRepository();
    const dualityMgr = new DualityManager();
    const eventStore = new REAEventStore();

    const importer = new DominioDataImporter(agentRepo, resourceRepo, dualityMgr, eventStore);

    const sampleLayout3 = 
      '110000001PA00000001501402FORNECEDORFornecedor Alpha Distribuidora Ltda     Rua dos Mundurucus                      0000100                              6600000098765432000109                    91988887777                 NS\r\n' +
      '220000001PA00000001501402CLIENTE   Cliente Beta Comercio Varejista Ltda    Av Nazare                               0000250                              6600000011222333000144                    91988886666                 NS';

    const sampleLayout19 = DominioLayout19Engine.generate({
      header: {
        tipoRegistro: '01',
        codigoEmpresa: 1,
        cnpjEmpresa: '12345678000195',
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
          inscricaoParceiro: '98765432000109',
          codigoEspecie: '0000055',
          exclusaoDief: '00',
          codigoAcumulador: 1,
          cfop: '1102',
          unidade: '01',
          numeroDocumento: '5501',
          serie: '1',
          dataEntradaSaida: '02/03/2026',
          dataEmissao: '02/03/2026',
          valorContabil: 2000.00,
          baseICMS: 2000.00,
          aliquotaICMS: 18.00,
          valorICMS: 360.00,
          isentasICMS: 0,
          outrasICMS: 0,
          valorIPI: 0,
          aliquotaIPI: 0
        }
      ],
      totalRegistros: 1
    });

    const result = importer.importFromLayoutTexts(sampleLayout3, sampleLayout19);
    assert.strictEqual(result.importedPartnersCount, 2);
    assert.strictEqual(result.importedInvoicesCount, 1);
    assert.strictEqual(result.generatedDualitiesCount, 1);

    // Agora exporta de volta
    const exportedLayout3 = DominioDataExporter.exportLayout3(agentRepo.getAll(), { codigoEmpresa: 1 });
    assert.ok(exportedLayout3.includes('98765432000109'));
    assert.ok(exportedLayout3.includes('11222333000144'));

    const exportedLayout19 = DominioDataExporter.exportLayout19(dualityMgr.getAll(), result.enterprise, { tipoNotas: '02' });
    assert.ok(exportedLayout19.startsWith('01000000112345678000195'));
    assert.ok(exportedLayout19.includes('020000001000000198765432000109'));
  });
});
