import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ChartOfAccounts, AccountNature, AccountGroup } from '../packages/projection-accounting/src/chart-of-accounts';
import { AccountingProjector } from '../packages/projection-accounting/src/projector';
import { GeneralLedger } from '../packages/projection-accounting/src/ledger';
import { FinancialStatementsEngine } from '../packages/projection-accounting/src/financial-statements';
import { AgentRepository, createCustomerAgent, createEnterpriseAgent, createSupplierAgent, createTaxAuthorityAgent } from '../packages/core-rea/src/agents';
import { ResourceRepository } from '../packages/core-rea/src/resources';
import { DualityManager } from '../packages/core-rea/src/duality';
import { REAEventStore } from '../packages/core-rea/src/event-store';
import { AcumuladorMappingEngine } from '../packages/interop-dominio/src/acumulador/acumulador-engine';

describe('Projection Accounting Engine (Double-Entry from Primitive REA)', () => {
  test('ChartOfAccounts provides standard accounts and validates groups', () => {
    const chart = new ChartOfAccounts();
    const caixa = chart.getAccount('1.1.1.01');
    const fornec = chart.getAccount('2.1.1.01');
    const receita = chart.getAccount('3.1.1.01');

    assert.ok(caixa);
    assert.strictEqual(caixa.nature, AccountNature.DEBIT);
    assert.ok(fornec);
    assert.strictEqual(fornec.nature, AccountNature.CREDIT);
    assert.ok(receita);
    assert.strictEqual(receita.nature, AccountNature.CREDIT);
  });

  test('AccountingProjector preserves TotalDebit === TotalCredit for purchase and sale dualities', () => {
    const agentRepo = new AgentRepository();
    const resourceRepo = new ResourceRepository();
    const acumuladorEngine = new AcumuladorMappingEngine();
    const projector = new AccountingProjector();

    const ent = agentRepo.register(createEnterpriseAgent({ name: 'Comercial Norte', document: '12345678000195', state: 'PA' }));
    const sup = agentRepo.register(createSupplierAgent({ name: 'Industria Sul', document: '98765432000109', state: 'SP' }));
    const cust = agentRepo.register(createCustomerAgent({ name: 'Varejo Leste', document: '11222333000144', state: 'PA' }));
    const tax = agentRepo.register(createTaxAuthorityAgent({ jurisdiction: 'ESTADUAL', state: 'PA' }));

    // 1. Compra de R$ 10.000 (ICMS 18% = 1.800, Estoque Líquido = 8.200)
    const compraDuality = acumuladorEngine.mapInvoiceToREADuality(
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
        numeroDocumento: '101',
        serie: '1',
        dataEntradaSaida: '01/03/2026',
        dataEmissao: '01/03/2026',
        valorContabil: 10000.00,
        baseICMS: 10000.00,
        aliquotaICMS: 18.00,
        valorICMS: 1800.00,
        isentasICMS: 0,
        outrasICMS: 0,
        valorIPI: 0,
        aliquotaIPI: 0
      },
      ent,
      sup,
      tax,
      resourceRepo
    );

    const entryCompra = projector.projectDualityToJournalEntry(compraDuality);
    assert.strictEqual(entryCompra.isBalanced, true);
    assert.strictEqual(entryCompra.totalDebit, 10000.00);
    assert.strictEqual(entryCompra.totalCredit, 10000.00);

    // 2. Venda de R$ 15.000 (ICMS 18% = 2.700, CMV estimado 60% = 9.000)
    const vendaDuality = acumuladorEngine.mapInvoiceToREADuality(
      {
        tipoRegistro: '03',
        sequencial: 2,
        codigoEmpresa: 1,
        inscricaoParceiro: '11222333000144',
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: 10,
        cfop: '5102',
        unidade: '01',
        numeroDocumento: '201',
        serie: '1',
        dataEntradaSaida: '05/03/2026',
        dataEmissao: '05/03/2026',
        valorContabil: 15000.00,
        baseICMS: 15000.00,
        aliquotaICMS: 18.00,
        valorICMS: 2700.00,
        isentasICMS: 0,
        outrasICMS: 0,
        valorIPI: 0,
        aliquotaIPI: 0
      },
      ent,
      cust,
      tax,
      resourceRepo
    );

    const entryVenda = projector.projectDualityToJournalEntry(vendaDuality);
    assert.strictEqual(entryVenda.isBalanced, true);
    // Débitos: Clientes (15.000) + CMV (9.000) + ICMS s/ Vendas (2.700) = 26.700
    // Créditos: Receita (15.000) + Estoque (9.000) + ICMS a Recolher (2.700) = 26.700
    assert.strictEqual(entryVenda.totalDebit, 26700.00);
    assert.strictEqual(entryVenda.totalCredit, 26700.00);
  });

  test('GeneralLedger, TrialBalance, DRE and Balanço Patrimonial verify accounting equality', () => {
    const agentRepo = new AgentRepository();
    const resourceRepo = new ResourceRepository();
    const acumuladorEngine = new AcumuladorMappingEngine();
    const projector = new AccountingProjector();
    const ledger = new GeneralLedger();

    const ent = agentRepo.register(createEnterpriseAgent({ name: 'Supermercado Central', document: '12345678000195', state: 'PA' }));
    const sup = agentRepo.register(createSupplierAgent({ name: 'Atacadista Brasil', document: '98765432000109', state: 'PA' }));
    const cust = agentRepo.register(createCustomerAgent({ name: 'Consumidor Final', document: '11222333000144', state: 'PA' }));
    const tax = agentRepo.register(createTaxAuthorityAgent({ jurisdiction: 'ESTADUAL', state: 'PA' }));

    // Compra NF 1: R$ 5.000 (ICMS 18% = 900)
    const d1 = acumuladorEngine.mapInvoiceToREADuality(
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
        numeroDocumento: '10',
        serie: '1',
        dataEntradaSaida: '01/03/2026',
        dataEmissao: '01/03/2026',
        valorContabil: 5000.00,
        baseICMS: 5000.00,
        aliquotaICMS: 18.00,
        valorICMS: 900.00,
        isentasICMS: 0,
        outrasICMS: 0,
        valorIPI: 0,
        aliquotaIPI: 0
      },
      ent,
      sup,
      tax,
      resourceRepo
    );

    // Venda NF 2: R$ 8.000 (ICMS 18% = 1.440, CMV 60% = 4.800)
    const d2 = acumuladorEngine.mapInvoiceToREADuality(
      {
        tipoRegistro: '03',
        sequencial: 2,
        codigoEmpresa: 1,
        inscricaoParceiro: '11222333000144',
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: 10,
        cfop: '5102',
        unidade: '01',
        numeroDocumento: '20',
        serie: '1',
        dataEntradaSaida: '08/03/2026',
        dataEmissao: '08/03/2026',
        valorContabil: 8000.00,
        baseICMS: 8000.00,
        aliquotaICMS: 18.00,
        valorICMS: 1440.00,
        isentasICMS: 0,
        outrasICMS: 0,
        valorIPI: 0,
        aliquotaIPI: 0
      },
      ent,
      cust,
      tax,
      resourceRepo
    );

    // Carrega no Livro Diário / Razão
    const entries = [
      projector.projectDualityToJournalEntry(d1),
      projector.projectDualityToJournalEntry(d2)
    ];
    ledger.loadEntries(entries);

    // Gera Balancete de Verificação
    const trialBalance = ledger.generateTrialBalance();
    assert.strictEqual(trialBalance.isEquilibrated, true);
    assert.strictEqual(trialBalance.totalDebits, trialBalance.totalCredits);
    assert.strictEqual(trialBalance.totalClosingDebits, trialBalance.totalClosingCredits);

    // Gera DRE
    const dre = FinancialStatementsEngine.generateDRE(trialBalance);
    assert.strictEqual(dre.receitaBruta, 8000.00);
    assert.strictEqual(dre.deducoesReceita, 1440.00); // ICMS sobre Vendas
    assert.strictEqual(dre.receitaLiquida, 6560.00);
    assert.strictEqual(dre.custoMercadoriasVendidas, 4800.00);
    assert.strictEqual(dre.lucroBruto, 1760.00);
    assert.strictEqual(dre.resultadoLiquidoExercicio, 1760.00);

    // Gera Balanço Patrimonial e valida Ativo = Passivo + PL
    const balanco = FinancialStatementsEngine.generateBalancoPatrimonial(trialBalance, dre);
    assert.strictEqual(balanco.isEquilibrado, true);
    assert.strictEqual(balanco.totalAtivo, balanco.totalPassivoEPL);
  });
});
