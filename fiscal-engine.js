const fs = require('fs');
const path = require('path');

/**
 * Módulo Motor Fiscal (Fiscal Engine)
 * Sistema MC Hub Contábil
 */

const DB_PATH = path.join(__dirname, 'notas_processadas.json');

/**
 * Classifica a operação como Entrada ou Saída com base no CNPJ da empresa
 * @param {Object} nota Dados da nota fiscal
 * @param {string} cnpjEmpresa CNPJ da empresa que estamos analisando
 * @returns {string} 'ENTRADA' ou 'SAIDA'
 */
function classificarOperacao(nota, cnpjEmpresa) {
    if (!nota || !cnpjEmpresa) return 'DESCONHECIDO';
    const cnpjLimpo = cnpjEmpresa.replace(/\D/g, '');
    
    // Se a empresa é a emitente, é uma nota de SAÍDA
    if (nota.emitente && nota.emitente.cnpj === cnpjLimpo) {
        return 'SAIDA';
    }
    // Se a empresa é a destinatária, é uma nota de ENTRADA
    if (nota.destinatario && nota.destinatario.cnpj === cnpjLimpo) {
        return 'ENTRADA';
    }
    
    return 'DESCONHECIDO';
}

/**
 * Espelha o CFOP para operações de compra
 * @param {string|number} cfopOrigem CFOP original
 * @returns {string} CFOP espelhado
 */
function converterCFOP(cfopOrigem) {
    if (!cfopOrigem) return null;
    const cfopStr = String(cfopOrigem).replace(/\D/g, '');
    if (cfopStr.length !== 4) return cfopStr;
    
    const primeiro = cfopStr[0];
    let novoPrimeiro = primeiro;
    
    if (primeiro === '5') novoPrimeiro = '1';
    else if (primeiro === '6') novoPrimeiro = '2';
    else if (primeiro === '7') novoPrimeiro = '3';
    
    return novoPrimeiro + cfopStr.substring(1);
}

/**
 * Calcula imposto do Simples Nacional de forma simplificada
 * @param {number} receita12meses Faturamento dos últimos 12 meses
 * @param {number} valorNota Valor total da nota
 * @param {number} anexo Número do anexo (1 a 5)
 * @returns {Object} Dados do cálculo e valor do DAS
 */
function calcularImpostoSimples(receita12meses, valorNota, anexo = 1) {
    // Tabela simplificada de exemplo (Anexo I - Comércio)
    // Na prática seria necessário implementar todas as faixas e anexos (I a V)
    let aliquotaNominal = 0.04; // 4% base
    let parcelaDeduzir = 0;
    
    if (receita12meses > 180000 && receita12meses <= 360000) { aliquotaNominal = 0.073; parcelaDeduzir = 5940; }
    else if (receita12meses > 360000 && receita12meses <= 720000) { aliquotaNominal = 0.095; parcelaDeduzir = 13860; }
    else if (receita12meses > 720000 && receita12meses <= 1800000) { aliquotaNominal = 0.107; parcelaDeduzir = 22500; }
    else if (receita12meses > 1800000 && receita12meses <= 3600000) { aliquotaNominal = 0.143; parcelaDeduzir = 87300; }
    else if (receita12meses > 3600000) { aliquotaNominal = 0.19; parcelaDeduzir = 378000; }

    // Alíquota efetiva = ((RBT12 * AliqNominal) - ParcelaDeduzir) / RBT12
    let aliquotaEfetiva = receita12meses > 0 
        ? ((receita12meses * aliquotaNominal) - parcelaDeduzir) / receita12meses 
        : aliquotaNominal;
        
    // Proteção contra alíquota negativa
    if (aliquotaEfetiva < aliquotaNominal && receita12meses <= 180000) {
        aliquotaEfetiva = aliquotaNominal;
    }

    const valorImposto = valorNota * aliquotaEfetiva;

    return {
        anexo,
        receita12meses,
        aliquotaNominal: (aliquotaNominal * 100).toFixed(2) + '%',
        aliquotaEfetiva: (aliquotaEfetiva * 100).toFixed(2) + '%',
        parcelaDeduzir,
        valorBase: valorNota,
        valorImpostoSimples: parseFloat(valorImposto.toFixed(2))
    };
}

/**
 * Calcula impostos no Lucro Presumido
 * @param {number} valorNota Valor da receita/nota
 * @param {string} tipoServico 'SERVICO' ou 'COMERCIO'
 * @returns {Object} Detalhamento dos impostos
 */
