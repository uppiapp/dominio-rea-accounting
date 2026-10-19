/**
 * Domínio Sistemas - Layout 3 Parser and Generator (Fornecedores e Clientes)
 * Documentação Oficial: C:\Contabil\layout_docs\layout_RTF_6_\Lay_Out_3_Fornec_Clientes.htm
 * Utilitários > Importação > Importador > Fornecedores / Clientes
 */

import { padNum, padAlpha } from './layout19';

export interface DominioParticipanteRecord {
  tipoRegistro: '11' | '22'; // 11 = Fornecedor, 22 = Cliente
  codigoEmpresa: number;
  uf: string;
  codigoContaContabil?: string; // 7 numéricos (ex: 0000000)
  codigoMunicipioIbge: string;  // 7 numéricos (ex: 1501402)
  nomeReduzido: string;         // 10 posições
  razaoSocial: string;          // 40 posições
  endereco: string;             // 40 posições
  numero: string;               // 7 numéricos
  complementoBairro?: string;   // 30 posições brancos/complemento
  cep: string;                  // 8 numéricos
  documento: string;            // 14 numéricos (CNPJ / CPF)
  inscricaoEstadual?: string;   // 20 posições
  telefone?: string;            // 14 posições
  fax?: string;                 // 14 posições
  produtorAgropecuario?: 'S' | 'N';
  optanteSimples?: 'S' | 'N';
}

export class DominioLayout3Engine {
  /**
   * Gera o arquivo posicional Layout 3 do Domínio Sistemas
   */
  static generate(participantes: DominioParticipanteRecord[], options?: { codigoEmpresa?: number }): string {
    const codEmpDefault = options?.codigoEmpresa || 1;
    const lines: string[] = [];

    participantes.forEach(p => {
      const tipo = p.tipoRegistro || '11';
      const codEmp = padNum(p.codigoEmpresa || codEmpDefault, 7);
      const uf = padAlpha(p.uf || 'PA', 2).toUpperCase();
      const codConta = padNum(p.codigoContaContabil || '0', 7);
      const codMun = padNum(p.codigoMunicipioIbge || '1501402', 7);
      const nomeRed = padAlpha((p.nomeReduzido || p.razaoSocial || '').slice(0, 10), 10);
      const razao = padAlpha(p.razaoSocial || '', 40);
      const ender = padAlpha(p.endereco || '', 40);
      const num = padNum(p.numero || '0', 7);
      const compBairro = padAlpha(p.complementoBairro || '', 30);
      const cep = padNum(p.cep || '66000000', 8);
      const doc = padNum(p.documento || '', 14);
      const ie = padAlpha(p.inscricaoEstadual || '', 20);
      const fone = padAlpha(p.telefone || '', 14);
      const fax = padAlpha(p.fax || '', 14);
      const agro = p.produtorAgropecuario || 'N';
      const simples = p.optanteSimples || 'S';

      const line = 
        tipo +
        codEmp +
        uf +
        codConta +
        codMun +
        nomeRed +
        razao +
        ender +
        num +
        compBairro +
        cep +
        doc +
        ie +
        fone +
        fax +
        agro +
        simples;

      lines.push(line);
    });

    return lines.join('\r\n');
  }

  /**
   * Lê e faz o parse de linhas no Layout 3
   */
  static parse(content: string): DominioParticipanteRecord[] {
    const rawLines = content.split(/\r?\n/).filter(l => l.trim().length >= 50);
    const result: DominioParticipanteRecord[] = [];

    for (const line of rawLines) {
      const tipo = line.slice(0, 2);
      if (tipo !== '11' && tipo !== '22') continue;

      const rec: DominioParticipanteRecord = {
        tipoRegistro: tipo as '11' | '22',
        codigoEmpresa: parseInt(line.slice(2, 9), 10) || 1,
        uf: line.slice(9, 11).trim(),
        codigoContaContabil: line.slice(11, 18).trim(),
        codigoMunicipioIbge: line.slice(18, 25).trim(),
        nomeReduzido: line.slice(25, 35).trim(),
        razaoSocial: line.slice(35, 75).trim(),
        endereco: line.slice(75, 115).trim(),
        numero: line.slice(115, 122).trim(),
        complementoBairro: line.slice(122, 152).trim(),
        cep: line.slice(152, 160).trim(),
        documento: line.slice(160, 174).trim(),
        inscricaoEstadual: line.slice(174, 194).trim(),
        telefone: line.slice(194, 208).trim(),
        fax: line.slice(208, 222).trim(),
        produtorAgropecuario: (line.slice(222, 223) || 'N') as 'S' | 'N',
        optanteSimples: (line.slice(223, 224) || 'S') as 'S' | 'N'
      };

      result.push(rec);
    }

    return result;
  }
}
