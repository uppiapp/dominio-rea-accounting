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
 * Espelha o CFOP (Ex: 5102 Venda -> 1102 Compra)
 * @param {string|number} cfopOrigem CFOP original
 * @returns {string} CFOP espelhado
 */
function espelharCFOP(cfopOrigem) {
    if (!cfopOrigem) return null;
    const cfopStr = String(cfopOrigem).replace(/\D/g, '');
    if (cfopStr.length !== 4) return cfopStr;
    
    const primeiroDigito = cfopStr[0];
    let novoPrimeiroDigito = primeiroDigito;
    
    // Entradas espelham Saídas
    if (primeiroDigito === '5') novoPrimeiroDigito = '1';
    else if (primeiroDigito === '6') novoPrimeiroDigito = '2';
    else if (primeiroDigito === '7') novoPrimeiroDigito = '3';
    
    return novoPrimeiroDigito + cfopStr.substring(1);
}

/**
 * Lê e analisa uma string XML de Nota Fiscal
 * @param {string} xmlString Conteúdo do XML
 * @returns {Object} Dados estruturados da nota
 */
function parseNFeXML(xmlString) {
    try {
        const jsonObj = parser.parse(xmlString);
        
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
            // Simplificação para NFS-e
            dadosNFe = (jsonObj.CompNfse?.Nfse?.InfNfse) || {}; 
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

            return {
                tipo,
                chave: dadosNFe.Id ? dadosNFe.Id.replace('NFe', '') : '',
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
                    ie: emit.IE
                },
                destinatario: {
                    cnpj: dest.CNPJ,
                    cpf: dest.CPF,
                    razaoSocial: dest.xNome,
                    nomeFantasia: dest.xFant,
                    uf: dest.enderDest?.UF,
                    cidade: dest.enderDest?.xMun,
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
        } else {
            // Retorno genérico para NFS-e e CT-e (simplificado)
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