function calcularImpostosPresumido(valorNota, tipoServico = 'COMERCIO') {
    // PIS/COFINS Cumulativo
    const aliqPIS = 0.0065; // 0.65%
    const aliqCOFINS = 0.03; // 3%
    
    // Presunção IRPJ/CSLL
    const presuncaoIRPJ = tipoServico === 'SERVICO' ? 0.32 : 0.08;
    const presuncaoCSLL = tipoServico === 'SERVICO' ? 0.32 : 0.12;
    
    const aliqIRPJ = 0.15; // 15%
    const aliqCSLL = 0.09; // 9%
    
    const baseIRPJ = valorNota * presuncaoIRPJ;
    const baseCSLL = valorNota * presuncaoCSLL;
    
    const valorPIS = valorNota * aliqPIS;
    const valorCOFINS = valorNota * aliqCOFINS;
    const valorIRPJ = baseIRPJ * aliqIRPJ; // Simplificado, sem adicional de 10%
    const valorCSLL = baseCSLL * aliqCSLL;
    
    return {
        regime: 'LUCRO_PRESUMIDO',
        baseCalculo: valorNota,
        pis: { aliquota: '0.65%', valor: parseFloat(valorPIS.toFixed(2)) },
        cofins: { aliquota: '3.00%', valor: parseFloat(valorCOFINS.toFixed(2)) },
        irpj: { presuncao: (presuncaoIRPJ * 100) + '%', baseIRPJ: parseFloat(baseIRPJ.toFixed(2)), aliquota: '15%', valor: parseFloat(valorIRPJ.toFixed(2)) },
        csll: { presuncao: (presuncaoCSLL * 100) + '%', baseCSLL: parseFloat(baseCSLL.toFixed(2)), aliquota: '9%', valor: parseFloat(valorCSLL.toFixed(2)) },
        totalImpostos: parseFloat((valorPIS + valorCOFINS + valorIRPJ + valorCSLL).toFixed(2))
    };
}

/**
 * Gera lançamento contábil (Partidas Dobradas)
 * @param {Object} nota Dados da nota fiscal
 * @param {Object} contas Contas contábeis (opcional)
 * @returns {Object} Lançamento contábil
 */
function gerarLancamentoContabil(nota, contas = {}) {
    const valor = nota.valorTotal || 0;
    const operacao = (nota.emitente && nota.destinatario) ? 'AUTOMATICO' : 'MANUAL';
    
    // Contas padrão de exemplo
    let contaDebito = contas.debito || 'Estoque / Despesa';
    let contaCredito = contas.credito || 'Fornecedores a Pagar';
    let historico = `NF ${nota.numero} - Fornecedor: ${nota.emitente?.razaoSocial || 'Desconhecido'}`;
    
    // Se fosse uma venda, inverte
    // if (operacao === 'SAIDA') {
    //    contaDebito = 'Clientes / Duplicatas a Receber';
    //    contaCredito = 'Receita de Vendas';
    //    historico = `NF ${nota.numero} - Cliente: ${nota.destinatario?.razaoSocial || 'Desconhecido'}`;
    // }

    return {
        data: nota.dataEmissao || new Date().toISOString(),
        numeroDocumento: nota.numero,
        contaDebito,
        contaCredito,
        valor,
        historico
    };
}

/**
 * Identifica uma descrição básica para o código NCM
 * @param {string} ncmCode Código NCM
 * @returns {string} Descrição simplificada
 */
function identificarNCM(ncmCode) {
    if (!ncmCode) return 'NCM Não Informado';
    
    const codigo = String(ncmCode).replace(/\D/g, '');
    const prefix = codigo.substring(0, 2);
    
    const mapaCapitulos = {
        '01': 'Animais vivos',
        '02': 'Carnes e miudezas',
        '04': 'Laticínios',
        '06': 'Plantas vivas',
        '07': 'Produtos hortícolas',
        '08': 'Frutas',
        '09': 'Café, chá, mate e especiarias',
        '10': 'Cereais',
        '11': 'Produtos da indústria de moagem',
        '19': 'Preparações à base de cereais, farinhas',
        '21': 'Preparações alimentícias diversas',
        '22': 'Bebidas, líquidos alcoólicos e vinagres',
        '30': 'Produtos farmacêuticos',
        '33': 'Óleos essenciais e resinoides; perfumaria',
        '39': 'Plásticos e suas obras',
        '48': 'Papel e cartão',
        '61': 'Vestuário e acessórios (malha)',
        '62': 'Vestuário e acessórios (exceto malha)',
        '64': 'Calçados, polainas e artefatos semelhantes',
        '84': 'Reatores nucleares, caldeiras, máquinas',
        '85': 'Máquinas, aparelhos e materiais elétricos',
        '87': 'Veículos automóveis, tratores, ciclos',
        '90': 'Instrumentos e aparelhos de óptica',
        '94': 'Móveis; mobiliário médico-cirúrgico'
    };

    return mapaCapitulos[prefix] || `Capítulo NCM ${prefix} - Outros/Desconhecido`;
}

