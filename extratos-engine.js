/**
 * extratos-engine.js
 * Motor Inteligente de Leitura de Extratos Bancários (PDF & OFX) e Conciliação Contábil Automática
 * MC Assessoria Contábil - Suporte especializado: Banpará, Caixa, Bradesco, BB, Itaú, Santander, Sicredi, Sicoob, Nubank, Inter
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const DB_EXTRATOS = path.join(__dirname, 'extratos_processados.json');

/**
 * Lê e extrai texto de arquivo PDF utilizando pdf-parse
 */
async function extrairTextoPDF(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    return textResult && textResult.text ? textResult.text : '';
  } catch (err) {
    console.error('[Extratos] Erro ao extrair texto do PDF:', err.message);
    return '';
  }
}

/**
 * Identifica o banco a partir do conteúdo do texto ou arquivo
 */
function identificarBanco(texto, nomeArquivo = '') {
  const t = (texto + ' ' + nomeArquivo).toUpperCase();
  if (t.includes('BANPAR') || t.includes('BANCO DO ESTADO DO PAR') || t.includes('037')) {
    return { codigo: '037', nome: 'Banpará', cor: '#0284c7', badge: 'bg-sky-100 text-sky-800' };
  }
  if (t.includes('BRADESCO') || t.includes('237')) {
    return { codigo: '237', nome: 'Bradesco', cor: '#dc2626', badge: 'bg-rose-100 text-rose-800' };
  }
  if (t.includes('CAIXA') || t.includes('CEF') || t.includes('104')) {
    return { codigo: '104', nome: 'Caixa Econômica', cor: '#2563eb', badge: 'bg-blue-100 text-blue-800' };
  }
  if (t.includes('BANCO DO BRASIL') || t.includes('001')) {
    return { codigo: '001', nome: 'Banco do Brasil', cor: '#eab308', badge: 'bg-amber-100 text-amber-800' };
  }
  if (t.includes('ITAU') || t.includes('ITAÚ') || t.includes('341')) {
    return { codigo: '341', nome: 'Itaú', cor: '#ea580c', badge: 'bg-orange-100 text-orange-800' };
  }
  if (t.includes('SANTANDER') || t.includes('033')) {
    return { codigo: '033', nome: 'Santander', cor: '#e11d48', badge: 'bg-rose-100 text-rose-800' };
  }
  if (t.includes('SICOOB') || t.includes('756')) {
    return { codigo: '756', nome: 'Sicoob', cor: '#059669', badge: 'bg-emerald-100 text-emerald-800' };
  }
  if (t.includes('SICREDI') || t.includes('748')) {
    return { codigo: '748', nome: 'Sicredi', cor: '#16a34a', badge: 'bg-green-100 text-green-800' };
  }
  if (t.includes('NUBANK') || t.includes('NU PAGAMENTOS') || t.includes('260')) {
    return { codigo: '260', nome: 'Nubank', cor: '#9333ea', badge: 'bg-purple-100 text-purple-800' };
  }
  if (t.includes('INTER') || t.includes('BANCO INTER') || t.includes('077')) {
    return { codigo: '077', nome: 'Banco Inter', cor: '#f97316', badge: 'bg-orange-100 text-orange-800' };
  }
  return { codigo: '999', nome: 'Outro Banco', cor: '#64748b', badge: 'bg-slate-100 text-slate-800' };
}

/**
 * Classifica a transação bancária e gera o lançamento contábil em partidas dobradas
 */
