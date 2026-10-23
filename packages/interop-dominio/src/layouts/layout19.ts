/**
 * Domínio Sistemas - Layout 19 Parser and Generator
 * Documentação Oficial: C:\Contabil\layout_docs\layout_RTF_6_\Lay_Out_19_Notas.htm
 * Utilitários > Importação > Importador > Notas
 */

export interface DominioLayout19Header {
  tipoRegistro: '01';
  codigoEmpresa: number;
  cnpjEmpresa: string;
  dataInicial: string; // dd/mm/aaaa
  dataFinal: string;   // dd/mm/aaaa
  fixoN: string;       // 'N'
  tipoNota: '02' | '03' | '04' | '01' | '05'; // 02=Entradas, 03=Saídas
  fixo00000: string;   // '00000'
  sistema: string;     // '1'
  versao: string;      // '19'
}

export interface DominioLayout19Detail {
  tipoRegistro: '02' | '03'; // 02=Entrada, 03=Saída
  sequencial: number;
  codigoEmpresa: number;
  inscricaoParceiro: string; // CNPJ / CPF
  codigoEspecie: string;     // ex: '0000055' (NF-e)
  exclusaoDief: string;      // '00'
  codigoAcumulador: number;  // ex: 1, 2, 10, 50
  cfop: string;              // ex: '1102', '5102'
  unidade: string;           // '01'
  numeroDocumento: string;   // Número da Nota
  serie: string;             // Série
  documentoFinal?: string;
  dataEntradaSaida: string;  // dd/mm/aaaa
  dataEmissao: string;       // dd/mm/aaaa
  valorContabil: number;     // Em reais com 2 decimais
  baseICMS: number;
  aliquotaICMS: number;      // % com 2 decimais (ex: 18.00)
  valorICMS: number;
  isentasICMS: number;
  outrasICMS: number;
  valorIPI: number;
  aliquotaIPI: number;
  chaveAcesso?: string;      // 44 caracteres NF-e
  ufParceiro?: string;
}

export interface DominioLayout19File {
  header: DominioLayout19Header;
  details: DominioLayout19Detail[];
  totalRegistros: number;
}

// Helpers de formatação posicional Domínio
export const padNum = (val: string | number, size: number): string => {
  const clean = String(val ?? 0).replace(/\D/g, '');
  return clean.slice(-size).padStart(size, '0');
};

export const padAlpha = (val: string | undefined | null, size: number): string => {
  const clean = String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return clean.slice(0, size).padEnd(size, ' ');
};

export const padMoney = (val: number, size = 13): string => {
  const cents = Math.round((Number(val) || 0) * 100);
  return String(cents).padStart(size, '0');
};

export const parseMoney = (rawStr: string): number => {
  const clean = rawStr.trim();
  if (!clean) return 0;
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num / 100;
};