/**
 * Salva a nota processada no arquivo JSON
 * @param {Object} nota Dados processados da nota
 */
function salvarNotaProcessada(nota) {
    let notas = [];
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            notas = JSON.parse(data);
        }
    } catch (e) {
        console.error('Erro ao ler DB:', e);
    }
    
    // Evitar duplicatas pela chave
    if (nota.chave) {
        notas = notas.filter(n => n.chave !== nota.chave);
    }
    
    notas.push(nota);
    
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(notas, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Erro ao salvar DB:', e);
        return false;
    }
}

/**
 * Gera arquivo de texto formatado no padrão oficial Layout 19 do Domínio Sistemas
 * para importação no Módulo Escrita Fiscal (Utilitários > Importação > Importador > Notas)
 */
function gerarLayout19Notas(notas, options = {}) {
    const codigoEmpresa = options.codigoEmpresa || 1;
    const cnpjEmpresa = (options.cnpjEmpresa || '00000000000000').replace(/\D/g, '').padEnd(14, '0');
    const tipoNotas = options.tipoNotas || '02'; // '02' Entradas, '03' Saídas
    
    if (!notas || notas.length === 0) return '';

    const padNum = (val, size) => String(val || 0).replace(/\D/g, '').slice(0, size).padStart(size, '0');
    const padAlpha = (val, size) => String(val || '').slice(0, size).padEnd(size, ' ');
    const padMoney = (val, size = 13) => {
        const cents = Math.round((parseFloat(val) || 0) * 100);
        return String(cents).padStart(size, '0');
    };
    const padDate = (dt) => {
        if (!dt) return '01/01/2026';
        const s = String(dt).slice(0, 10).split('-');
        if (s.length === 3) return `${s[2]}/${s[1]}/${s[0]}`;
        return String(dt).slice(0, 10);
    };

    const datas = notas.map(n => n.dataEmissao).filter(Boolean).sort();
    const dataInicial = padDate(datas[0]);
    const dataFinal = padDate(datas[datas.length - 1]);

    const linhas = [];

    // 1. REGISTRO CABEÇALHO (Tipo 01 - 54 posições)
    const cabecalho = 
        '01' +
        padNum(codigoEmpresa, 7) +
        cnpjEmpresa.slice(0, 14) +
        dataInicial +
        dataFinal +
        'N' +
        tipoNotas +
        '00000' +
        '1' +
        '19';
    linhas.push(cabecalho);

    // 2. REGISTROS DETALHE (Tipo 02 Entradas / 03 Saídas)
    notas.forEach((n, idx) => {
        const seq = padNum(idx + 1, 7);
        const codEmp = padNum(codigoEmpresa, 7);
        const rawParceiroDoc = (n.direcao === 'ENTRADA' ? n.emitente?.cnpj : (n.destinatario?.cnpj || n.destinatario?.cpf));
        const parceiroDoc = String(rawParceiroDoc || '00000000000000').replace(/\D/g, '').padEnd(14, ' ');
        const especie = '0000055'; // NF-e mod 55
        const exclusaoDief = '00';
        let cfopRaw = (n.produtos && n.produtos[0] ? n.produtos[0].cfop : (n.cfopPrincipal || '1102'));
        cfopRaw = String(cfopRaw).replace(/\D/g, '');
        const cfop = padNum(cfopRaw, 7);

        // Acumulador dinâmico conforme operação e opções configuradas
        let acumulador = '0000001';
        if (n.direcao === 'SAIDA') {
            acumulador = padNum(options.acumuladorVenda || '10', 7);
        } else if (cfopRaw.startsWith('1556') || cfopRaw.startsWith('2556')) {
            acumulador = padNum(options.acumuladorUsoConsumo || '2', 7);
        } else if (n.tipo === 'NFSE') {
            acumulador = padNum(options.acumuladorServico || '50', 7);
        } else {
            acumulador = padNum(options.acumuladorCompra || '1', 7);
        }
        
        const unidade = '01';
        const dataEmissao = padDate(n.dataEmissao);
        const dataEntradaSaida = padDate(n.dataEmissao);
        const serie = padAlpha(n.serie || '1', 6);
        const subSerie = '000000';
        const numero = padNum(n.numero || idx + 1, 10);
        
        const tot = n.totais || {};
        const vlrContabil = padMoney(tot.valorNota || n.valorTotal || 0, 13);
        const baseICMS = padMoney(tot.baseCalculoICMS || 0, 13);
        const aliqICMS = padNum(Math.round((tot.aliquotaICMS || 0) * 100), 4);
        const vlrICMS = padMoney(tot.valorICMS || 0, 13);
        const isentas = padMoney(0, 13);
        const outras = padMoney(0, 13);
        const vlrIPI = padMoney(tot.valorIPI || 0, 13);
        const aliqIPI = padNum(0, 4);
        const chaveAcesso = padAlpha(n.chave || '', 44);

        const linhaDetalhe = 
            tipoNotas +
            seq +
            codEmp +
            parceiroDoc.slice(0, 14) +
            especie +
            exclusaoDief +
            acumulador +
            cfop +
            unidade +
            dataEmissao +
            dataEntradaSaida +
            serie +
            subSerie +
            numero +
            vlrContabil +
            baseICMS +
            aliqICMS +
            vlrICMS +
            isentas +
            outras +
            vlrIPI +
            aliqIPI +
            chaveAcesso;
            
        linhas.push(linhaDetalhe);
    });

    // 3. REGISTRO FINALIZADOR (Tipo 99)
    const finalizador = '99' + padNum(linhas.length + 1, 7);
    linhas.push(finalizador);

    return linhas.join('\r\n');
}

