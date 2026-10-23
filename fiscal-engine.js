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
    const cnpjLimpo = String(cnpjEmpresa).replace(/\D/g, '');
    if (!cnpjLimpo) return 'DESCONHECIDO';
    
    const emitCnpj = String(nota.emitente?.cnpj || nota.emitente?.cpf || '').replace(/\D/g, '');
    const destCnpj = String(nota.destinatario?.cnpj || nota.destinatario?.cpf || '').replace(/\D/g, '');

    // Verifica se a empresa é emitente (mesmo CNPJ ou mesma raiz de 8 dígitos para filiais)
    const isEmitente = emitCnpj && (emitCnpj === cnpjLimpo || (cnpjLimpo.length >= 8 && emitCnpj.slice(0, 8) === cnpjLimpo.slice(0, 8)));
    const isDestinatario = destCnpj && (destCnpj === cnpjLimpo || (cnpjLimpo.length >= 8 && destCnpj.slice(0, 8) === cnpjLimpo.slice(0, 8)));

    if (isEmitente) {
        // Se a nota foi emitida com tpNF == '0' (entrada própria), trata-se de ENTRADA
        if (nota.tpNF === '0' || nota.tpNF === 0) {
            return 'ENTRADA';
        }
        return 'SAIDA';
    }

    if (isDestinatario) {
        return 'ENTRADA';
    }

    if (nota.direcao === 'ENTRADA' || nota.direcao === 'SAIDA') {
        return nota.direcao;
    }
    
    return 'DESCONHECIDO';
}

let DominioLayout19Engine = null;
let DominioLayout3Engine = null;
try {
    const interop = require('./dist/packages/interop-dominio/src');
    DominioLayout19Engine = interop.DominioLayout19Engine;
    DominioLayout3Engine = interop.DominioLayout3Engine;
} catch (e) {
    console.warn('[FiscalEngine] Interop Domínio dist não carregado:', e.message);
}

/**
 * Espelha o CFOP para operações de compra
 * Regras estritas da SEFAZ e Domínio Sistemas:
 * - 5405 (Venda de mercadoria recebida com ST) DEVE converter para 1403 (Compra com ST). 1405 não existe na SEFAZ.
 * - 6405 -> 2403
 * - 5102 -> 1102, 6102 -> 2102, 5556 -> 1556, 6556 -> 2556
 * @param {string|number} cfopOrigem CFOP original
 * @returns {string} CFOP espelhado
 */
function converterCFOP(cfopOrigem) {
    if (!cfopOrigem) return null;
    const cfopStr = String(cfopOrigem).replace(/\D/g, '');
    if (cfopStr.length !== 4) return cfopStr;
    
    // Mapeamento especial de regras fiscais brasileiras (SEFAZ / Domínio Sistemas)
    const mapaEspecial = {
        '5401': '1403',
        '5402': '1403',
        '5403': '1403',
        '5405': '1403', // Compra para comercialização com ST (1405 NÃO existe)
        '5408': '1403',
        '5409': '1403',
        '5410': '1403',
        '5411': '1411', // Devolução
        '6401': '2403',
        '6402': '2403',
        '6403': '2403',
        '6404': '2403',
        '6405': '2403', // Compra interestadual com ST (2405 NÃO existe)
        '6411': '2411',
        '5101': '1101',
        '5102': '1102',
        '6101': '2101',
        '6102': '2102',
        '5551': '1551',
        '6551': '2551',
        '5556': '1556',
        '6556': '2556',
        '5201': '1201',
        '5202': '1202',
        '6201': '2201',
        '6202': '2202',
        '5949': '1949',
        '6949': '2949',
        '5910': '1910',
        '6910': '2910'
    };

    if (mapaEspecial[cfopStr]) {
        return mapaEspecial[cfopStr];
    }

    const primeiro = cfopStr[0];
    let novoPrimeiro = primeiro;
    
    if (primeiro === '5') novoPrimeiro = '1';
    else if (primeiro === '6') novoPrimeiro = '2';
    else if (primeiro === '7') novoPrimeiro = '3';
    
    let resultado = novoPrimeiro + cfopStr.substring(1);
    if (resultado === '1405') resultado = '1403';
    if (resultado === '2405') resultado = '2403';
    return resultado;
}

/**
 * Calcula imposto do Simples Nacional de forma simplificada
 * @param {number} receita12meses Faturamento dos últimos 12 meses
 * @param {number} valorNota Valor total da nota
 * @param {number} anexo Número do anexo (1 a 5)
 * @returns {Object} Dados do cálculo e valor do DAS
 */