export const padDate = (dateVal: string | Date | undefined): string => {
  if (!dateVal) return '01/01/2026';
  if (dateVal instanceof Date) {
    const d = String(dateVal.getDate()).padStart(2, '0');
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const y = dateVal.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const s = String(dateVal).slice(0, 10).split('-');
  if (s.length === 3) return `${s[2]}/${s[1]}/${s[0]}`;
  return String(dateVal).slice(0, 10);
};

export class DominioLayout19Engine {
  /**
   * Gera o arquivo TXT no formato Layout 19 oficial do Domínio Sistemas
   */
  static generate(fileData: DominioLayout19File): string {
    const lines: string[] = [];

    // 1. Cabeçalho (Registro 01 - 54 posições)
    const h = fileData.header;
    const headerLine = 
      '01' +
      padNum(h.codigoEmpresa, 7) +
      padAlpha(h.cnpjEmpresa.replace(/\D/g, ''), 14) +
      padDate(h.dataInicial) +
      padDate(h.dataFinal) +
      'N' +
      (h.tipoNota || '02') +
      '00000' +
      '1' +
      '19';
    lines.push(headerLine);

    // 2. Detalhes (Registro 02 Entradas / 03 Saídas)
    fileData.details.forEach((d, idx) => {
      const tipo = d.tipoRegistro || '02';
      const seq = padNum(idx + 1, 7);
      const codEmp = padNum(d.codigoEmpresa || h.codigoEmpresa, 7);
      const parceiroDoc = padAlpha(String(d.inscricaoParceiro || '').replace(/\D/g, ''), 14);
      const especie = padNum(d.codigoEspecie || '55', 7);
      const exclusaoDief = padNum(d.exclusaoDief || '00', 2);
      const acumulador = padNum(d.codigoAcumulador || 1, 7);
      const cfop = padNum(d.cfop || '1102', 7);
      const unidade = padNum(d.unidade || '1', 2);
      const numero = padNum(d.numeroDocumento || idx + 1, 7);
      const serie = padAlpha(d.serie || '1', 7);
      const docFinal = padNum(d.documentoFinal || d.numeroDocumento || idx + 1, 7);
      const dataEntradaSaida = padDate(d.dataEntradaSaida);
      const dataEmissao = padDate(d.dataEmissao);
      const vlrContabil = padMoney(d.valorContabil, 13);
      const vlrExclusaoDief = padMoney(0, 13);
      const reservado30 = ''.padEnd(30, ' ');
      const uf = padAlpha(d.ufParceiro || 'PA', 2).toUpperCase();
      const frete = 'C';
      const emitente = tipo === '02' ? 'T' : 'P';
      const crf = 'E';
      const irrf = 'E';
      const codMunicipio = '0000000';
      const cfopExt = '0000000';
      const transfCred = '0000000';
      const brancos6_1 = ''.padEnd(6, ' ');
      const brancos6_2 = ''.padEnd(6, ' ');
      const obs = '0000000';
      const dataVisto = '          ';
      const freteVlr = padMoney(0, 13);
      const seguroVlr = padMoney(0, 13);
      const outrasDesp = padMoney(0, 13);
      const baseICMS = padMoney(d.baseICMS || 0, 13);
      const aliqICMS = padNum(Math.round((d.aliquotaICMS || 0) * 100), 4);
      const vlrICMS = padMoney(d.valorICMS || 0, 13);
      const isentasICMS = padMoney(d.isentasICMS || 0, 13);
      const outrasICMS = padMoney(d.outrasICMS || 0, 13);
      const vlrIPI = padMoney(d.valorIPI || 0, 13);
      const aliqIPI = padNum(Math.round((d.aliquotaIPI || 0) * 100), 4);
      const chaveAcesso = padAlpha(d.chaveAcesso || '', 44);

      const line = 
        tipo +
        seq +
        codEmp +
        parceiroDoc +
        especie +
        exclusaoDief +
        acumulador +
        cfop +
        unidade +
        numero +
        serie +
        docFinal +
        dataEntradaSaida +
        dataEmissao +
        vlrContabil +
        vlrExclusaoDief +
        reservado30 +
        uf +
        frete +
        emitente +
        crf +
        irrf +
        codMunicipio +
        cfopExt +
        transfCred +
        brancos6_1 +
        brancos6_2 +
        obs +
        dataVisto +
        freteVlr +
        seguroVlr +
        outrasDesp +
        baseICMS +
        aliqICMS +
        vlrICMS +
        isentasICMS +
        outrasICMS +
        vlrIPI +
        aliqIPI +
        chaveAcesso;

      lines.push(line);
    });

    // 3. Finalizador (Registro 99)
    const finalizador = '99' + padNum(lines.length + 1, 7);
    lines.push(finalizador);

    return lines.join('\r\n');
  }

  /**
   * Lê e faz o parse de um arquivo TXT Layout 19 do Domínio Sistemas
   */
  static parse(fileContent: string): DominioLayout19File {
    const rawLines = fileContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (rawLines.length === 0) {
      throw new Error('Arquivo Layout 19 vazio.');
    }

    const headerLine = rawLines[0];
    if (!headerLine.startsWith('01')) {
      throw new Error(`Cabeçalho inválido: esperava '01', obteve '${headerLine.slice(0, 2)}'`);
    }

    const header: DominioLayout19Header = {
      tipoRegistro: '01',
      codigoEmpresa: parseInt(headerLine.slice(2, 9), 10) || 1,
      cnpjEmpresa: headerLine.slice(9, 23).trim(),
      dataInicial: headerLine.slice(23, 33).trim(),
      dataFinal: headerLine.slice(33, 43).trim(),
      fixoN: headerLine.slice(43, 44),
      tipoNota: (headerLine.slice(44, 46) || '02') as DominioLayout19Header['tipoNota'],
      fixo00000: headerLine.slice(46, 51),
      sistema: headerLine.slice(51, 52),
      versao: headerLine.slice(52, 54)
    };

    const details: DominioLayout19Detail[] = [];

    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      const tipo = line.slice(0, 2);
      if (tipo === '99') {
        // Finalizador
        break;
      }
      if (tipo === '02' || tipo === '03') {
        const detail: DominioLayout19Detail = {
          tipoRegistro: tipo as '02' | '03',
          sequencial: parseInt(line.slice(2, 9), 10) || 0,
          codigoEmpresa: parseInt(line.slice(9, 16), 10) || header.codigoEmpresa,
          inscricaoParceiro: line.slice(16, 30).trim(),
          codigoEspecie: line.slice(30, 37).trim(),
          exclusaoDief: line.slice(37, 39).trim(),
          codigoAcumulador: parseInt(line.slice(39, 46), 10) || 1,
          cfop: line.slice(46, 53).replace(/^0+/, '').trim() || '1102',
          unidade: line.slice(53, 55).trim(),
          numeroDocumento: line.slice(55, 62).replace(/^0+/, '').trim() || '1',
          serie: line.slice(62, 69).trim(),
          documentoFinal: line.slice(69, 76).trim(),
          dataEntradaSaida: line.slice(76, 86).trim(),
          dataEmissao: line.slice(86, 96).trim(),
          valorContabil: parseMoney(line.slice(96, 109)),
          baseICMS: 0,
          aliquotaICMS: 0,
          valorICMS: 0,
          isentasICMS: 0,
          outrasICMS: 0,
          valorIPI: 0,
          aliquotaIPI: 0
        };

        // Extrai valores tributários e chave de acesso alinhados exatamente com o gerador (Posições 208+)
        if (line.length >= 277) {
          detail.baseICMS = parseMoney(line.slice(247, 260));
          detail.aliquotaICMS = (parseInt(line.slice(260, 264), 10) || 0) / 100;
          detail.valorICMS = parseMoney(line.slice(264, 277));
        }
        if (line.length >= 303) {
          detail.isentasICMS = parseMoney(line.slice(277, 290));
          detail.outrasICMS = parseMoney(line.slice(290, 303));
        }
        if (line.length >= 320) {
          detail.valorIPI = parseMoney(line.slice(303, 316));
          detail.aliquotaIPI = (parseInt(line.slice(316, 320), 10) || 0) / 100;
        }
        if (line.length >= 364) {
          detail.chaveAcesso = line.slice(320, 364).trim();
        }

        details.push(detail);
      }
    }

    return {
      header,
      details,
      totalRegistros: details.length
    };
  }
}