/**
 * Gera arquivo posicional no padrão oficial Layout 3 de Clientes e Fornecedores
 * do Domínio Sistemas (C:\Contabil\layout_docs\layout_RTF_6_\Lay_Out_3_Fornec_Clientes.htm)
 * Para importação em: Utilitários > Importação > Importador > Fornecedores / Clientes
 */
function gerarLayout3Participantes(notas, options = {}) {
    const codigoEmpresa = options.codigoEmpresa || 1;
    if (!notas || notas.length === 0) return '';

    const padNum = (val, size) => String(val || 0).replace(/\D/g, '').slice(0, size).padStart(size, '0');
    const padAlpha = (val, size) => String(val || '').slice(0, size).padEnd(size, ' ');

    const linhas = [];
    const participantesVistos = new Set();

    notas.forEach(n => {
        const isEntrada = (n.direcao === 'ENTRADA');
        const p = isEntrada ? n.emitente : n.destinatario;
        if (!p) return;

        const doc = String(p.cnpj || p.cpf || '').replace(/\D/g, '');
        if (!doc || doc.length < 11) return;

        const chaveUnica = `${isEntrada ? '11' : '22'}_${doc}`;
        if (participantesVistos.has(chaveUnica)) return;
        participantesVistos.add(chaveUnica);

        const tipoReg = isEntrada ? '11' : '22';
        const codEmp = padNum(codigoEmpresa, 7);
        const uf = padAlpha(p.uf || 'PA', 2).toUpperCase();
        const codConta = '0000000';
        const codMunicipio = padNum(p.cidadeIbge || '1501402', 7);
        const nomeReduzido = padAlpha((p.nomeFantasia || p.razaoSocial || '').slice(0, 10), 10);
        const razaoSocial = padAlpha(p.razaoSocial || p.nome || '', 40);
        const endereco = padAlpha(p.logradouro || p.endereco || '', 40);
        const numero = padNum(p.numero || '0', 7);
        const brancos30 = ''.padEnd(30, ' ');
        const cep = padNum(p.cep || '66000000', 8);
        const inscricao = padNum(doc, 14);
        const inscricaoEstadual = padAlpha(p.ie || '', 20);
        const fone = padAlpha(p.telefone || '', 14);
        const fax = ''.padEnd(14, ' ');
        const agropecuario = 'N';
        const simplesNacional = 'S';

        const linha = 
            tipoReg +
            codEmp +
            uf +
            codConta +
            codMunicipio +
            nomeReduzido +
            razaoSocial +
            endereco +
            numero +
            brancos30 +
            cep +
            inscricao +
            inscricaoEstadual +
            fone +
            fax +
            agropecuario +
            simplesNacional;

        linhas.push(linha);
    });

    return linhas.join('\r\n');
}

module.exports = {
    classificarOperacao,
    calcularImpostoSimples,
    calcularImpostosPresumido,
    gerarLancamentoContabil,
    converterCFOP,
    identificarNCM,
    salvarNotaProcessada,
    gerarLayout19Notas,
    gerarLayout3Participantes
};