function classificarTransacao(descricao, valor, tipo) {
  const desc = (descricao || '').toUpperCase();
  const isCredito = tipo === 'CREDITO' || valor > 0;
  const absVal = Math.abs(valor);

  let categoria = 'OUTROS';
  let contaDebito = '';
  let contaCredito = '';
  let historicoPadrao = '';

  if (isCredito) {
    // ENTRADA DE RECURSOS NO BANCO (Débito em Banco)
    contaDebito = '1.1.01.02.0001 - Banco Conta Movimento';

    if (desc.includes('PIX') || desc.includes('RECEB') || desc.includes('TRANSF') || desc.includes('TED') || desc.includes('DOC') || desc.includes('CRED')) {
      categoria = 'RECEBIMENTO_CLIENTES';
      contaCredito = '1.1.02.01.0001 - Clientes / Duplicatas a Receber';
      historicoPadrao = `Vlr. ref. recebimento via Pix/TED conf. extrato bancário - ${descricao}`;
    } else if (desc.includes('DEP') || desc.includes('DINHEIRO') || desc.includes('CHQ') || desc.includes('CHEQUE')) {
      categoria = 'DEPOSITO_CAIXA';
      contaCredito = '1.1.01.01.0001 - Caixa Geral da Empresa';
      historicoPadrao = `Vlr. ref. depósito em dinheiro/cheque para conta corrente`;
    } else if (desc.includes('REND') || desc.includes('APLIC') || desc.includes('JUROS')) {
      categoria = 'RECEITA_FINANCEIRA';
      contaCredito = '3.1.03.01.0001 - Receitas Financeiras / Rendimentos s/ Aplicação';
      historicoPadrao = `Vlr. ref. rendimento de aplicação financeira no período`;
    } else if (desc.includes('RESGATE')) {
      categoria = 'RESGATE_APLICACAO';
      contaCredito = '1.1.01.03.0001 - Aplicações Financeiras de Curto Prazo';
      historicoPadrao = `Vlr. ref. resgate de aplicação financeira`;
    } else {
      categoria = 'RECEITAS_DIVERSAS';
      contaCredito = '3.1.01.01.0001 - Receitas de Vendas e Serviços';
      historicoPadrao = `Vlr. ref. entradas em conta corrente conf. extrato bancário`;
    }
  } else {
    // SAÍDA DE RECURSOS DO BANCO (Crédito em Banco)
    contaCredito = '1.1.01.02.0001 - Banco Conta Movimento';

    if (desc.includes('TARIFA') || desc.includes('TAR ') || desc.includes('CESTA') || desc.includes('MANUT') || desc.includes('PACOTE') || desc.includes('IOF') || desc.includes('ENCARG') || desc.includes('ANUIDADE')) {
      categoria = 'DESPESA_BANCARIA';
      contaDebito = '4.1.03.01.0001 - Tarifas e Despesas Bancárias';
      historicoPadrao = `Vlr. ref. tarifa de serviços bancários / manutenção de conta`;
    } else if (desc.includes('DAS') || desc.includes('SIMPLES') || desc.includes('DARF') || desc.includes('GPS') || desc.includes('FGTS') || desc.includes('TRIBUT') || desc.includes('RECEITA') || desc.includes('SEFIN') || desc.includes('TAXA')) {
      categoria = 'PAGAMENTO_IMPOSTOS';
      contaDebito = '2.1.02.01.0001 - Impostos e Contribuições a Recolher (DAS/INSS/FGTS)';
      historicoPadrao = `Vlr. ref. liquidação de guia de tributos / impostos federais/municipais`;
    } else if (desc.includes('SALARIO') || desc.includes('FOLHA') || desc.includes('ADIANT') || desc.includes('RESCIS') || desc.includes('FERIAS') || desc.includes('PRO LABORE') || desc.includes('PRO-LABORE')) {
      categoria = 'FOLHA_PAGAMENTO';
      contaDebito = '2.1.03.01.0001 - Salários e Ordenados a Pagar';
      historicoPadrao = `Vlr. ref. pagamento de salários / folha de pagamento aos funcionários`;
    } else if (desc.includes('EQUATORIAL') || desc.includes('ENERGIA') || desc.includes('LUZ') || desc.includes('COSANPA') || desc.includes('AGUA') || desc.includes('CLARO') || desc.includes('VIVO') || desc.includes('TELECOM')) {
      categoria = 'UTILIDADES_PUBLICAS';
      contaDebito = '4.1.02.01.0001 - Despesas Operacionais (Energia, Água, Telefonia)';
      historicoPadrao = `Vlr. ref. quitação de conta de consumo operacional (Água/Luz/Telefonia)`;
    } else if (desc.includes('APLIC') || desc.includes('INVEST')) {
      categoria = 'APLICACAO_FINANCEIRA';
      contaDebito = '1.1.01.03.0001 - Aplicações Financeiras de Curto Prazo';
      historicoPadrao = `Vlr. ref. aplicação financeira de recursos`;
    } else {
      categoria = 'PAGAMENTO_FORNECEDORES';
      contaDebito = '2.1.01.01.0001 - Fornecedores Nacionais a Pagar';
      historicoPadrao = `Vlr. ref. quitação de duplicatas/fornecedores via transferência/boleto - ${descricao}`;
    }
  }

  return {
    categoria,
    debito: contaDebito,
    credito: contaCredito,
    valor: absVal,
    historico: historicoPadrao
  };
}

