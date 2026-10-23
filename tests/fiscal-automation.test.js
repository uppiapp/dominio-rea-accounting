const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fiscalEngine = require('../fiscal-engine');
const nfeParser = require('../nfe-parser');
const db = require('../db');
const reaProcessHandler = require('../api/process');

describe('Fiscal Automation & Domínio Interop Comprehensive Test Suite', () => {

  test('CFOP Converter fixes invalid SEFAZ CFOPs and maps accurately', () => {
    // 5405 must convert to 1403 (compra com ST), NOT 1405 (which does not exist in SEFAZ)
    assert.strictEqual(fiscalEngine.converterCFOP('5405'), '1403');
    assert.strictEqual(fiscalEngine.converterCFOP('6405'), '2403');
    assert.strictEqual(fiscalEngine.converterCFOP('5401'), '1403');
    assert.strictEqual(fiscalEngine.converterCFOP('5403'), '1403');
    assert.strictEqual(fiscalEngine.converterCFOP('6401'), '2403');
    assert.strictEqual(fiscalEngine.converterCFOP('6403'), '2403');

    // Standard commercialization and consumption CFOPs
    assert.strictEqual(fiscalEngine.converterCFOP('5102'), '1102');
    assert.strictEqual(fiscalEngine.converterCFOP('6102'), '2102');
    assert.strictEqual(fiscalEngine.converterCFOP('5101'), '1101');
    assert.strictEqual(fiscalEngine.converterCFOP('6101'), '2101');
    assert.strictEqual(fiscalEngine.converterCFOP('5556'), '1556');
    assert.strictEqual(fiscalEngine.converterCFOP('6556'), '2556');
    assert.strictEqual(fiscalEngine.converterCFOP('5551'), '1551');
    assert.strictEqual(fiscalEngine.converterCFOP('6551'), '2551');
    assert.strictEqual(fiscalEngine.converterCFOP('5949'), '1949');
    assert.strictEqual(fiscalEngine.converterCFOP('6949'), '2949');

    // Test nfe-parser CFOP converter logic
    const dummyXml = `<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe15260100000000000000550010000000011000000010">
          <ide><nNF>1</nNF><serie>1</serie><dhEmi>2026-03-10T10:00:00-03:00</dhEmi></ide>
          <emit><CNPJ>11111111000111</CNPJ><xNome>Fornecedor ST</xNome></emit>
          <dest><CNPJ>22222222000122</CNPJ><xNome>Cliente Dest</xNome></dest>
          <det nItem="1">
            <prod><cProd>001</cProd><xProd>Produto ST</xProd><CFOP>5405</CFOP><vProd>100.00</vProd></prod>
          </det>
          <total><ICMSTot><vNF>100.00</vNF></ICMSTot></total>
        </infNFe>
      </NFe>
    </nfeProc>`;

    const parsedNota = nfeParser.parseNFeXML(dummyXml);
    assert.ok(parsedNota);
    assert.strictEqual(parsedNota.produtos[0].cfop, 5405);
    assert.strictEqual(parsedNota.produtos[0].cfopConvertido, '1403');
  });

  test('SQLite db.js strictly isolates client notes and prevents cross-client contamination', () => {
    const cnpjA = '11111111000111';
    const cnpjB = '22222222000122';

    const notaA = {
      chave: 'TEST_CHV_CLIENTE_A_001',
      numero: '1001',
      serie: '1',
      dataEmissao: '2026-03-01',
      direcao: 'SAIDA',
      emitente: { cnpj: cnpjA, razaoSocial: 'Empresa A' },
      destinatario: { cnpj: '99999999000199', razaoSocial: 'Comprador X' },
      totais: { valorNota: 5000, valorICMS: 900 }
    };

    const notaB = {
      chave: 'TEST_CHV_CLIENTE_B_001',
      numero: '2001',
      serie: '1',
      dataEmissao: '2026-03-02',
      direcao: 'ENTRADA',
      emitente: { cnpj: '88888888000188', razaoSocial: 'Fornecedor Y' },
      destinatario: { cnpj: cnpjB, razaoSocial: 'Empresa B' },
      totais: { valorNota: 3000, valorICMS: 540 }
    };

    db.salvarNota(notaA);
    db.salvarNota(notaB);

    const notasClienteA = db.obterNotasPorCliente(cnpjA);
    assert.ok(notasClienteA.length >= 1);
    assert.ok(notasClienteA.some(n => n.chave === 'TEST_CHV_CLIENTE_A_001'));
    // Must NOT contain notes from client B
    assert.ok(!notasClienteA.some(n => n.chave === 'TEST_CHV_CLIENTE_B_001'));

    const notasClienteB = db.obterNotasPorCliente(cnpjB);
    assert.ok(notasClienteB.length >= 1);
    assert.ok(notasClienteB.some(n => n.chave === 'TEST_CHV_CLIENTE_B_001'));
    // Must NOT contain notes from client A
    assert.ok(!notasClienteB.some(n => n.chave === 'TEST_CHV_CLIENTE_A_001'));
  });

  test('Official Domínio Layout 19 and Layout 3 generation adheres to fixed-position specs', () => {
    const mockNotas = [
      {
        chave: '15260311111111000111550010000010011234567890',
        numero: '1001',
        serie: '1',
        dataEmissao: '2026-03-05',
        direcao: 'ENTRADA',
        emitente: { cnpj: '99999999000199', razaoSocial: 'Fornecedor Alpha', uf: 'PA', cidadeIbge: '1501402' },
        destinatario: { cnpj: '11111111000111', razaoSocial: 'Empresa Teste', uf: 'PA' },
        produtos: [{ cfop: '5405' }],
        totais: { valorNota: 1250.50, baseCalculoICMS: 1250.50, aliquotaICMS: 18.00, valorICMS: 225.09 }
      },
      {
        chave: '15260311111111000111550010000010021234567891',
        numero: '1002',
        serie: '1',
        dataEmissao: '2026-03-12',
        direcao: 'SAIDA',
        emitente: { cnpj: '11111111000111', razaoSocial: 'Empresa Teste', uf: 'PA' },
        destinatario: { cnpj: '88888888000188', razaoSocial: 'Cliente Beta', uf: 'PA', cidadeIbge: '1501402' },
        produtos: [{ cfop: '5102' }],
        totais: { valorNota: 4500.00, baseCalculoICMS: 4500.00, aliquotaICMS: 18.00, valorICMS: 810.00 }
      }
    ];

    const layout19 = fiscalEngine.gerarLayout19Notas(mockNotas, {
      codigoEmpresa: 5,
      cnpjEmpresa: '11111111000111',
      tipoNotas: '02'
    });

    assert.ok(layout19.length > 0);
    const lines19 = layout19.split('\r\n').filter(Boolean);
    assert.strictEqual(lines19.length, 4); // 1 header (01) + 2 details (02, 03) + 1 trailer (99)
    assert.ok(lines19[0].startsWith('01000000511111111000111'));
    assert.ok(lines19[1].startsWith('02')); // Entrada is record 02
    assert.ok(lines19[2].startsWith('03')); // Saida is record 03
    assert.ok(lines19[3].startsWith('99')); // Trailer is record 99

    const layout3 = fiscalEngine.gerarLayout3Participantes(mockNotas, {
      codigoEmpresa: 5
    });

    assert.ok(layout3.length > 0);
    const lines3 = layout3.split('\r\n').filter(Boolean);
    assert.strictEqual(lines3.length, 2);
    // Every line in Layout 3 must be exactly 224 characters
    for (const l of lines3) {
      assert.strictEqual(l.length, 224, `Line must be exactly 224 chars: ${l.length}`);
    }
    assert.ok(lines3.some(l => l.startsWith('11'))); // Fornecedor
    assert.ok(lines3.some(l => l.startsWith('22'))); // Cliente
  });

  test('REA process handler reads real invoices from SQLite and computes financial projection', async () => {
    let capturedStatus = 200;
    let capturedJson = null;

    const mockReq = {
      method: 'POST',
      body: {
        company: {
          code: '5',
          name: 'Empresa Teste Automação Ltda',
          document: '11.111.111/0001-11',
          state: 'PA'
        }
      },
      query: {}
    };

    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        capturedStatus = code;
        return {
          json: (data) => { capturedJson = data; },
          end: () => {}
        };
      },
      json: (data) => { capturedJson = data; }
    };

    await reaProcessHandler(mockReq, mockRes);

    assert.strictEqual(capturedStatus, 200);
    assert.ok(capturedJson);
    assert.strictEqual(capturedJson.success, true);
    assert.strictEqual(capturedJson.standard, 'ISO/IEC 15944-4 (REA Ontology)');
    assert.ok(Array.isArray(capturedJson.journalEntries));
    assert.ok(capturedJson.trialBalance);
    assert.ok(Array.isArray(capturedJson.trialBalance.items));
    assert.ok(capturedJson.dre);
    assert.ok(capturedJson.balancoPatrimonial);
    assert.ok(capturedJson.exportedDominio?.layout19);
    assert.ok(capturedJson.exportedDominio?.layout3);
  });

  test('Partidas Dobradas Contábeis generates accurate debit/credit accounts and never undefined', () => {
    const notaSaida = {
      numero: '5001',
      direcao: 'SAIDA',
      dataEmissao: '2026-03-15T10:00:00-03:00',
      valorTotal: 15000.00,
      destinatario: { razaoSocial: 'Cliente Alpha Ltda' }
    };

    const lancSaida = fiscalEngine.gerarLancamentoContabil(notaSaida);
    assert.ok(lancSaida.debito && !lancSaida.debito.includes('undefined'));
    assert.ok(lancSaida.credito && !lancSaida.credito.includes('undefined'));
    assert.ok(lancSaida.debito.includes('Clientes a Receber'));
    assert.ok(lancSaida.credito.includes('Receita Bruta de Vendas'));
    assert.strictEqual(lancSaida.valor, 15000.00);
    assert.strictEqual(lancSaida.data, '15/03/2026');

    const notaEntrada = {
      numero: '9001',
      direcao: 'ENTRADA',
      dataEmissao: '2026-03-20',
      valorTotal: 8500.00,
      emitente: { razaoSocial: 'Fornecedor Beta SA' }
    };

    const lancEntrada = fiscalEngine.gerarLancamentoContabil(notaEntrada);
    assert.ok(lancEntrada.debito && !lancEntrada.debito.includes('undefined'));
    assert.ok(lancEntrada.credito && !lancEntrada.credito.includes('undefined'));
    assert.ok(lancEntrada.debito.includes('Estoque / Mercadorias'));
    assert.ok(lancEntrada.credito.includes('Fornecedores a Pagar'));
    assert.strictEqual(lancEntrada.valor, 8500.00);
    assert.strictEqual(lancEntrada.data, '20/03/2026');
  });

  test('Simples Nacional calculates accurate DAS across Anexos I, II, III, IV and V', () => {
    // Anexo I - Comércio (Faixa 2: 180k a 360k) -> Aliq Nom 7.30%, Ded 5940
    const calcAnexo1 = fiscalEngine.calcularImpostoSimples(360000, 10000, 1);
    assert.strictEqual(calcAnexo1.anexo, 1);
    assert.strictEqual(calcAnexo1.aliquotaNominal, '7.30%');
    assert.strictEqual(calcAnexo1.aliquotaEfetiva, '5.65%');
    assert.strictEqual(calcAnexo1.valorImpostoSimples, 565.00);

    // Anexo II - Indústria (Faixa 2) -> Aliq Nom 7.80%, Ded 5940
    const calcAnexo2 = fiscalEngine.calcularImpostoSimples(360000, 10000, 2);
    assert.strictEqual(calcAnexo2.anexo, 2);
    assert.strictEqual(calcAnexo2.aliquotaNominal, '7.80%');
    assert.strictEqual(calcAnexo2.aliquotaEfetiva, '6.15%');
    assert.strictEqual(calcAnexo2.valorImpostoSimples, 615.00);

    // Anexo III - Serviços (Faixa 1: até 180k) -> Aliq Nom 6.00%, Ded 0
    const calcAnexo3 = fiscalEngine.calcularImpostoSimples(120000, 10000, 3);
    assert.strictEqual(calcAnexo3.anexo, 3);
    assert.strictEqual(calcAnexo3.aliquotaNominal, '6.00%');
    assert.strictEqual(calcAnexo3.aliquotaEfetiva, '6.00%');
    assert.strictEqual(calcAnexo3.valorImpostoSimples, 600.00);

    // Anexo IV - Serviços (Faixa 1: até 180k) -> Aliq Nom 4.50%, Ded 0
    const calcAnexo4 = fiscalEngine.calcularImpostoSimples(150000, 10000, 4);
    assert.strictEqual(calcAnexo4.anexo, 4);
    assert.strictEqual(calcAnexo4.aliquotaNominal, '4.50%');
    assert.strictEqual(calcAnexo4.valorImpostoSimples, 450.00);

    // Anexo V - Serviços Fator R (Faixa 1: até 180k) -> Aliq Nom 15.50%
    const calcAnexo5 = fiscalEngine.calcularImpostoSimples(150000, 10000, 5);
    assert.strictEqual(calcAnexo5.anexo, 5);
    assert.strictEqual(calcAnexo5.aliquotaNominal, '15.50%');
    assert.strictEqual(calcAnexo5.valorImpostoSimples, 1550.00);
  });

  test('XML Parser correctly extracts full address, IBGE municipality code, tpNF and handles UTF-8 BOM', () => {
    const xmlWithBom = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe15260100000000000000550010000000011000000010">
          <ide>
            <nNF>999</nNF>
            <serie>1</serie>
            <tpNF>0</tpNF>
            <dhEmi>2026-03-10T10:00:00-03:00</dhEmi>
          </ide>
          <emit>
            <CNPJ>33333333000133</CNPJ>
            <xNome>Fornecedor Completo Ltda</xNome>
            <enderEmit>
              <xLgr>Avenida Presidente Vargas</xLgr>
              <nro>500</nro>
              <xBairro>Campina</xBairro>
              <cMun>1501402</cMun>
              <xMun>Belém</xMun>
              <UF>PA</UF>
              <CEP>66017000</CEP>
              <fone>9132221100</fone>
            </enderEmit>
          </emit>
          <dest>
            <CNPJ>44444444000144</CNPJ>
            <xNome>Cliente Destinatario SA</xNome>
            <enderDest>
              <xLgr>Rua dos Mundurucus</xLgr>
              <nro>1200</nro>
              <xBairro>Cremação</xBairro>
              <cMun>1501402</cMun>
              <xMun>Belém</xMun>
              <UF>PA</UF>
              <CEP>66033715</CEP>
            </enderDest>
          </dest>
          <det nItem="1">
            <prod><cProd>10</cProd><xProd>Serviço Técnico</xProd><CFOP>5102</CFOP><vProd>500.00</vProd></prod>
          </det>
          <total><ICMSTot><vNF>500.00</vNF></ICMSTot></total>
        </infNFe>
      </NFe>
    </nfeProc>`;

    const parsed = nfeParser.parseNFeXML(xmlWithBom);
    assert.ok(parsed);
    assert.strictEqual(parsed.tpNF, '0');
    assert.strictEqual(parsed.emitente.logradouro, 'Avenida Presidente Vargas');
    assert.strictEqual(parsed.emitente.numero, 500);
    assert.strictEqual(parsed.emitente.bairro, 'Campina');
    assert.strictEqual(parsed.emitente.cidadeIbge, '1501402');
    assert.strictEqual(parsed.emitente.cep, '66017000');
    assert.strictEqual(parsed.emitente.telefone, '9132221100');

    // Operation classification: Company is emitente, but tpNF=0 -> must be ENTRADA
    const direcao = fiscalEngine.classificarOperacao(parsed, '33333333000133');
    assert.strictEqual(direcao, 'ENTRADA', 'tpNF=0 must classify as ENTRADA even when company is emitente');
  });

});
