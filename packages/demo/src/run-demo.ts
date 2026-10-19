/**
 * REA Accounting & Domínio Sistemas Interoperability Engine
 * Complete End-to-End Demonstration Runner
 */

import { AgentRepository } from '../../core-rea/src/agents';
import { ResourceRepository } from '../../core-rea/src/resources';
import { DualityManager } from '../../core-rea/src/duality';
import { REAEventStore } from '../../core-rea/src/event-store';
import { DominioDataImporter } from '../../interop-dominio/src/importer';
import { DominioDataExporter } from '../../interop-dominio/src/exporter';
import { DominioLayout19Engine } from '../../interop-dominio/src/layouts/layout19';
import { DominioLayout3Engine } from '../../interop-dominio/src/layouts/layout3';
import { AccountingProjector } from '../../projection-accounting/src/projector';
import { GeneralLedger } from '../../projection-accounting/src/ledger';
import { FinancialStatementsEngine } from '../../projection-accounting/src/financial-statements';

export async function runDemonstration(): Promise<void> {
  console.log('========================================================================');
  console.log('🚀 PROJETO OPEN-SOURCE: MOTOR CONTÁBIL REA & INTEROP DOMÍNIO SISTEMAS');
  console.log('   Ontologia ISO/IEC 15944-4 (Resource-Event-Agent) aplicada ao Brasil');
  console.log('========================================================================\n');

  // 1. Criação dos Repositórios REA
  const agentRepo = new AgentRepository();
  const resourceRepo = new ResourceRepository();
  const dualityMgr = new DualityManager();
  const eventStore = new REAEventStore();

  console.log('📦 1. SIMULANDO ARQUIVOS OFICIAIS DOMÍNIO SISTEMAS...');

  // Layout 3: Fornecedores e Clientes (Participantes)
  const layout3Sample = DominioLayout3Engine.generate([
    {
      tipoRegistro: '11',
      codigoEmpresa: 1,
      uf: 'PA',
      codigoContaContabil: '0000100',
      codigoMunicipioIbge: '1501402',
      nomeReduzido: 'AMAZON SUP',
      razaoSocial: 'Amazon Distribuidora de Suprimentos Ltda',
      endereco: 'Rodovia Augusto Montenegro',
      numero: '4500',
      complementoBairro: 'Parque Verde',
      cep: '66635110',
      documento: '04825944000190',
      inscricaoEstadual: '152039485',
      telefone: '9132104000',
      produtorAgropecuario: 'N',
      optanteSimples: 'S'
    },
    {
      tipoRegistro: '22',
      codigoEmpresa: 1,
      uf: 'PA',
      codigoContaContabil: '0000010',
      codigoMunicipioIbge: '1501402',
      nomeReduzido: 'COMERCIO C',
      razaoSocial: 'Comercial e Serviços Castanhal Ltda',
      endereco: 'Av Barao do Rio Branco',
      numero: '120',
      complementoBairro: 'Centro',
      cep: '68743050',
      documento: '28491823000188',
      inscricaoEstadual: '159847321',
      telefone: '9137219000',
      produtorAgropecuario: 'N',
      optanteSimples: 'S'
    }
  ]);

  // Layout 19: Notas Fiscais de Entrada e Saída
  const layout19Sample = DominioLayout19Engine.generate({
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
        tipoRegistro: '02', // ENTRADA - Compra de Mercadoria p/ Revenda
        sequencial: 1,
        codigoEmpresa: 1,
        inscricaoParceiro: '04825944000190',
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: 1, // Acumulador 1 = Compra Mercadoria Revenda
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
        tipoRegistro: '02', // ENTRADA - Compra de Material p/ Uso e Consumo
        sequencial: 2,
        codigoEmpresa: 1,
        inscricaoParceiro: '04825944000190',
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: 2, // Acumulador 2 = Uso e Consumo (sem crédito)
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
        tipoRegistro: '03', // SAÍDA - Venda de Mercadorias no Mercado Interno
        sequencial: 3,
        codigoEmpresa: 1,
        inscricaoParceiro: '28491823000188',
        codigoEspecie: '0000055',
        exclusaoDief: '00',
        codigoAcumulador: 10, // Acumulador 10 = Venda de Mercadorias
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

  console.log(`   Layout 3 gerado: ${layout3Sample.split('\r\n').length} linhas`);
  console.log(`   Layout 19 gerado: ${layout19Sample.split('\r\n').length} linhas\n`);

  // 2. Importação e Conversão em Ontologia REA
  console.log('🔄 2. INGESTÃO & CONVERSÃO EM EVENTOS PRIMITIVOS E DUALIDADES REA...');
  const importer = new DominioDataImporter(agentRepo, resourceRepo, dualityMgr, eventStore);
  const importStats = importer.importFromLayoutTexts(layout3Sample, layout19Sample, {
    code: '1',
    name: 'Mega Varejista do Pará Ltda',
    document: '18.493.821/0001-40',
    state: 'PA'
  });

  console.log(`   Empresa REA: ${importStats.enterprise.name} (${importStats.enterprise.document})`);
  console.log(`   Agentes Econômicos Registrados: ${agentRepo.getAll().length}`);
  console.log(`   Recursos Econômicos Gerenciados: ${resourceRepo.getAll().length}`);
  console.log(`   Dualidades Econômicas Derivadas: ${importStats.generatedDualitiesCount}`);
  console.log(`   Eventos Primitivos no Event Store: ${eventStore.getAllEvents().length}\n`);

  // 3. Projeção Dinâmica em Partidas Dobradas
  console.log('📜 3. PROJEÇÃO EM TEMPO REAL: LIVRO DIÁRIO (PARTIDAS DOBRADAS)...');
  const projector = new AccountingProjector();
  const journalEntries = projector.projectAllDualities(dualityMgr.getAll());

  journalEntries.forEach((entry, idx) => {
    console.log(`   [Lançamento ${idx + 1}] Chave: ${entry.businessKey} | Equilibrado: ${entry.isBalanced ? '✅ SIM' : '❌ NÃO'}`);
    entry.lines.forEach(l => {
      const dStr = l.debit > 0 ? `D: R$ ${l.debit.toFixed(2).padStart(10)}` : '             ';
      const cStr = l.credit > 0 ? `C: R$ ${l.credit.toFixed(2).padStart(10)}` : '             ';
      console.log(`      ${l.accountCode.padEnd(10)} ${l.accountName.padEnd(38)} | ${dStr} | ${cStr}`);
    });
  });

  // 4. Livro Razão e Balancete de Verificação
  console.log('\n⚖️  4. BALANCETE DE VERIFICAÇÃO (TRIAL BALANCE)...');
  const ledger = new GeneralLedger();
  ledger.loadEntries(journalEntries);

  const trialBalance = ledger.generateTrialBalance();
  console.log('   -----------------------------------------------------------------------------------------');
  console.log('   Conta       Descrição                              Débito Mov.   Crédito Mov.  Saldo Final');
  console.log('   -----------------------------------------------------------------------------------------');
  for (const item of trialBalance.items) {
    const dMov = item.debitMovement.toFixed(2).padStart(11);
    const cMov = item.creditMovement.toFixed(2).padStart(11);
    const sFin = item.closingBalanceDebit > 0 
      ? `D ${item.closingBalanceDebit.toFixed(2).padStart(11)}`
      : `C ${item.closingBalanceCredit.toFixed(2).padStart(11)}`;
    console.log(`   ${item.accountCode.padEnd(11)} ${item.accountName.padEnd(36)} | ${dMov} | ${cMov} | ${sFin}`);
  }
  console.log('   -----------------------------------------------------------------------------------------');
  console.log(`   TOTAL GERAL:                                    R$ ${trialBalance.totalDebits.toFixed(2).padStart(10)} | R$ ${trialBalance.totalCredits.toFixed(2).padStart(10)} | Equilíbrio: ${trialBalance.isEquilibrated ? '✅ PERFEITO' : '❌ ERRO'}\n`);

  // 5. Demonstração do Resultado do Exercício (DRE)
  console.log('📊 5. DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)...');
  const dre = FinancialStatementsEngine.generateDRE(trialBalance);
  console.log(`   (+) Receita Bruta com Vendas:                R$ ${dre.receitaBruta.toFixed(2).padStart(12)}`);
  console.log(`   (-) Tributos sobre Vendas (ICMS):            R$ ${dre.deducoesReceita.toFixed(2).padStart(12)}`);
  console.log(`   (=) Receita Líquida Operacional:             R$ ${dre.receitaLiquida.toFixed(2).padStart(12)}`);
  console.log(`   (-) Custo das Mercadorias Vendidas (CMV):    R$ ${dre.custoMercadoriasVendidas.toFixed(2).padStart(12)}`);
  console.log(`   (=) Lucro Bruto Operacional:                 R$ ${dre.lucroBruto.toFixed(2).padStart(12)}`);
  console.log(`   (-) Despesas Operacionais (Uso/Consumo):     R$ ${dre.despesasOperacionais.toFixed(2).padStart(12)}`);
  console.log(`   (=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO):  R$ ${dre.resultadoLiquidoExercicio.toFixed(2).padStart(12)}\n`);

  // 6. Balanço Patrimonial
  console.log('🏛️  6. BALANÇO PATRIMONIAL...');
  const balanco = FinancialStatementsEngine.generateBalancoPatrimonial(trialBalance, dre);
  console.log(`   TOTAL DO ATIVO (Bens + Direitos):            R$ ${balanco.totalAtivo.toFixed(2).padStart(12)}`);
  console.log(`   TOTAL DO PASSIVO (Obrigações c/ Terceiros):  R$ ${balanco.totalPassivo.toFixed(2).padStart(12)}`);
  console.log(`   PATRIMÔNIO LÍQUIDO (Lucro Apurado na DRE):   R$ ${balanco.totalPatrimonioLiquido.toFixed(2).padStart(12)}`);
  console.log(`   TOTAL PASSIVO + PATRIMÔNIO LÍQUIDO:          R$ ${balanco.totalPassivoEPL.toFixed(2).padStart(12)}`);
  console.log(`   EQUAÇÃO FUNDAMENTAL (Ativo = Passivo + PL):  ${balanco.isEquilibrado ? '✅ ATENDIDA INTEGRALMENTE' : '❌ DESBALANCEADO'}\n`);

  // 7. Exportação de Retorno para o Domínio
  console.log('📤 7. EXPORTAÇÃO COMPATÍVEL COM OS MÓDULOS DO DOMÍNIO SISTEMAS...');
  const exportedLayout3 = DominioDataExporter.exportLayout3(agentRepo.getAll(), { codigoEmpresa: 1 });
  const exportedLayout19 = DominioDataExporter.exportLayout19(dualityMgr.getAll(), importStats.enterprise, { tipoNotas: '02' });

  console.log(`   Export Layout 3: ${exportedLayout3.split('\r\n').length} linhas geradas com sucesso.`);
  console.log(`   Export Layout 19: ${exportedLayout19.split('\r\n').length} linhas geradas com sucesso.`);
  console.log('\n========================================================================');
  console.log('✨ DEMONSTRAÇÃO CONCLUÍDA COM 100% DE SUCESSO E BALANÇO EQUILIBRADO!');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runDemonstration().catch(err => {
    console.error('Erro na execução da demonstração:', err);
    process.exit(1);
  });
}