/**
 * Parser para arquivos OFX (Open Financial Exchange)
 */
function parseOFX(conteudoOFX, nomeArquivo = '') {
  const transacoes = [];
  const bancoInfo = identificarBanco(conteudoOFX, nomeArquivo);

  // Procura blocos <STMTTRN>...</STMTTRN>
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = trnRegex.exec(conteudoOFX)) !== null) {
    const bloco = match[1];

    const getTag = (tag) => {
      const r = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
      const m = r.exec(bloco);
      return m ? m[1].trim() : '';
    };

    const trnType = getTag('TRNTYPE').toUpperCase(); // DEBIT ou CREDIT
    const dtPostedRaw = getTag('DTPOSTED'); // Formato YYYYMMDD ou YYYYMMDDHHMMSS
    const trnAmtRaw = getTag('TRNAMT').replace(',', '.');
    const valor = parseFloat(trnAmtRaw) || 0;
    const fitId = getTag('FITID');
    const memo = getTag('MEMO') || getTag('NAME') || 'Lançamento Bancário';

    // Formata data DD/MM/AAAA
    let dataFormatada = '';
    if (dtPostedRaw && dtPostedRaw.length >= 8) {
      const ano = dtPostedRaw.slice(0, 4);
      const mes = dtPostedRaw.slice(4, 6);
      const dia = dtPostedRaw.slice(6, 8);
      dataFormatada = `${dia}/${mes}/${ano}`;
    }

    const tipoOperacao = valor >= 0 ? 'CREDITO' : 'DEBITO';
    const lancamento = classificarTransacao(memo, valor, tipoOperacao);

    transacoes.push({
      id: fitId || `${dataFormatada}_${Math.random().toString(36).substr(2, 6)}`,
      data: dataFormatada,
      descricao: memo,
      tipo: tipoOperacao,
      valor: Math.abs(valor),
      valorOriginal: valor,
      banco: bancoInfo.nome,
      codigoBanco: bancoInfo.codigo,
      corBanco: bancoInfo.cor,
      badgeBanco: bancoInfo.badge,
      conciliacao: lancamento
    });
  }

  return {
    tipoArquivo: 'OFX',
    nomeArquivo,
    banco: bancoInfo,
    totalLancamentos: transacoes.length,
    entradas: transacoes.filter(t => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0),
    saidas: transacoes.filter(t => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0),
    transacoes
  };
}

/**
 * Parser para Extratos em PDF (Banpará, Bradesco, Caixa, etc.)
 */