function calcularImpostoSimples(receita12meses, valorNota, anexo = 1) {
    const anexoNum = parseInt(anexo, 10) || 1;
    const rbt12 = Math.max(0, parseFloat(receita12meses) || 0);
    const baseNota = Math.max(0, parseFloat(valorNota) || 0);

    // Tabelas Oficiais da Lei Complementar 123/2006
    const tabelas = {
        // Anexo I - Comércio
        1: [
            { limite: 180000, aliq: 0.040, ded: 0 },
            { limite: 360000, aliq: 0.073, ded: 5940 },
            { limite: 720000, aliq: 0.095, ded: 13860 },
            { limite: 1800000, aliq: 0.107, ded: 22500 },
            { limite: 3600000, aliq: 0.143, ded: 87300 },
            { limite: 4800000, aliq: 0.190, ded: 378000 }
        ],
        // Anexo II - Indústria
        2: [
            { limite: 180000, aliq: 0.045, ded: 0 },
            { limite: 360000, aliq: 0.078, ded: 5940 },
            { limite: 720000, aliq: 0.100, ded: 13860 },
            { limite: 1800000, aliq: 0.112, ded: 22500 },
            { limite: 3600000, aliq: 0.147, ded: 85500 },
            { limite: 4800000, aliq: 0.300, ded: 720000 }
        ],
        // Anexo III - Serviços (Geral, Manutenção, Reparos, Contabilidade)
        3: [
            { limite: 180000, aliq: 0.060, ded: 0 },
            { limite: 360000, aliq: 0.112, ded: 9360 },
            { limite: 720000, aliq: 0.135, ded: 17640 },
            { limite: 1800000, aliq: 0.160, ded: 35640 },
            { limite: 3600000, aliq: 0.210, ded: 125640 },
            { limite: 4800000, aliq: 0.330, ded: 648000 }
        ],
        // Anexo IV - Serviços (Vigilância, Obras, Limpeza, Advocacia)
        4: [
            { limite: 180000, aliq: 0.045, ded: 0 },
            { limite: 360000, aliq: 0.090, ded: 8100 },
            { limite: 720000, aliq: 0.102, ded: 12420 },
            { limite: 1800000, aliq: 0.140, ded: 39780 },
            { limite: 3600000, aliq: 0.220, ded: 183780 },
            { limite: 4800000, aliq: 0.330, ded: 828000 }
        ],
        // Anexo V - Serviços Fator R (TI, Engenharia, Consultoria, Auditoria)
        5: [
            { limite: 180000, aliq: 0.155, ded: 0 },
            { limite: 360000, aliq: 0.180, ded: 4500 },
            { limite: 720000, aliq: 0.195, ded: 9900 },
            { limite: 1800000, aliq: 0.205, ded: 17100 },
            { limite: 3600000, aliq: 0.230, ded: 62100 },
            { limite: 4800000, aliq: 0.305, ded: 540000 }
        ]
    };

    const faixas = tabelas[anexoNum] || tabelas[1];
    let faixa = faixas[0];
    for (const f of faixas) {
        if (rbt12 <= f.limite) {
            faixa = f;
            break;
        }
        faixa = f;
    }

    const aliquotaNominal = faixa.aliq;
    const parcelaDeduzir = faixa.ded;

    // Alíquota efetiva = ((RBT12 * AliqNominal) - ParcelaDeduzir) / RBT12
    let aliquotaEfetiva = rbt12 > 0 
        ? ((rbt12 * aliquotaNominal) - parcelaDeduzir) / rbt12 
        : aliquotaNominal;
        
    // Se faturamento até 180k, usa a alíquota da 1ª faixa
    if (rbt12 <= 180000 || aliquotaEfetiva < faixas[0].aliq) {
        aliquotaEfetiva = faixas[0].aliq;
    }

    const valorImposto = baseNota * aliquotaEfetiva;

    return {
        anexo: anexoNum,
        receita12meses: rbt12,
        aliquotaNominal: (aliquotaNominal * 100).toFixed(2) + '%',
        aliquotaEfetiva: (aliquotaEfetiva * 100).toFixed(2) + '%',
        parcelaDeduzir,
        valorBase: baseNota,
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
 * @returns {Object} Lançamento contábil com debito, credito e historico precisos
 */
function gerarLancamentoContabil(nota, contas = {}) {
    const valor = parseFloat(nota.totais?.valorNota || nota.valorTotal || 0) || 0;
    const isSaida = nota.direcao === 'SAIDA';
    
    let contaDebito = contas.debito;
    let contaCredito = contas.credito;
    let historico = '';

    if (isSaida) {
        contaDebito = contaDebito || contas.clientes || '1.1.2.01.0001 - Clientes a Receber';
        contaCredito = contaCredito || contas.receita || '3.1.1.01.0001 - Receita Bruta de Vendas';
        historico = `Venda conf NF ${nota.numero || ''} - Cliente: ${nota.destinatario?.razaoSocial || nota.destinatario?.nome || 'Consumidor'}`;
    } else {
        if (nota.tipo === 'NFSE') {
            contaDebito = contaDebito || contas.despesa || '4.1.2.01.0010 - Servicos Prestados PJ';
            contaCredito = contaCredito || contas.fornecedores || '2.1.1.01.0001 - Fornecedores a Pagar';
            historico = `Servico Tomado conf NFSe ${nota.numero || ''} - Prestador: ${nota.emitente?.razaoSocial || 'Prestador de Servicos'}`;
        } else {
            contaDebito = contaDebito || contas.estoque || '1.1.5.01.0001 - Estoque / Mercadorias';
            contaCredito = contaCredito || contas.fornecedores || '2.1.1.01.0001 - Fornecedores a Pagar';
            historico = `Compra conf NF ${nota.numero || ''} - Fornecedor: ${nota.emitente?.razaoSocial || 'Fornecedor'}`;
        }
    }

    const padDateFmt = (dt) => {
        if (!dt) return '01/01/2026';
        const s = String(dt).slice(0, 10).split('-');
        if (s.length === 3) return `${s[2]}/${s[1]}/${s[0]}`;
        return String(dt).slice(0, 10);
    };

    return {
        data: padDateFmt(nota.dataEmissao),
        dataRaw: nota.dataEmissao,
        numeroDocumento: String(nota.numero || ''),
        contaDebito,
        contaCredito,
        debito: contaDebito,
        credito: contaCredito,
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
 * Salva a nota processada no banco SQLite
 * @param {Object} nota Dados processados da nota
 */
function salvarNotaProcessada(nota) {
    // Desativado o dump síncrono em arquivo JSON de 20MB para evitar congelamento do Event Loop do Node.
    // O armazenamento persistente e atômico é gerenciado pelo SQLite (db.js).
    try {
        const db = require('./db');
        if (db && typeof db.salvarNota === 'function') {
            db.salvarNota(nota);
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Gera arquivo de texto formatado no padrão oficial Layout 19 do Domínio Sistemas
 * para importação no Módulo Escrita Fiscal (Utilitários > Importação > Importador > Notas)
 */
function gerarLayout19Notas(notas, options = {}) {
    if (!notas || notas.length === 0) return '';

    const codigoEmpresa = parseInt(options.codigoEmpresa || 1, 10) || 1;
    const cnpjEmpresa = (options.cnpjEmpresa || '00000000000000').replace(/\D/g, '').padEnd(14, '0');
    const tipoNotas = options.tipoNotas || '02';

    // Se solicitado tipoNotas específico, filtra as notas correspondentes
    let filteredNotas = [...notas];
    if (options.filtroDirecao === 'ENTRADA' || (tipoNotas === '02' && options.filtrarPorTipoNotas)) {
        filteredNotas = filteredNotas.filter(n => n.direcao !== 'SAIDA');
    } else if (options.filtroDirecao === 'SAIDA' || (tipoNotas === '03' && options.filtrarPorTipoNotas)) {
        filteredNotas = filteredNotas.filter(n => n.direcao === 'SAIDA');
    }

    if (filteredNotas.length === 0) return '';

    if (DominioLayout19Engine) {
        const datas = filteredNotas.map(n => n.dataEmissao).filter(Boolean).sort();
        const padDate = (dt) => {
            if (!dt) return '01/01/2026';
            const s = String(dt).slice(0, 10).split('-');
            if (s.length === 3) return `${s[2]}/${s[1]}/${s[0]}`;
            return String(dt).slice(0, 10);
        };
        const dataInicial = options.dataInicial ? padDate(options.dataInicial) : (datas.length > 0 ? padDate(datas[0]) : '01/01/2026');
        const dataFinal = options.dataFinal ? padDate(options.dataFinal) : (datas.length > 0 ? padDate(datas[datas.length - 1]) : '31/12/2026');

        const details = filteredNotas.map((n, idx) => {
            const isSaida = n.direcao === 'SAIDA';
            const rawParceiroDoc = isSaida ? (n.destinatario?.cnpj || n.destinatario?.cpf) : (n.emitente?.cnpj || n.emitente?.cpf);
            const parceiroDoc = String(rawParceiroDoc || '00000000000000').replace(/\D/g, '');

            let cfopRaw = (n.produtos && n.produtos[0] ? n.produtos[0].cfop : (n.cfopPrincipal || '1102'));
            cfopRaw = String(cfopRaw).replace(/\D/g, '');
            const cfopFinal = isSaida ? cfopRaw : converterCFOP(cfopRaw);

            let acumulador = 1;
            if (isSaida) {
                acumulador = parseInt(options.acumuladorVenda || 10, 10) || 10;
            } else if (cfopFinal.startsWith('1556') || cfopFinal.startsWith('2556')) {
                acumulador = parseInt(options.acumuladorUsoConsumo || 2, 10) || 2;
            } else if (n.tipo === 'NFSE') {
                acumulador = parseInt(options.acumuladorServico || 50, 10) || 50;
            } else {
                acumulador = parseInt(options.acumuladorCompra || 1, 10) || 1;
            }

            const tot = n.totais || {};
            const valorContabil = parseFloat(tot.valorNota || n.valorTotal || 0) || 0;
            const baseICMS = parseFloat(tot.baseCalculoICMS || 0) || 0;
            const valorICMS = parseFloat(tot.valorICMS || 0) || 0;
            const aliquotaICMS = tot.aliquotaICMS ? parseFloat(tot.aliquotaICMS) : (baseICMS > 0 ? (valorICMS / baseICMS * 100) : 0);
            const valorIPI = parseFloat(tot.valorIPI || 0) || 0;

            return {
                tipoRegistro: isSaida ? '03' : '02',
                sequencial: idx + 1,
                codigoEmpresa: codigoEmpresa,
                inscricaoParceiro: parceiroDoc,
                codigoEspecie: n.tipo === 'NFSE' ? '0000001' : '0000055',
                exclusaoDief: '00',
                codigoAcumulador: acumulador,
                cfop: cfopFinal,
                unidade: '01',
                numeroDocumento: String(n.numero || idx + 1),
                serie: String(n.serie || '1'),
                documentoFinal: String(n.numero || idx + 1),
                dataEntradaSaida: padDate(n.dataEmissao),
                dataEmissao: padDate(n.dataEmissao),
                valorContabil,
                baseICMS,
                aliquotaICMS,
                valorICMS,
                isentasICMS: 0,
                outrasICMS: 0,
                valorIPI,
                aliquotaIPI: 0,
                chaveAcesso: n.chave || '',
                ufParceiro: (isSaida ? n.destinatario?.uf : n.emitente?.uf) || 'PA'
            };
        });

        return DominioLayout19Engine.generate({
            header: {
                tipoRegistro: '01',
                codigoEmpresa: codigoEmpresa,
                cnpjEmpresa: cnpjEmpresa,
                dataInicial: dataInicial,
                dataFinal: dataFinal,
                fixoN: 'N',
                tipoNota: tipoNotas,
                fixo00000: '00000',
                sistema: '1',
                versao: '19'
            },
            details,
            totalRegistros: details.length
        });
    }

    // Fallback básico se dist não estiver disponível
    return '';
}

/**
 * Gera arquivo posicional no padrão oficial Layout 3 de Clientes e Fornecedores
 * do Domínio Sistemas (C:\Contabil\layout_docs\layout_RTF_6_\Lay_Out_3_Fornec_Clientes.htm)
 * Para importação em: Utilitários > Importação > Importador > Fornecedores / Clientes
 */
function gerarLayout3Participantes(notas, options = {}) {
    const codigoEmpresa = parseInt(options.codigoEmpresa || 1, 10) || 1;
    if (!notas || notas.length === 0) return '';

    if (DominioLayout3Engine) {
        const participantes = [];
        const vistos = new Set();

        notas.forEach(n => {
            const isEntrada = (n.direcao === 'ENTRADA');
            const p = isEntrada ? n.emitente : n.destinatario;
            if (!p) return;

            const doc = String(p.cnpj || p.cpf || '').replace(/\D/g, '');
            if (!doc || doc.length < 11) return;

            const tipoReg = isEntrada ? '11' : '22';
            const chaveUnica = `${tipoReg}_${doc}`;
            if (vistos.has(chaveUnica)) return;
            vistos.add(chaveUnica);

            participantes.push({
                tipoRegistro: tipoReg,
                codigoEmpresa: codigoEmpresa,
                uf: (p.uf || 'PA').toUpperCase(),
                codigoContaContabil: '0000000',
                codigoMunicipioIbge: String(p.cidadeIbge || '1501402').padStart(7, '0'),
                nomeReduzido: (p.nomeFantasia || p.razaoSocial || '').slice(0, 10),
                razaoSocial: p.razaoSocial || p.nome || '',
                endereco: p.logradouro || p.endereco || '',
                numero: String(p.numero || '0'),
                complementoBairro: p.bairro || '',
                cep: String(p.cep || '66000000').replace(/\D/g, ''),
                documento: doc,
                inscricaoEstadual: p.ie || '',
                telefone: p.telefone || '',
                fax: '',
                produtorAgropecuario: 'N',
                optanteSimples: 'S'
            });
        });

        return DominioLayout3Engine.generate(participantes, { codigoEmpresa });
    }

    return '';
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
