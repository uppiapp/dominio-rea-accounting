const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

/**
 * Módulo para parse de notas fiscais (NF-e, NFS-e, CT-e) em XML
 * Sistema MC Hub Contábil
 */

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    textNodeName: '_text',
    trimValues: true,
    cdataPropName: '__cdata'
});

/**
 * Espelha o CFOP para a ótica do destinatário/comprador (SEFAZ e Domínio Sistemas)
 * @param {string|number} cfopOrigem CFOP original
 * @returns {string} CFOP espelhado
 */
function espelharCFOP(cfopOrigem) {
    if (!cfopOrigem) return null;
    const cfopStr = String(cfopOrigem).replace(/\D/g, '');
    if (cfopStr.length !== 4) return cfopStr;
    
    // Mapeamento especial de regras fiscais brasileiras (SEFAZ / Domínio Sistemas)
    const mapaEspecial = {
        '5401': '1403',
        '5402': '1403',
        '5403': '1403',
        '5405': '1403', // Compra para comercialização com ST (1405 NÃO existe na SEFAZ)
        '5408': '1403',
        '5409': '1403',
        '5410': '1403',
        '5411': '1411', // Devolução
        '6401': '2403',
        '6402': '2403',
        '6403': '2403',
        '6404': '2403',
        '6405': '2403', // Compra interestadual com ST (2405 NÃO existe na SEFAZ)
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

    const primeiroDigito = cfopStr[0];
    let novoPrimeiroDigito = primeiroDigito;
    
    // Entradas espelham Saídas
    if (primeiroDigito === '5') novoPrimeiroDigito = '1';
    else if (primeiroDigito === '6') novoPrimeiroDigito = '2';
    else if (primeiroDigito === '7') novoPrimeiroDigito = '3';
    
    let resultado = novoPrimeiroDigito + cfopStr.substring(1);
    if (resultado === '1405') resultado = '1403';
    if (resultado === '2405') resultado = '2403';
    return resultado;
}

/**
 * Lê e analisa uma string XML de Nota Fiscal
 * @param {string} xmlString Conteúdo do XML
 * @returns {Object} Dados estruturados da nota
 */
function parseNFeXML(xmlString) {
    try {
        if (!xmlString) return null;
        // Remove BOM se presente
        const cleanXml = typeof xmlString === 'string' ? xmlString.replace(/^\uFEFF/, '') : xmlString;
        const jsonObj = parser.parse(cleanXml);
        
        // Identificar o tipo de documento
        let tipo = 'DESCONHECIDO';
        let dadosNFe = null;
        
        if (jsonObj.nfeProc && jsonObj.nfeProc.NFe) {
            tipo = 'NFE';
            dadosNFe = jsonObj.nfeProc.NFe.infNFe;
        } else if (jsonObj.NFe && jsonObj.NFe.infNFe) {
            tipo = 'NFE';
            dadosNFe = jsonObj.NFe.infNFe;
        } else if (jsonObj.CompNfse || jsonObj.ConsultarNfseResposta) {
            tipo = 'NFSE';
            dadosNFe = (jsonObj.CompNfse?.Nfse?.InfNfse) || (jsonObj.ConsultarNfseResposta?.ListaNfse?.CompNfse?.Nfse?.InfNfse) || {}; 
        } else if (jsonObj.cteProc || jsonObj.CTe) {
            tipo = 'CTE';
            dadosNFe = (jsonObj.cteProc?.CTe?.infCte) || jsonObj.CTe?.infCte || {};
        }

        if (!dadosNFe) {
            throw new Error('Formato XML não reconhecido ou suportado');
        }

        // Parse específico para NF-e (Modelo 55 ou 65)
        if (tipo === 'NFE') {
            const ide = dadosNFe.ide || {};
            const emit = dadosNFe.emit || {};
            const dest = dadosNFe.dest || {};
            const total = dadosNFe.total?.ICMSTot || {};
            const tpNF = ide.tpNF !== undefined ? String(ide.tpNF) : undefined;
            let det = dadosNFe.det || [];
            if (!Array.isArray(det)) det = [det];
            
            const produtos = det.map(item => {
                const prod = item.prod || {};
                const imposto = item.imposto || {};
                
                const icmsKey = Object.keys(imposto.ICMS || {})[0];
                const icms = imposto.ICMS ? imposto.ICMS[icmsKey] : {};
                
                const pisKey = Object.keys(imposto.PIS || {})[0];
                const pis = imposto.PIS ? imposto.PIS[pisKey] : {};
                
                const cofinsKey = Object.keys(imposto.COFINS || {})[0];
                const cofins = imposto.COFINS ? imposto.COFINS[cofinsKey] : {};
                
                const ipiKey = Object.keys(imposto.IPI || {}).find(k => k.startsWith('IPINT') || k.startsWith('IPITrib'));
                const ipi = imposto.IPI && ipiKey ? imposto.IPI[ipiKey] : {};

                return {
                    codigo: prod.cProd,
                    descricao: prod.xProd,
                    ncm: prod.NCM,
                    cfop: prod.CFOP,
                    cfopConvertido: espelharCFOP(prod.CFOP),
                    unidade: prod.uCom,
                    quantidade: parseFloat(prod.qCom || 0),
                    valorUnitario: parseFloat(prod.vUnCom || 0),
                    valorTotal: parseFloat(prod.vProd || 0),
                    icms: { cst: icms.CST || icms.CSOSN, baseCalculo: parseFloat(icms.vBC || 0), aliquota: parseFloat(icms.pICMS || 0), valor: parseFloat(icms.vICMS || 0) },
                    pis: { cst: pis.CST, baseCalculo: parseFloat(pis.vBC || 0), aliquota: parseFloat(pis.pPIS || 0), valor: parseFloat(pis.vPIS || 0) },
                    cofins: { cst: cofins.CST, baseCalculo: parseFloat(cofins.vBC || 0), aliquota: parseFloat(cofins.pCOFINS || 0), valor: parseFloat(cofins.vCOFINS || 0) },
                    ipi: { cst: ipi.CST, baseCalculo: parseFloat(ipi.vBC || 0), aliquota: parseFloat(ipi.pIPI || 0), valor: parseFloat(ipi.vIPI || 0) }
                };
            });

            let chave = dadosNFe.Id ? String(dadosNFe.Id).replace(/^(NFe|CTe|nfe)/i, '') : '';
            if (!chave && jsonObj.nfeProc?.protNFe?.infProt?.chNFe) {
                chave = String(jsonObj.nfeProc.protNFe.infProt.chNFe);
            }

            return {
                tipo,
                tpNF,
                chave,
                numero: ide.nNF,
                serie: ide.serie,
                dataEmissao: ide.dhEmi || ide.dEmi,
                valorTotal: parseFloat(total.vNF || 0),
                emitente: {
                    cnpj: emit.CNPJ,
                    cpf: emit.CPF,
                    razaoSocial: emit.xNome,
                    nomeFantasia: emit.xFant,
                    uf: emit.enderEmit?.UF,
                    cidade: emit.enderEmit?.xMun,
                    cidadeIbge: emit.enderEmit?.cMun ? String(emit.enderEmit.cMun) : undefined,
                    logradouro: emit.enderEmit?.xLgr || emit.enderEmit?.endereco,
                    numero: emit.enderEmit?.nro,
                    bairro: emit.enderEmit?.xBairro,
                    cep: emit.enderEmit?.CEP ? String(emit.enderEmit.CEP).replace(/\D/g, '') : undefined,
                    telefone: emit.enderEmit?.fone ? String(emit.enderEmit.fone) : undefined,
                    ie: emit.IE
                },
                destinatario: {
                    cnpj: dest.CNPJ,
                    cpf: dest.CPF,
                    razaoSocial: dest.xNome,
                    nomeFantasia: dest.xFant,
                    uf: dest.enderDest?.UF,
                    cidade: dest.enderDest?.xMun,
                    cidadeIbge: dest.enderDest?.cMun ? String(dest.enderDest.cMun) : undefined,
                    logradouro: dest.enderDest?.xLgr || dest.enderDest?.endereco,
                    numero: dest.enderDest?.nro,
                    bairro: dest.enderDest?.xBairro,
                    cep: dest.enderDest?.CEP ? String(dest.enderDest.CEP).replace(/\D/g, '') : undefined,
                    telefone: dest.enderDest?.fone ? String(dest.enderDest.fone) : undefined,
                    ie: dest.IE
                },
                produtos,
                totais: {
                    baseCalculoICMS: parseFloat(total.vBC || 0),
                    valorICMS: parseFloat(total.vICMS || 0),
                    valorProdutos: parseFloat(total.vProd || 0),
                    valorFrete: parseFloat(total.vFrete || 0),
                    valorSeguro: parseFloat(total.vSeg || 0),
                    valorDesconto: parseFloat(total.vDesc || 0),
                    valorOutras: parseFloat(total.vOutro || 0),
                    valorIPI: parseFloat(total.vIPI || 0),
                    valorPIS: parseFloat(total.vPIS || 0),
                    valorCOFINS: parseFloat(total.vCOFINS || 0),
                    valorNota: parseFloat(total.vNF || 0)
                },
                informacoesAdicionais: dadosNFe.infAdic?.infCpl || ''
            };
        } else if (tipo === 'CTE') {
            const ide = dadosNFe.ide || {};
            const emit = dadosNFe.emit || {};
            const dest = dadosNFe.dest || dadosNFe.rem || {};
            const vPrest = dadosNFe.vPrest || {};
            const vTPrest = parseFloat(vPrest.vTPrest || dadosNFe.vTPrest || 0) || 0;
            const chave = dadosNFe.Id ? String(dadosNFe.Id).replace(/^(CTe|cte)/i, '') : (jsonObj.cteProc?.protCTe?.infProt?.chCTe || '');

            return {
                tipo,
                tpNF: '0', // CT-e tomado é entrada de serviço de transporte
                chave,
                numero: ide.nCT || dadosNFe.Numero || '',
                serie: ide.serie || '1',
                dataEmissao: ide.dhEmi || ide.dEmi,
                valorTotal: vTPrest,
                emitente: {
                    cnpj: emit.CNPJ,
                    cpf: emit.CPF,
                    razaoSocial: emit.xNome,
                    nomeFantasia: emit.xFant,
                    uf: emit.enderEmit?.UF,
                    cidade: emit.enderEmit?.xMun,
                    cidadeIbge: emit.enderEmit?.cMun ? String(emit.enderEmit.cMun) : undefined,
                    logradouro: emit.enderEmit?.xLgr,
                    numero: emit.enderEmit?.nro,
                    bairro: emit.enderEmit?.xBairro,
                    cep: emit.enderEmit?.CEP ? String(emit.enderEmit.CEP).replace(/\D/g, '') : undefined,
                    telefone: emit.enderEmit?.fone,
                    ie: emit.IE
                },
                destinatario: {
                    cnpj: dest.CNPJ,
                    cpf: dest.CPF,
                    razaoSocial: dest.xNome,
                    nomeFantasia: dest.xFant,
                    uf: dest.enderDest?.UF || dest.enderReme?.UF,
                    cidade: dest.enderDest?.xMun || dest.enderReme?.xMun,
                    cidadeIbge: (dest.enderDest?.cMun || dest.enderReme?.cMun) ? String(dest.enderDest?.cMun || dest.enderReme?.cMun) : undefined,
                    logradouro: dest.enderDest?.xLgr || dest.enderReme?.xLgr,
                    numero: dest.enderDest?.nro || dest.enderReme?.nro,
                    bairro: dest.enderDest?.xBairro || dest.enderReme?.xBairro,
                    cep: (dest.enderDest?.CEP || dest.enderReme?.CEP) ? String(dest.enderDest?.CEP || dest.enderReme?.CEP).replace(/\D/g, '') : undefined,
                    telefone: dest.enderDest?.fone || dest.enderReme?.fone,
                    ie: dest.IE
                },
                produtos: [],
                totais: {
                    baseCalculoICMS: parseFloat(vPrest.Comp?.find?.(c => c.xNome === 'ICMS')?.vComp || 0),
                    valorICMS: 0,
                    valorProdutos: vTPrest,
                    valorNota: vTPrest
                },
                informacoesAdicionais: dadosNFe.compl?.xObs || ''
            };
        } else if (tipo === 'NFSE') {
            const vServ = parseFloat(dadosNFe.ValoresNfse?.ValorServicos || dadosNFe.Servico?.Valores?.ValorServicos || dadosNFe.ValorServicos || 0) || 0;
            const prest = dadosNFe.PrestadorServico || dadosNFe.Prestador || {};
            const prestId = prest.IdentificacaoPrestador || {};
            const tomad = dadosNFe.TomadorServico || dadosNFe.Tomador || {};
            const tomadId = tomad.IdentificacaoTomador || {};

            return {
                tipo,
                tpNF: '0',
                chave: dadosNFe.Id || dadosNFe.Numero || '',
                numero: dadosNFe.Numero || dadosNFe.IdentificacaoNfse?.Numero || '',
                serie: dadosNFe.Serie || '1',
                dataEmissao: dadosNFe.DataEmissao || dadosNFe.DataEmissaoRps,
                valorTotal: vServ,
                emitente: {
                    cnpj: prestId.CpfCnpj?.Cnpj || prestId.Cnpj || prest.Cnpj,
                    cpf: prestId.CpfCnpj?.Cpf || prestId.Cpf,
                    razaoSocial: prest.RazaoSocial || prest.NomeFantasia,
                    uf: prest.Endereco?.Uf,
                    cidade: prest.Endereco?.Cidade,
                    cidadeIbge: prest.Endereco?.CodigoMunicipio ? String(prest.Endereco.CodigoMunicipio) : undefined,
                    logradouro: prest.Endereco?.Endereco,
                    numero: prest.Endereco?.Numero,
                    bairro: prest.Endereco?.Bairro,
                    cep: prest.Endereco?.Cep ? String(prest.Endereco.Cep).replace(/\D/g, '') : undefined
                },
                destinatario: {
                    cnpj: tomadId.CpfCnpj?.Cnpj || tomadId.Cnpj || tomad.Cnpj,
                    cpf: tomadId.CpfCnpj?.Cpf || tomadId.Cpf,
                    razaoSocial: tomad.RazaoSocial,
                    uf: tomad.Endereco?.Uf,
                    cidade: tomad.Endereco?.Cidade,
                    cidadeIbge: tomad.Endereco?.CodigoMunicipio ? String(tomad.Endereco.CodigoMunicipio) : undefined,
                    logradouro: tomad.Endereco?.Endereco,
                    numero: tomad.Endereco?.Numero,
                    bairro: tomad.Endereco?.Bairro,
                    cep: tomad.Endereco?.Cep ? String(tomad.Endereco.Cep).replace(/\D/g, '') : undefined
                },
                produtos: [],
                totais: {
                    valorNota: vServ,
                    valorServicos: vServ,
                    valorISS: parseFloat(dadosNFe.ValoresNfse?.ValorIss || dadosNFe.Servico?.Valores?.ValorIss || 0)
                },
                informacoesAdicionais: dadosNFe.OutrasInformacoes || ''
            };
        } else {
            return {
                tipo,
                chave: dadosNFe.Id || '',
                numero: dadosNFe.Numero || dadosNFe.ide?.nCT || '',
                valorTotal: 0,
                emitente: {},
                destinatario: {},
                produtos: [],
                totais: {},
                informacoesAdicionais: ''
            };
        }
        
    } catch (error) {
        console.error('Erro ao fazer parse do XML:', error);
        return null;
    }
}

/**
 * Lê e analisa um arquivo XML de Nota Fiscal
 * @param {string} filePath Caminho do arquivo XML
 * @returns {Object} Dados estruturados da nota
 */
function parseNFeFile(filePath) {
    try {
        // Assume UTF-8 por padrão, mas poderia tentar tratar ISO-8859-1 se necessário
        const xmlString = fs.readFileSync(filePath, 'utf8');
        return parseNFeXML(xmlString);
    } catch (error) {
        console.error(`Erro ao ler o arquivo ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Analisa múltiplos arquivos/strings XML
 * @param {string[]} arrayOfXmlStrings Array de strings contendo XMLs
 * @returns {Object[]} Array de notas processadas
 */
function parseBatchXML(arrayOfXmlStrings) {
    return arrayOfXmlStrings.map(xml => parseNFeXML(xml)).filter(Boolean);
}

module.exports = {
    parseNFeXML,
    parseNFeFile,
    parseBatchXML,
    espelharCFOP
};