async function parsePDF(buffer, nomeArquivo = '') {
  const texto = await extrairTextoPDF(buffer);
  const bancoInfo = identificarBanco(texto, nomeArquivo);
  const transacoes = [];

  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Regex para capturar data brasileira: DD/MM/AAAA ou DD/MM/AA
  const dateRegex = /\b(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\b/;
  // Regex para valor em Real: 1.234,56 ou 1234,56 com opcional C/D ou sinal negativo
  const valorRegex = /([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD+-])?/i;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const dateMatch = dateRegex.exec(linha);

    if (dateMatch) {
      const dataStr = dateMatch[1];
      // Verifica se a linha tem valor monetário
      const valorMatch = valorRegex.exec(linha);

      if (valorMatch) {
        let valorBruto = valorMatch[1].replace(/\s+/g, '').replace('.', '').replace(',', '.');
        let valNum = parseFloat(valorBruto) || 0;
        const indicador = (valorMatch[2] || '').toUpperCase();

        // Determinar se é débito ou crédito
        let tipo = 'DEBITO';
        if (indicador === 'C' || indicador === '+') {
          tipo = 'CREDITO';
        } else if (indicador === 'D' || indicador === '-') {
          tipo = 'DEBITO';
        } else if (valNum < 0) {
          tipo = 'DEBITO';
          valNum = Math.abs(valNum);
        } else {
          // Palavras-chave na descrição
          const descUpper = linha.toUpperCase();
          if (descUpper.includes('CRED') || descUpper.includes('RECEB') || descUpper.includes('RESGATE') || descUpper.includes('PIX REC')) {
            tipo = 'CREDITO';
          }
        }

        // Descrição da linha (limpa data e valor)
        let desc = linha
          .replace(dateMatch[0], '')
          .replace(valorMatch[0], '')
          .replace(/[\t\r\n]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (desc.length < 3) desc = 'Lançamento bancário ' + dataStr;

        // Ignora linhas de saldo anterior ou cabeçalhos
        const descUpper = desc.toUpperCase();
        if (descUpper.includes('SALDO ANTERIOR') || descUpper.includes('SALDO FINAL') || descUpper.includes('TOTAL') || descUpper.includes('EXTRATO DE CONTA')) {
          continue;
        }

        const lancamento = classificarTransacao(desc, valNum, tipo);

        transacoes.push({
          id: `${dataStr}_${i}_${Math.random().toString(36).substr(2, 5)}`,
          data: dataStr,
          descricao: desc,
          tipo,
          valor: Math.abs(valNum),
          valorOriginal: tipo === 'CREDITO' ? Math.abs(valNum) : -Math.abs(valNum),
          banco: bancoInfo.nome,
          codigoBanco: bancoInfo.codigo,
          corBanco: bancoInfo.cor,
          badgeBanco: bancoInfo.badge,
          conciliacao: lancamento
        });
      }
    }
  }

  return {
    tipoArquivo: 'PDF',
    nomeArquivo,
    banco: bancoInfo,
    totalLancamentos: transacoes.length,
    entradas: transacoes.filter(t => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0),
    saidas: transacoes.filter(t => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0),
    transacoes
  };
}

/**
 * Salva histórico de extratos processados
 */
function salvarExtratoProcessado(resultado) {
  try {
    let lista = [];
    if (fs.existsSync(DB_EXTRATOS)) {
      lista = JSON.parse(fs.readFileSync(DB_EXTRATOS, 'utf8'));
    }
    lista.unshift(resultado);
    // Limita a 100 extratos em cache
    if (lista.length > 100) lista = lista.slice(0, 100);
    fs.writeFileSync(DB_EXTRATOS, JSON.stringify(lista, null, 2), 'utf8');
  } catch (err) {
    console.error('[Extratos] Erro ao salvar histórico:', err.message);
  }
}

/**
 * Obtém todos os extratos processados salvos
 */
function obterExtratosProcessados() {
  try {
    if (fs.existsSync(DB_EXTRATOS)) {
      return JSON.parse(fs.readFileSync(DB_EXTRATOS, 'utf8'));
    }
  } catch (err) {}
  return [];
}

/**
 * Limpa o histórico de extratos
 */
function limparExtratosProcessados() {
  try {
    fs.writeFileSync(DB_EXTRATOS, '[]', 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  identificarBanco,
  classificarTransacao,
  parseOFX,
  parsePDF,
  salvarExtratoProcessado,
  obterExtratosProcessados,
  limparExtratosProcessados
};
