const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
let PDFParse;
try {
  const p = require('pdf-parse');
  PDFParse = p.PDFParse || p;
} catch(e) {}

let BASE_PATH = fs.existsSync('X:\\') ? 'X:\\' : '//192.168.15.2/mc assessoria contabil';

function getBasePath() {
  return BASE_PATH;
}

function setBasePath(newPath) {
  if (newPath) {
    let clean = String(newPath).trim();
    if (fs.existsSync(clean)) {
      BASE_PATH = clean;
      return true;
    }
  }
  return false;
}

// Arquivo de persistência de status customizado de clientes (Ativa / Ex-Cliente / Paralisada)
const OVERRIDES_FILE = path.join(__dirname, 'client_overrides.json');

function loadClientOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function saveClientOverrides(overrides) {
  try {
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2), 'utf8');
  } catch(e) {}
}

// Definições de Regimes e Pastas Principais
const REGIMES = [
  { key: 'SIMPLES_NACIONAL', label: 'Simples Nacional', folder: '4-SIMPLES NACIONAL', color: '#10b981', active: true, isCore: true },
  { key: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido', folder: '5-LUCRO PRESUMIDO', color: '#3b82f6', active: true, isCore: true },
  { key: 'LUCRO_REAL', label: 'Lucro Real', folder: '6-LUCRO REAL', color: '#6366f1', active: true, isCore: true },
  { key: 'MEI', label: 'MEI', folder: '2-MEI', color: '#f59e0b', active: false, isCore: false },
  { key: 'CNO', label: 'CNO / Obras', folder: '1-CNO', color: '#8b5cf6', active: false, isCore: false },
  { key: 'DOMESTICO', label: 'Doméstico', folder: '3-DOMÉSTICO', color: '#ec4899', active: false, isCore: false },
  { key: 'PARALISADOS', label: 'Serviços Paralisados', folder: 'SERVIÇOS PARALISADOS', color: '#ef4444', active: false, isCore: false },
  { key: 'EXTRAS', label: 'Serviços Extras', folder: 'SERVIÇOS EXTRAS', color: '#64748b', active: false, isCore: false }
];

// Estrutura padrão de pastas para cada regime
const STANDARD_STRUCTURE = {
  DEFAULT: {
    'CONTÁBIL': [
      'BALANÇO',
      'EXTRATOS BANCARIOS',
      'FATURAMENTO',
      'MOVIMENTO DO CAIXA E BANCO'
    ],
    'FISCAL': [
      'DCTF',
      'FATURAMENTO',
      'ISS',
      'NOTAS FISCAIS',
      'PARCELAMENTOS',
      'SIMPLES NACIONAL',
      'SITUAÇÃO FISCAL'
    ],
    'PESSOAL': [
      'DECLARAÇÕES',
      'FOLHA DE PAGAMENTO',
      'ADMISSÕES',
      'RESCISÕES'
    ],
    'LEGALIZAÇÃO': [
      'BOMBEIRO',
      'CERTIDAO',
      'CERTIFICADO',
      'CONTRATO',
      'DOCUMENTO SÓCIO',
      'JUCEPA',
      'PREFEITURA'
    ]
  },
  MEI: {
    'CERTIFICADOS': [],
    'DECLARAÇÃO ANUAL MEI': [],
    'DOCUMENTOS DO SÓCIO': [],
    'FATURAMENTO E NOTAS': [],
    'LEGALIZAÇÃO': [],
    'PARCELAMENTOS': []
  }
};

const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{14}\b/;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b/;

function cleanName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCNPJ(val) {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return val;
}

function normalizeTerm(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function tokenize(str) {
  if (!str) return [];
  const stop = ['LTDA', 'EIRELI', 'ME', 'EPP', 'CIA', 'COMERCIO', 'COM', 'SERVICOS', 'SERVICO', 'SERV', 'FILIAL', 'MATRIZ', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EMPRESA', 'ASSESSORIA'];
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stop.includes(t));
}

function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function readWb(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return XLSX.read(buf, { type: 'buffer' });
  } catch(e) {
    return null;
  }
}

function normalizeCity(mRaw, uRaw) {
  let m = (mRaw || '').trim();
  let u = (uRaw || 'PA').trim();
  if (m.includes('\n')) m = m.split('\n')[0].trim();

  const upper = (m + ' ' + u).toUpperCase();
  if (upper.includes('CASTANHAL')) { m = 'Castanhal'; u = 'PA'; }
  else if (upper.includes('BELEM') || upper.includes('BELÉM')) { m = 'Belém'; u = 'PA'; }
  else if (upper.includes('ANANINDEUA')) { m = 'Ananindeua'; u = 'PA'; }
  else if (upper.includes('BUJARU')) { m = 'Bujaru'; u = 'PA'; }
  else if (upper.includes('BENEVIDES')) { m = 'Benevides'; u = 'PA'; }
  else if (upper.includes('PEDRO DA ALDEIA')) { m = 'São Pedro da Aldeia'; u = 'RJ'; }
  else if (upper.includes('JUNDIA')) { m = 'Jundiaí'; u = 'SP'; }
  else if (upper.includes('CANAA') || upper.includes('CANAÃ')) { m = 'Canaã dos Carajás'; u = 'PA'; }
  else if (upper.includes('PARAUAPEBAS')) { m = 'Parauapebas'; u = 'PA'; }
  else if (upper.includes('ITUPIRANGA')) { m = 'Itupiranga'; u = 'PA'; }
  else if (upper.includes('ODIVELAS')) { m = 'São Caetano de Odivelas'; u = 'PA'; }
  else if (upper.includes('OBIDOS') || upper.includes('ÓBIDOS')) { m = 'Óbidos'; u = 'PA'; }
  else if (upper.includes('MARITUBA')) { m = 'Marituba'; u = 'PA'; }
  else if (upper.includes('CUIABA') || upper.includes('CUIABÁ')) { m = 'Cuiabá'; u = 'MT'; }
  else if (upper.includes('TAUA') || upper.includes('TAUÁ')) { m = 'Santo Antônio do Tauá'; u = 'PA'; }
  else if (upper.includes('SANTA MARIA')) { m = 'Santa Maria do Pará'; u = 'PA'; }
  else if (upper.includes('SAO FRANCISCO') || upper.includes('SÃO FRANCISCO')) { m = 'São Francisco do Pará'; u = 'PA'; }
  else if (upper.includes('DISPENSA') || upper.includes('BALDEZ') || upper.includes('CBS')) {
    m = 'Castanhal'; u = 'PA';
  } else if (!m || m.trim() === '') {
    m = 'Castanhal'; u = 'PA';
  }

  return { cidade: m, uf: u, formatted: `${m}/${u}` };
}

class AccountingScanner {
  constructor() {
    this.cache = {
      clients: [],
      stats: {},
      spreadsheets: {
        relacao: [],
        fiscal: [],
        bombeiros: [],
        parcelamentos: [],
        renovacoes: [],
        empresasAtivas: [],
        extratos: [],
        senhas: [],
        senhasPrefeituras: [],
        senhasSefa: [],
        senhasCadEco: [],
        senhasSimples: [],
        senhasPrefSefa: [],
        senhasDiversas: []
      },
      irpf: [],
      lastScan: null,
      isScanning: false
    };
  }

  // Carrega e unifica dados de todas as planilhas da rede
  loadSpreadsheets() {
    const data = {
      relacao: [],
      fiscal: [],
      bombeiros: [],
      parcelamentos: [],
      renovacoes: [],
      empresasAtivas: [],
      extratos: [],
      senhas: [],
      senhasPrefeituras: [],
      senhasSefa: [],
      senhasCadEco: [],
      senhasSimples: [],
      senhasPrefSefa: [],
      senhasDiversas: []
    };

    // 1. Relação Oficial de Empresas
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', 'CADASTRO DE EMPRESA NOVA', 'RELAÇÃO DE EMPRESAS.xls'));
      if (wb) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        for (let i = 5; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[0]) {
            const cnpj = cleanDigits(r[7]);
            data.relacao.push({
              razao: String(r[0]).trim(),
              cnpj: cnpj.length === 14 ? cnpj : '',
              ie: r[13] ? String(r[13]).trim() : '',
              cpf: cleanDigits(r[14])
            });
          }
        }
      }
    } catch(e) {}

    // 2. 1- SENHAS.xlsx
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', '1- SENHAS.xlsx'));
      if (wb) {
        if (wb.Sheets['PREFEITURAS']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['PREFEITURAS'], { header: 1 });
          let currentCity = '';
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length === 0) continue;
            const c0 = String(r[0] || '').trim();
            if (!c0) continue;
            if (c0.includes(' - ') && (!r[1] || String(r[1]).trim() === '')) {
              currentCity = c0;
              continue;
            }
            if (['NOTA FISCAL CIDADÃ', 'ACESSO CERTIDÃO MUNICIPAL - BELÉM', 'INATIVAS'].includes(c0)) continue;
            if (c0 === 'SÃO CAETANO DE ODIVELAS') { currentCity = 'SÃO CAETANO DE ODIVELAS - PA'; continue; }
            if (c0 === 'PARAUAPEBAS') { currentCity = 'PARAUAPEBAS - PA'; continue; }

            const cnpj = cleanDigits(r[1]);
            data.senhasPrefeituras.push({
              empresa: c0,
              cnpj: cnpj.length === 14 ? cnpj : '',
              login: r[2] ? String(r[2]).trim() : '',
              senha: r[3] ? String(r[3]).trim() : '',
              cidadeUf: currentCity
            });
          }
        }

        if (wb.Sheets['SEFA']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['SEFA'], { header: 1 });
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const cnpj = cleanDigits(r[1]);
            data.senhasSefa.push({
              empresa: String(r[0]).trim(),
              cnpj: cnpj.length === 14 ? cnpj : '',
              cpf: cleanDigits(r[2]),
              senhaSefa: r[3] ? String(r[3]).trim() : '',
              senhaGov: r[4] ? String(r[4]).trim() : ''
            });
          }
        }

        if (wb.Sheets['CAD. ECO. PREF']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['CAD. ECO. PREF'], { header: 1 });
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            data.senhasCadEco.push({
              empresa: String(r[0]).trim(),
              cadImobiliario: r[1] ? String(r[1]).trim() : '',
              cadEconomico: r[2] ? String(r[2]).trim() : '',
              senhaEco: r[3] ? String(r[3]).trim() : '',
              senhaImo: r[4] ? String(r[4]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 3. SENHAS SEFA.xlsx
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', 'SENHAS SEFA.xlsx'));
      if (wb) {
        if (wb.Sheets['SENHAS SIMPLES NACIONAL E ECAC']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['SENHAS SIMPLES NACIONAL E ECAC'], { header: 1 });
          for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const cnpj = cleanDigits(r[1]);
            data.senhasSimples.push({
              empresa: String(r[0]).trim(),
              cnpj: cnpj.length === 14 ? cnpj : '',
              cpf: cleanDigits(r[2]),
              senhaSimples: r[3] ? String(r[3]).trim() : '',
              fic: r[4] ? String(r[4]).trim() : '',
              inscrMobiliaria: r[5] ? String(r[5]).trim() : '',
              area: r[6] ? String(r[6]).trim() : ''
            });
          }
        }

        if (wb.Sheets['SENHAS PREFEITURA']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['SENHAS PREFEITURA'], { header: 1 });
          let curCity = 'ANANINDEUA - PA';
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length === 0) continue;
            const c0 = String(r[0] || '').trim();
            if (/PREFEITURA DE BUJARU/i.test(c0)) { curCity = 'BUJARU - PA'; continue; }
            if (/PREFEITURA DE ANANIDEU/i.test(c0)) { curCity = 'ANANINDEUA - PA'; continue; }
            if (/PREFEITURA DE BEL/i.test(c0)) { curCity = 'BELÉM - PA'; continue; }
            if (/PREFEITURA DE CASTANHAL/i.test(c0)) { curCity = 'CASTANHAL - PA'; continue; }
            if (/EMPRESA/i.test(c0)) continue;

            if (c0) {
              data.senhasPrefSefa.push({
                empresa: c0,
                im: r[1] ? String(r[1]).trim() : '',
                senha: r[2] ? String(r[2]).trim() : '',
                cidadeUf: curCity
              });
            }
          }
        }

        if (wb.Sheets['SENHAS DIVERSAS']) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['SENHAS DIVERSAS'], { header: 1 });
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const c0 = String(r[0]).trim();
            if (/SENHAS|NOTA FISCAL|EMPRESA/i.test(c0)) continue;
            const cnpj = cleanDigits(r[1]) || (cleanDigits(c0).length === 14 ? cleanDigits(c0) : '');
            data.senhasDiversas.push({
              empresa: c0,
              cnpj: cnpj.length === 14 ? cnpj : '',
              cpf: cleanDigits(r[2]),
              ie: r[3] ? String(r[3]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 4. EMPRESAS ATIVAS.xls
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', 'ARQUIVOS DE SERVIÇOS AVULSOS', 'EMPRESAS ATIVAS.xls'));
      if (wb) {
        const sheet = wb.Sheets['NOTAS FISCAIS'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[1]) {
            const cnpj = cleanDigits(r[3]);
            data.empresasAtivas.push({
              codigo: r[0],
              razao: String(r[1]).trim(),
              norm: normalizeTerm(r[1]),
              tokens: tokenize(r[1]),
              cnpj: cnpj.length === 14 ? cnpj : '',
              status: r[4] ? String(r[4]).trim() : '',
              rotinaFiscal: r[5] ? String(r[5]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 5. CONTROLE FISCAL 2024.xls
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', 'CONTROLE FISCAL 2024.xls'));
      if (wb) {
        const sheet = wb.Sheets['ISS'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 3; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[0]) {
            const cnpj = cleanDigits(r[3]);
            data.fiscal.push({
              apelido: String(r[0]).trim(),
              situacao: r[1] ? String(r[1]).trim() : '',
              obs: r[2] ? String(r[2]).trim() : '',
              cnpj: cnpj.length === 14 ? cnpj : '',
              ie: r[4] ? String(r[4]).trim() : '',
              municipio: r[5] ? String(r[5]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 6. Renovações de Licenças
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', '3-CONTROLE DE RENOVAÇÕES - LICENÇAS.xlsx'));
      if (wb) {
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        let curReg = 'SIMPLES_NACIONAL';
        for (const r of rows) {
          if (!r || r.length === 0) continue;
          const c0 = String(r[0] || '').trim();
          if (c0.includes('SIMPLES NACIONAL')) { curReg = 'SIMPLES_NACIONAL'; continue; }
          if (c0.includes('LUCRO PRESUMIDO')) { curReg = 'LUCRO_PRESUMIDO'; continue; }
          if (c0.includes('LUCRO REAL')) { curReg = 'LUCRO_REAL'; continue; }
          if (c0 === 'EMPRESAS' || !c0) continue;
          data.renovacoes.push({
            empresa: c0,
            norm: normalizeTerm(c0),
            tokens: tokenize(c0),
            vigilancia: r[1] ? String(r[1]).trim() : '',
            prefeitura: r[2] ? String(r[2]).trim() : '',
            obs: r[3] ? String(r[3]).trim() : '',
            regime: curReg
          });
        }
      }
    } catch(e) {}

    // 7. Bombeiros
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', '4- Controle de Validade BOMBEIROS.xlsx'));
      if (wb) {
        const sheet = wb.Sheets['BOMBEIROS'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[1]) {
            const cnpj = cleanDigits(r[5]);
            data.bombeiros.push({
              codigo: r[0],
              empresa: String(r[1]).trim(),
              validade: r[2] || '',
              diasParaVencer: r[3] !== undefined ? r[3] : '',
              situacao: r[4],
              cnpjLogin: cnpj.length === 14 ? cnpj : '',
              email: r[7] ? String(r[7]).trim() : '',
              obs: r[8] ? String(r[8]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 8. Parcelamentos
    try {
      const wb = readWb(path.join(BASE_PATH, '7-PARCELAMENTOS', '6-PARCELAMENTOS.xlsx'));
      if (wb) {
        const sheet = wb.Sheets['2026'] || wb.Sheets['2025'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 2; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[0]) {
            const cnpj = cleanDigits(r[1]);
            data.parcelamentos.push({
              empresa: String(r[0]).trim(),
              cnpjCpf: cnpj.length === 14 ? cnpj : '',
              tipo: r[2] ? String(r[2]).trim() : '',
              status: r[3] ? String(r[3]).trim() : ''
            });
          }
        }
      }
    } catch(e) {}

    // 9. Extratos Bancários
    try {
      const wb = readWb(path.join(BASE_PATH, 'DIVERSOS', '5-CONTROLE DE EXTRATOS BANCÁRIOS.xlsx'));
      if (wb) {
        for (const sName of ['SIMPLES NACIONAL', 'LUCRO REAL', 'LUCRO PRESUMIDO']) {
          if (wb.Sheets[sName]) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1 });
            const headers = rows[0] || [];
            for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              if (r && r[0]) {
                const bancos = [];
                for (let col = 1; col < headers.length; col++) {
                  const h = headers[col];
                  const val = r[col];
                  if (val && String(val).trim() !== '' && h !== 'E-MAIL') {
                    bancos.push({ banco: h, status: String(val).trim() });
                  }
                }
                data.extratos.push({
                  empresa: String(r[0]).trim(),
                  norm: normalizeTerm(r[0]),
                  tokens: tokenize(r[0]),
                  regime: sName,
                  bancos,
                  email: r[headers.indexOf('E-MAIL')] || ''
                });
              }
            }
          }
        }
      }
    } catch(e) {}

    this.cache.spreadsheets = data;
    return data;
  }

  matchLicenca(folderName) {
    if (!this.cache.spreadsheets.renovacoes) return null;
    const normFolder = normalizeTerm(folderName);
    const folderTokens = tokenize(folderName);
    for (const r of this.cache.spreadsheets.renovacoes) {
      if (normFolder.includes(r.norm) || r.norm.includes(normFolder)) return r;
    }
    for (const r of this.cache.spreadsheets.renovacoes) {
      if (r.tokens && r.tokens.length > 0) {
        if (r.tokens.every(t => folderTokens.includes(t) || normFolder.includes(t))) return r;
      }
    }
    return null;
  }

  matchAtiva(folderName) {
    if (!this.cache.spreadsheets.empresasAtivas) return null;
    const normFolder = normalizeTerm(folderName);
    const folderTokens = tokenize(folderName);
    for (const ea of this.cache.spreadsheets.empresasAtivas) {
      if (normFolder.includes(ea.norm) || ea.norm.includes(normFolder)) return ea;
    }
    for (const ea of this.cache.spreadsheets.empresasAtivas) {
      if (ea.tokens && ea.tokens.length > 0) {
        if (ea.tokens.every(t => folderTokens.includes(t) || normFolder.includes(t))) return ea;
      }
    }
    return null;
  }

  matchExtrato(folderName) {
    if (!this.cache.spreadsheets.extratos) return null;
    const normFolder = normalizeTerm(folderName);
    const folderTokens = tokenize(folderName);
    for (const ex of this.cache.spreadsheets.extratos) {
      if (normFolder.includes(ex.norm) || ex.norm.includes(normFolder)) return ex;
    }
    return null;
  }

  // Cruzamento universal de metadados em todas as planilhas
  matchMetadata(folderName) {
    const res = {
      cnpj: '',
      ie: '',
      cpf: '',
      razaoOficial: '',
      apelido: '',
      municipio: '',
      uf: '',
      inscrMobiliaria: '',
      inscrImobiliaria: '',
      cadEconomico: '',
      rotinaFiscal: '',
      vigilancia: '',
      bombeiroValidade: '',
      email: '',
      origens: []
    };

    const sp = this.cache.spreadsheets;
    if (!sp) return res;

    const matchItem = (target, cand) => {
      if (!target || !cand) return false;
      const n1 = normalizeTerm(target);
      const n2 = normalizeTerm(cand);
      if (!n1 || !n2) return false;
      if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
      const t1 = tokenize(target);
      const t2 = tokenize(cand);
      if (t1.length >= 2 && t2.length >= 2) {
        const common = t1.filter(t => t2.includes(t));
        if (common.length >= 2 && common.length >= Math.min(t1.length, t2.length) * 0.6) return true;
      }
      return false;
    };

    // 1. Relação
    for (const r of (sp.relacao || [])) {
      if (matchItem(folderName, r.razao)) {
        if (!res.cnpj && r.cnpj) res.cnpj = r.cnpj;
        if (!res.ie && r.ie) res.ie = r.ie;
        if (!res.cpf && r.cpf) res.cpf = r.cpf;
        if (!res.razaoOficial && r.razao) res.razaoOficial = r.razao;
        res.origens.push('RELAÇÃO');
        break;
      }
    }

    // 2. Senhas Prefeituras (Cidades e Estados Reais)
    for (const p of (sp.senhasPrefeituras || [])) {
      if (matchItem(folderName, p.empresa)) {
        if (!res.cnpj && p.cnpj) res.cnpj = p.cnpj;
        if (!res.municipio && p.cidadeUf) {
          const parts = p.cidadeUf.split('-').map(s => s.trim());
          res.municipio = parts[0] || '';
          res.uf = parts[1] || '';
        }
        res.origens.push('PREFEITURAS');
        break;
      }
    }

    // 3. Senhas SEFA
    for (const s of (sp.senhasSefa || [])) {
      if (matchItem(folderName, s.empresa)) {
        if (!res.cnpj && s.cnpj) res.cnpj = s.cnpj;
        if (!res.cpf && s.cpf) res.cpf = s.cpf;
        res.origens.push('SEFA');
        break;
      }
    }

    // 4. Cad Eco Pref
    for (const c of (sp.senhasCadEco || [])) {
      if (matchItem(folderName, c.empresa)) {
        if (!res.inscrImobiliaria && c.cadImobiliario) res.inscrImobiliaria = c.cadImobiliario;
        if (!res.cadEconomico && c.cadEconomico) res.cadEconomico = c.cadEconomico;
        if (!res.inscrMobiliaria && c.cadEconomico) res.inscrMobiliaria = c.cadEconomico;
        res.origens.push('CAD.ECO');
        break;
      }
    }

    // 5. SEFA Simples
    for (const s of (sp.senhasSimples || [])) {
      if (matchItem(folderName, s.empresa)) {
        if (!res.cnpj && s.cnpj) res.cnpj = s.cnpj;
        if (!res.cpf && s.cpf) res.cpf = s.cpf;
        if (!res.inscrMobiliaria && s.inscrMobiliaria) res.inscrMobiliaria = s.inscrMobiliaria;
        res.origens.push('SEFA_SIMPLES');
        break;
      }
    }

    // 6. SEFA Pref
    for (const spref of (sp.senhasPrefSefa || [])) {
      if (matchItem(folderName, spref.empresa)) {
        if (!res.inscrMobiliaria && spref.im) res.inscrMobiliaria = spref.im;
        if (!res.municipio && spref.cidadeUf) {
          const parts = spref.cidadeUf.split('-').map(s => s.trim());
          res.municipio = parts[0] || '';
          res.uf = parts[1] || '';
        }
        res.origens.push('SEFA_PREF');
        break;
      }
    }

    // 7. SEFA Diversas
    for (const sd of (sp.senhasDiversas || [])) {
      if (matchItem(folderName, sd.empresa)) {
        if (!res.cnpj && sd.cnpj) res.cnpj = sd.cnpj;
        if (!res.cpf && sd.cpf) res.cpf = sd.cpf;
        if (!res.ie && sd.ie) res.ie = sd.ie;
        res.origens.push('SEFA_DIV');
        break;
      }
    }

    // 8. Empresas Ativas
    for (const a of (sp.empresasAtivas || [])) {
      if (matchItem(folderName, a.razao)) {
        if (!res.cnpj && a.cnpj) res.cnpj = a.cnpj;
        if (!res.rotinaFiscal && a.rotinaFiscal) res.rotinaFiscal = a.rotinaFiscal;
        if (!res.razaoOficial && a.razao) res.razaoOficial = a.razao;
        res.origens.push('ATIVAS');
        break;
      }
    }

    // 9. Fiscal
    for (const f of (sp.fiscal || [])) {
      if (matchItem(folderName, f.apelido)) {
        if (!res.cnpj && f.cnpj) res.cnpj = f.cnpj;
        if (!res.ie && f.ie) res.ie = f.ie;
        if (!res.municipio && f.municipio) res.municipio = f.municipio;
        if (!res.apelido && f.apelido) res.apelido = f.apelido;
        res.origens.push('FISCAL');
        break;
      }
    }

    // 10. Bombeiros
    for (const b of (sp.bombeiros || [])) {
      if (matchItem(folderName, b.empresa)) {
        if (!res.cnpj && b.cnpjLogin) res.cnpj = b.cnpjLogin;
        if (!res.bombeiroValidade && b.validade) res.bombeiroValidade = b.validade;
        if (!res.email && b.email) res.email = b.email;
        res.origens.push('BOMBEIROS');
        break;
      }
    }

    // 11. Parcelamentos
    for (const pc of (sp.parcelamentos || [])) {
      if (matchItem(folderName, pc.empresa)) {
        if (!res.cnpj && pc.cnpjCpf) res.cnpj = pc.cnpjCpf;
        res.origens.push('PARCELAMENTOS');
        break;
      }
    }

    // 12. Renovações
    for (const ren of (sp.renovacoes || [])) {
      if (matchItem(folderName, ren.empresa)) {
        if (!res.vigilancia && ren.vigilancia) res.vigilancia = ren.vigilancia;
        res.origens.push('RENOVACOES');
        break;
      }
    }

    return res;
  }

  // Deep probe em arquivos da pasta se CNPJ faltar
  async probeClientFolderDeep(dirPath) {
    const res = { cnpj: '', im: '', mun: '', uf: '', razao: '' };
    
    async function walk(d, depth = 0) {
      if (depth > 2) return;
      try {
        const entries = fs.readdirSync(d, { withFileTypes: true });

        // 1. Filename match
        for (const ent of entries) {
          if (!res.cnpj) {
            const m = ent.name.match(/\b\d{14}\b/);
            if (m && !ent.name.startsWith('1524') && !ent.name.startsWith('3324') && !ent.name.startsWith('1525') && !ent.name.startsWith('1526')) {
              res.cnpj = m[0];
            }
          }
        }

        // 2. Parse XMLs
        for (const ent of entries) {
          if (ent.isFile() && ent.name.endsWith('.xml') && (!res.cnpj || !res.im || !res.mun)) {
            try {
              const raw = fs.readFileSync(path.join(d, ent.name), 'utf8');
              const cM = raw.match(/<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/i) || raw.match(/<CNPJ>(\d{14})<\/CNPJ>/i);
              if (cM && !res.cnpj) res.cnpj = cM[1];
              const imM = raw.match(/<emit>[\s\S]*?<IM>([^<]+)<\/IM>/i) || raw.match(/<InscricaoMunicipal>([^<]+)<\/InscricaoMunicipal>/i);
              if (imM && !res.im) res.im = imM[1].trim();
              const munM = raw.match(/<xMun>([^<]+)<\/xMun>/i) || raw.match(/<xLocEmi>([^<]+)<\/xLocEmi>/i);
              if (munM && !res.mun) res.mun = munM[1].trim();
              const ufM = raw.match(/<emit>[\s\S]*?<UF>([A-Z]{2})<\/UF>/i) || raw.match(/<UF>([A-Z]{2})<\/UF>/i);
              if (ufM && !res.uf) res.uf = ufM[1].trim();
            } catch(e) {}
          }
        }

        // 3. Parse PDFs com PDFParse
        if (PDFParse) {
          for (const ent of entries) {
            if (ent.isFile() && ent.name.endsWith('.pdf') && (/CNPJ|ALVARA|ALVARÁ|COMPROVANTE|CCMEI/i.test(ent.name)) && (!res.cnpj || !res.mun)) {
              try {
                const fBuf = fs.readFileSync(path.join(d, ent.name));
                const parser = new PDFParse(new Uint8Array(fBuf));
                const parsed = await parser.getText();
                const txt = parsed.text || '';
                const cM = txt.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
                if (cM && !res.cnpj) res.cnpj = cM[0].replace(/\D/g, '');
                const munM = txt.match(/MUNIC[IÍ]PIO\s*:?\s*([A-ZÀ-Ú\s]{3,30})/i);
                if (munM && !res.mun && !munM[1].includes('FEDERATIVA')) res.mun = munM[1].trim();
                const ufM = txt.match(/\bUF\s*:?\s*([A-Z]{2})\b/i);
                if (ufM && !res.uf) res.uf = ufM[1].trim();
              } catch(e) {}
            }
          }
        }

        // 4. Subdiretórios
        for (const ent of entries) {
          if (ent.isDirectory() && (!res.cnpj || !res.mun)) {
            const subName = ent.name.toUpperCase();
            if (['LEGALIZAÇÃO', 'LEGALIZACAO', 'CERTIFICADO', 'CERTIFICADOS', 'PREFEITURA', 'ALVARÁ', 'ALVARA', 'FISCAL', 'NOTAS FISCAIS', 'XML'].includes(subName) || depth === 0) {
              await walk(path.join(d, ent.name), depth + 1);
            }
          }
        }
      } catch(e) {}
    }

    await walk(dirPath);
    return res;
  }

  // Varredura completa da rede
  async scanNetwork() {
    this.cache.isScanning = true;
    console.log('Iniciando varredura da rede MC Assessoria Contábil...');
    const startTime = Date.now();

    // Carregar dados de todas as planilhas
    this.loadSpreadsheets();

    const clientsList = [];

    // Percorrer cada pasta de regime
    for (const reg of REGIMES) {
      const regPath = path.join(BASE_PATH, reg.folder);
      if (!fs.existsSync(regPath)) continue;

      let entries = [];
      try {
        entries = fs.readdirSync(regPath, { withFileTypes: true });
      } catch (err) {
        console.error(`Erro ao ler pasta do regime ${reg.folder}:`, err.message);
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('1-EMPRESA NOVA') || entry.name.startsWith('5- CONSULTAS')) continue;

        const clientPath = path.join(regPath, entry.name);
        let stat;
        try {
          stat = fs.statSync(clientPath);
        } catch (e) {
          continue;
        }

        // Metadados iniciais cruzando as 8 planilhas
        const matched = this.matchMetadata(entry.name);
        let cnpj = matched.cnpj;
        let ie = matched.ie;
        let cpf = matched.cpf;
        let inscrMobiliaria = matched.inscrMobiliaria || matched.cadEconomico || '';
        let inscrImobiliaria = matched.inscrImobiliaria || '';
        let cadEconomico = matched.cadEconomico || '';
        let municipio = matched.municipio;
        let uf = matched.uf;
        let razaoOficial = matched.razaoOficial || entry.name;

        // Se CNPJ ou cidade faltar, sonda arquivos da pasta
        if (!cnpj || !municipio) {
          const deep = await this.probeClientFolderDeep(clientPath);
          if (!cnpj && deep.cnpj) cnpj = deep.cnpj;
          if (!inscrMobiliaria && deep.im) inscrMobiliaria = deep.im;
          if (!municipio && deep.mun) {
            municipio = deep.mun;
            uf = deep.uf || uf;
          }
          if (razaoOficial === entry.name && deep.razao) razaoOficial = deep.razao;
        }

        // Normalização de Cidade / UF
        const cityData = normalizeCity(municipio, uf);

        // Subpastas
        const subfolders = [];
        let directFilesCount = 0;
        try {
          const subs = fs.readdirSync(clientPath, { withFileTypes: true });
          for (const s of subs) {
            if (s.isDirectory()) subfolders.push(s.name);
            else directFilesCount++;
          }
        } catch (e) {}

        const subsUpper = subfolders.map(s => s.toUpperCase());
        const hasFiscal = subsUpper.some(s => s.includes('FISCAL'));
        const hasContabil = subsUpper.some(s => s.includes('CONTABIL') || s.includes('CONTÁBIL'));
        const hasPessoal = subsUpper.some(s => s.includes('PESSOAL') || s.includes('FOLHA') || s.includes('DP') || s.includes('DEPARTAMENTO PESSOAL'));
        const hasLegalizacao = subsUpper.some(s => s.includes('LEGAL') || s.includes('SOCIET') || s.includes('CERTID') || s.includes('ALVARA'));

        let complianceStatus = 'COMPLETO';
        const missingFolders = [];
        if (!hasFiscal) missingFolders.push('FISCAL');
        if (!hasContabil) missingFolders.push('CONTÁBIL');
        if (!hasPessoal) missingFolders.push('PESSOAL');
        if (!hasLegalizacao) missingFolders.push('LEGALIZAÇÃO');

        if (missingFolders.length > 0 && missingFolders.length < 4) complianceStatus = 'PARCIAL';
        else if (missingFolders.length === 4) complianceStatus = 'PENDENTE';

        const matchedLic = this.matchLicenca(entry.name);
        const matchedAtiva = this.matchAtiva(entry.name);
        const matchedExt = this.matchExtrato(entry.name);

        const overrides = loadClientOverrides();
        const clientOverride = overrides[entry.name] || overrides[clientPath] || null;

        // Status customizado na carteira: ATIVA, EX_CLIENTE, PARALISADA, HISTORICO
        let statusCarteira = clientOverride ? clientOverride.status : (reg.isCore ? 'ATIVA' : (reg.key === 'PARALISADOS' ? 'PARALISADA' : 'HISTORICO'));
        let isActive = statusCarteira === 'ATIVA';
        let isCore = Boolean(reg.isCore) && isActive;

        clientsList.push({
          id: Buffer.from(clientPath).toString('base64url'),
          name: entry.name,
          razaoOficial,
          apelido: matched.apelido || '',
          cnpj: cnpj || '',
          cnpjFormatted: formatCNPJ(cnpj),
          ie: ie || '',
          cpf: cpf || '',
          cpfFormatted: formatCNPJ(cpf),
          inscrMobiliaria,
          inscrImobiliaria,
          cadEconomico,
          municipio: cityData.formatted,
          cidade: cityData.cidade,
          uf: cityData.uf,
          regime: reg.key,
          regimeLabel: reg.label,
          regimeFolder: reg.folder,
          regimeColor: reg.color,
          statusCarteira,
          active: isActive,
          isCore,
          licenca: matchedLic ? {
            empresa: matchedLic.empresa,
            vigilancia: matchedLic.vigilancia,
            prefeitura: matchedLic.prefeitura,
            obs: matchedLic.obs,
            regime: matchedLic.regime
          } : null,
          rotinaFiscal: matchedAtiva ? matchedAtiva.rotinaFiscal : '',
          statusAtiva: matchedAtiva ? matchedAtiva.status : '',
          extratoBancario: matchedExt ? {
            bancos: matchedExt.bancos,
            email: matchedExt.email
          } : null,
          path: clientPath,
          lastModified: stat.mtime,
          lastModifiedFormatted: stat.mtime.toLocaleDateString('pt-BR') + ' ' + stat.mtime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          subfolders,
          subfolderCount: subfolders.length,
          directFilesCount,
          compliance: {
            status: complianceStatus,
            hasFiscal,
            hasContabil,
            hasPessoal,
            hasLegalizacao,
            missingFolders
          }
        });
      }
    }

    // Varredura de IRPF por anos
    const irpfList = [];
    const irpfPath = path.join(BASE_PATH, 'IRPF');
    if (fs.existsSync(irpfPath)) {
      try {
        const years = fs.readdirSync(irpfPath, { withFileTypes: true });
        for (const y of years) {
          if (y.isDirectory() && /^\d{4}$/.test(y.name)) {
            const yPath = path.join(irpfPath, y.name);
            const clientsInYear = fs.readdirSync(yPath, { withFileTypes: true })
              .filter(e => e.isDirectory())
              .map(e => e.name);
            irpfList.push({
              ano: y.name,
              total: clientsInYear.length,
              clientes: clientsInYear
            });
          }
        }
      } catch (err) {}
    }
    irpfList.sort((a, b) => b.ano.localeCompare(a.ano));

    // Estatísticas Consolidadas
    const stats = this.computeStats(clientsList, irpfList, startTime);

    this.cache.clients = clientsList;
    this.cache.stats = stats;
    this.cache.irpf = irpfList;
    this.cache.lastScan = new Date();
    this.cache.isScanning = false;

    // Salva automaticamente no cache_clients.json
    try {
      const cachePath = path.join(__dirname, 'cache_clients.json');
      fs.writeFileSync(cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch(e) {}

    console.log(`Varredura concluída em ${stats.tempoVarreduraMs}ms. Total clientes: ${stats.totalClients} (Ativos: ${stats.activeClients}, Com CNPJ: ${stats.comCnpj})`);
    return this.cache;
  }

  // Método para computar estatísticas consolidadas
  computeStats(clientsList = this.cache.clients, irpfList = this.cache.irpf || [], startTime = null) {
    const list = clientsList || [];
    const activeList = list.filter(c => c.active);

    const stats = {
      totalClients: list.length,
      activeClients: activeList.length,
      coreClients: list.filter(c => c.isCore).length,
      legacyClients: list.filter(c => !c.isCore).length,
      exClients: list.filter(c => c.statusCarteira === 'EX_CLIENTE').length,
      paralisados: list.filter(c => c.statusCarteira === 'PARALISADA' || c.regime === 'PARALISADOS').length,

      simplesNacional: activeList.filter(c => c.regime === 'SIMPLES_NACIONAL').length,
      lucroPresumido: activeList.filter(c => c.regime === 'LUCRO_PRESUMIDO').length,
      lucroReal: activeList.filter(c => c.regime === 'LUCRO_REAL').length,
      mei: activeList.filter(c => c.regime === 'MEI').length,
      cno: activeList.filter(c => c.regime === 'CNO').length,
      domestico: activeList.filter(c => c.regime === 'DOMESTICO').length,
      extras: activeList.filter(c => c.regime === 'EXTRAS').length,
      
      completas: activeList.filter(c => c.compliance && c.compliance.status === 'COMPLETO').length,
      parciais: activeList.filter(c => c.compliance && c.compliance.status === 'PARCIAL').length,
      pendentes: activeList.filter(c => c.compliance && c.compliance.status === 'PENDENTE').length,

      comCnpj: list.filter(c => c.cnpj).length,
      semCnpj: list.filter(c => !c.cnpj).length,
      withInscrMobiliaria: list.filter(c => c.inscrMobiliaria).length,

      byCity: {},
      licencasTotal: this.cache.spreadsheets && this.cache.spreadsheets.renovacoes ? this.cache.spreadsheets.renovacoes.length : 0,
      extratosTotal: this.cache.spreadsheets && this.cache.spreadsheets.extratos ? this.cache.spreadsheets.extratos.length : 0,
      senhasTotal: this.cache.spreadsheets && this.cache.spreadsheets.senhas ? this.cache.spreadsheets.senhas.length : 0,
      bombeirosTotal: this.cache.spreadsheets && this.cache.spreadsheets.bombeiros ? this.cache.spreadsheets.bombeiros.length : 0,
      parcelamentosTotal: this.cache.spreadsheets && this.cache.spreadsheets.parcelamentos ? this.cache.spreadsheets.parcelamentos.length : 0,
      irpfTotalAnos: (irpfList || []).length,
      tempoVarreduraMs: startTime ? Date.now() - startTime : (this.cache.stats ? this.cache.stats.tempoVarreduraMs : 0)
    };

    list.forEach(c => {
      stats.byCity[c.municipio] = (stats.byCity[c.municipio] || 0) + 1;
    });

    return stats;
  }

  // Aplica overrides aos clientes em memória e recalcula estatísticas
  applyOverrides() {
    const overrides = loadClientOverrides();
    if (!this.cache.clients) return;
    for (const client of this.cache.clients) {
      const clientOverride = overrides[client.name] || overrides[client.path];
      const isCoreFolder = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'].includes(client.regime);
      if (clientOverride) {
        client.statusCarteira = clientOverride.status;
        client.active = (clientOverride.status === 'ATIVA');
      } else if (!client.statusCarteira) {
        client.statusCarteira = isCoreFolder ? 'ATIVA' : (client.regime === 'PARALISADOS' ? 'PARALISADA' : 'HISTORICO');
        client.active = (client.statusCarteira === 'ATIVA');
      }
      client.isCore = Boolean(isCoreFolder && client.active);
    }
    this.recalculateStats();
  }

  // Recalcula estatísticas usando o cache atual em memória
  recalculateStats() {
    this.cache.stats = this.computeStats(this.cache.clients, this.cache.irpf);
    return this.cache.stats;
  }

  // Atualiza o status de carteira de um cliente (Ativa, Ex-Cliente, Paralisada)
  updateClientStatus(idOrName, newStatus, obs = '') {
    const overrides = loadClientOverrides();
    const client = this.cache.clients.find(c => c.id === idOrName || c.name === idOrName);
    if (!client) throw new Error('Cliente não encontrado');
    
    overrides[client.name] = {
      status: newStatus,
      obs: obs || '',
      updatedAt: new Date().toISOString()
    };
    saveClientOverrides(overrides);

    // Atualiza o objeto em memória
    client.statusCarteira = newStatus;
    client.active = (newStatus === 'ATIVA');
    const isCoreFolder = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'].includes(client.regime);
    client.isCore = isCoreFolder && client.active;

    const stats = this.recalculateStats();
    return { client, stats };
  }

  // Detalhes aprofundados de um cliente específico (árvore de subpastas e arquivos)
  getClientDetails(clientPath) {
    if (!fs.existsSync(clientPath)) {
      throw new Error('Pasta do cliente não encontrada no servidor de rede');
    }

    const tree = [];
    try {
      const items = fs.readdirSync(clientPath, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(clientPath, item.name);
        let stat = { size: 0, mtime: new Date() };
        try { stat = fs.statSync(itemPath); } catch(e) {}

        if (item.isDirectory()) {
          let subItems = [];
          try {
            subItems = fs.readdirSync(itemPath, { withFileTypes: true }).map(sub => ({
              name: sub.name,
              isDirectory: sub.isDirectory()
            }));
          } catch(e) {}

          tree.push({
            name: item.name,
            isDirectory: true,
            path: itemPath,
            childrenCount: subItems.length,
            children: subItems.slice(0, 50),
            mtime: stat.mtime
          });
        } else {
          tree.push({
            name: item.name,
            isDirectory: false,
            path: itemPath,
            size: stat.size,
            mtime: stat.mtime
          });
        }
      }
    } catch (err) {
      console.error('Erro ao ler detalhes do cliente:', err.message);
    }

    return {
      path: clientPath,
      tree
    };
  }

  // Criação automática de novo cliente na rede com toda a estrutura oficial
  createClientFolder(regimeKey, clientName, customCnpj = '') {
    const reg = REGIMES.find(r => r.key === regimeKey) || REGIMES[0];
    const targetRegimeFolder = path.join(BASE_PATH, reg.folder);

    if (!fs.existsSync(targetRegimeFolder)) {
      fs.mkdirSync(targetRegimeFolder, { recursive: true });
    }

    const safeClientName = clientName.trim().replace(/[\\/:*?"<>|]/g, '');
    const clientFolderPath = path.join(targetRegimeFolder, safeClientName);

    if (fs.existsSync(clientFolderPath)) {
      throw new Error(`A pasta do cliente "${safeClientName}" já existe em ${reg.label}!`);
    }

    fs.mkdirSync(clientFolderPath, { recursive: true });

    const template = (regimeKey === 'MEI') ? STANDARD_STRUCTURE.MEI : STANDARD_STRUCTURE.DEFAULT;

    for (const [dept, subDirs] of Object.entries(template)) {
      const deptPath = path.join(clientFolderPath, dept);
      fs.mkdirSync(deptPath, { recursive: true });
      for (const sub of subDirs) {
        fs.mkdirSync(path.join(deptPath, sub), { recursive: true });
      }
    }

    if (customCnpj) {
      const clean = customCnpj.replace(/\D/g, '');
      const metaContent = `CLIENTE: ${safeClientName}\nCNPJ: ${formatCNPJ(clean)}\nREGIME: ${reg.label}\nCRIADO EM: ${new Date().toLocaleString('pt-BR')}\n`;
      fs.writeFileSync(path.join(clientFolderPath, `CADASTRO_${clean}.txt`), metaContent, 'utf8');
    }

    setTimeout(() => this.scanNetwork(), 500);

    return {
      success: true,
      path: clientFolderPath,
      clientName: safeClientName,
      regime: reg.label
    };
  }

  standardizeClientFolder(clientPath, regimeKey) {
    if (!fs.existsSync(clientPath)) {
      throw new Error('Pasta do cliente não encontrada na rede');
    }

    const template = (regimeKey === 'MEI') ? STANDARD_STRUCTURE.MEI : STANDARD_STRUCTURE.DEFAULT;
    const createdDirs = [];

    for (const [dept, subDirs] of Object.entries(template)) {
      const deptPath = path.join(clientPath, dept);
      if (!fs.existsSync(deptPath)) {
        fs.mkdirSync(deptPath, { recursive: true });
        createdDirs.push(dept);
      }
      for (const sub of subDirs) {
        const subPath = path.join(deptPath, sub);
        if (!fs.existsSync(subPath)) {
          fs.mkdirSync(subPath, { recursive: true });
        }
      }
    }

    setTimeout(() => this.scanNetwork(), 500);

    return {
      success: true,
      createdDirs,
      totalCreated: createdDirs.length
    };
  }

  generateExcel() {
    const clients = this.cache.clients;
    const exportData = clients.map(c => ({
      'Razão Social / Nome': c.name,
      'Razão Oficial': c.razaoOficial || c.name,
      'CNPJ / CPF': c.cnpjFormatted || c.cnpj || 'NÃO IDENTIFICADO',
      'Inscrição Estadual': c.ie || '-',
      'Inscrição Municipal / Mobiliária': c.inscrMobiliaria || '-',
      'Município / UF': c.municipio || '-',
      'Regime Tributário': c.regimeLabel,
      'Status': c.active ? 'ATIVO' : 'PARALISADO',
      'Status das Pastas': c.compliance.status,
      'Tem Contábil': c.compliance.hasContabil ? 'SIM' : 'NÃO',
      'Tem Fiscal': c.compliance.hasFiscal ? 'SIM' : 'NÃO',
      'Tem Pessoal (DP)': c.compliance.hasPessoal ? 'SIM' : 'NÃO',
      'Tem Legalização': c.compliance.hasLegalizacao ? 'SIM' : 'NÃO',
      'Pastas Faltando': c.compliance.missingFolders.join(', ') || 'NENHUMA',
      'Qtd Subpastas': c.subfolderCount,
      'Última Modificação': c.lastModifiedFormatted,
      'Caminho na Rede': c.path
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    ws['!cols'] = [
      { wch: 45 },
      { wch: 45 },
      { wch: 22 },
      { wch: 18 },
      { wch: 25 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 30 },
      { wch: 14 },
      { wch: 20 },
      { wch: 60 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Clientes MC Contábil');

    if (this.cache.spreadsheets.bombeiros && this.cache.spreadsheets.bombeiros.length > 0) {
      const wsBombeiros = XLSX.utils.json_to_sheet(this.cache.spreadsheets.bombeiros);
      XLSX.utils.book_append_sheet(wb, wsBombeiros, 'Bombeiros & Alvarás');
    }

    if (this.cache.spreadsheets.parcelamentos && this.cache.spreadsheets.parcelamentos.length > 0) {
      const wsParc = XLSX.utils.json_to_sheet(this.cache.spreadsheets.parcelamentos);
      XLSX.utils.book_append_sheet(wb, wsParc, 'Parcelamentos');
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  getBasePath() {
    return getBasePath();
  }

  setBasePath(newPath) {
    const ok = setBasePath(newPath);
    if (ok) {
      console.log(`[Scanner] Endereço base de rede atualizado para: "${newPath}"`);
    }
    return ok;
  }
}

module.exports = new AccountingScanner();
