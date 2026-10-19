const fs = require('fs');
const path = require('path');

const BASE_PATH = fs.existsSync('X:\\') ? 'X:\\' : '\\\\192.168.15.2\\mc assessoria contabil';
const AUDIT_OUTPUT = path.join(__dirname, 'audit_index.json');

const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{14}\b/;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b/;
const PASSWORD_REGEX = /senha[:\s_-]+([a-zA-Z0-9@#$!%*?&._-]+)/i;

function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyCategory(fileName, dirPath) {
  const fLower = fileName.toLowerCase();
  const dLower = dirPath.toLowerCase();
  const ext = path.extname(fLower);

  if (ext === '.xml') return 'XML';
  if (['.pfx', '.p12', '.cer', '.crt'].includes(ext) || fLower.includes('certificado')) return 'CERTIFICADO';
  if (dLower.includes('fiscal') || fLower.includes('darf') || fLower.includes('pgdas') || fLower.includes('dctf') || fLower.includes('iss') || fLower.includes('nota fiscal') || fLower.includes('nfe') || fLower.includes('nfce') || fLower.includes('sped') || fLower.includes('sintegra')) return 'FISCAL';
  if (dLower.includes('contabil') || dLower.includes('contábil') || fLower.includes('balanco') || fLower.includes('balanço') || fLower.includes('extrato') || fLower.includes('dre') || fLower.includes('razao') || fLower.includes('diario') || fLower.includes('caixa')) return 'CONTÁBIL';
  if (dLower.includes('pessoal') || dLower.includes('folha') || dLower.includes('dp') || fLower.includes('rescisao') || fLower.includes('admissao') || fLower.includes('fgts') || fLower.includes('gfip') || fLower.includes('inss') || fLower.includes('holerite') || fLower.includes('folha')) return 'PESSOAL';
  if (dLower.includes('legaliz') || dLower.includes('societ') || fLower.includes('alvara') || fLower.includes('alvará') || fLower.includes('visa') || fLower.includes('vigilancia') || fLower.includes('vigilância') || fLower.includes('bombeiro') || fLower.includes('contrato social') || fLower.includes('jucepa') || fLower.includes('cnd') || fLower.includes('certidao')) return 'LEGALIZAÇÃO';
  if (dLower.includes('parcelamento') || fLower.includes('parcelamento')) return 'PARCELAMENTO';
  return 'OUTROS';
}

class DeepCrawler {
  constructor() {
    this.isAuditing = false;
    this.progress = {
      totalFiles: 0,
      totalBytes: 0,
      currentFolder: '',
      startedAt: null,
      finishedAt: null
    };
    this.index = {
      metadata: {},
      summary: {},
      files: [],
      certificates: [],
      xmlStats: {},
      byClient: {},
      byCategory: {}
    };
  }

  async runDeepAudit() {
    this.isAuditing = true;
    this.progress.startedAt = new Date();
    this.progress.totalFiles = 0;
    this.progress.totalBytes = 0;
    console.log(`[DeepCrawler] Iniciando varredura profunda de toda a rede MC Assessoria Contábil...`);
    console.log(`[DeepCrawler] Alvo: ${BASE_PATH}`);

    const files = [];
    const certificates = [];
    const byCategory = {
      XML: { count: 0, size: 0 },
      CERTIFICADO: { count: 0, size: 0 },
      FISCAL: { count: 0, size: 0 },
      CONTÁBIL: { count: 0, size: 0 },
      PESSOAL: { count: 0, size: 0 },
      LEGALIZAÇÃO: { count: 0, size: 0 },
      PARCELAMENTO: { count: 0, size: 0 },
      OUTROS: { count: 0, size: 0 }
    };
    const byClient = {};
    const xmlStats = {};
    let totalBytes = 0;

    // Pastas a varrer
    const targetFolders = [
      { name: '4-SIMPLES NACIONAL', regime: 'SIMPLES_NACIONAL' },
      { name: '5-LUCRO PRESUMIDO', regime: 'LUCRO_PRESUMIDO' },
      { name: '6-LUCRO REAL', regime: 'LUCRO_REAL' },
      { name: '2-MEI', regime: 'MEI' },
      { name: '1-CNO', regime: 'CNO' },
      { name: '3-DOMÉSTICO', regime: 'DOMÉSTICO' },
      { name: 'SERVIÇOS EXTRAS', regime: 'EXTRAS' },
      { name: 'SERVIÇOS PARALISADOS', regime: 'PARALISADOS' },
      { name: '7-PARCELAMENTOS', regime: 'PARCELAMENTOS' },
      { name: 'DIVERSOS', regime: 'DIVERSOS' },
      { name: 'JR ASSESSORIA CONTABIL', regime: 'JR_ASSESSORIA' },
      { name: 'IRPF', regime: 'IRPF' },
      { name: 'LEGISLAÇÃO', regime: 'LEGISLAÇÃO' }
    ];

    const self = this;

    function walkDir(currentPath, clientName, regime, depth = 0) {
      if (depth > 8) return; // Proteção contra links simbólicos profundos
      let entries = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (err) {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          // Ignora subpastas de lixeira, sistema, dumps pesados de banco e instaladores
          if (entry.name.startsWith('$') || 
              entry.name === 'System Volume Information' || 
              entry.name.startsWith('BKP DOMINIO') || 
              entry.name.startsWith('PROGRAMAS') || 
              entry.name === 'node_modules' ||
              entry.name.startsWith('BUCKUP')) continue;
          
          let subClient = clientName;
          // Se estamos no nível logo abaixo do regime, o nome da pasta é o nome do cliente
          if (!clientName && depth === 1) {
            subClient = entry.name;
          }
          walkDir(fullPath, subClient || entry.name, regime, depth + 1);
        } else if (entry.isFile()) {
          // Pula temporários do Office e Thumbs
          if (entry.name.startsWith('~$') || entry.name === 'Thumbs.db') continue;

          let stat;
          try {
            stat = fs.statSync(fullPath);
          } catch(e) {
            continue;
          }

          const ext = path.extname(entry.name).toLowerCase();
          const category = classifyCategory(entry.name, currentPath);
          const size = stat.size || 0;
          totalBytes += size;
          self.progress.totalFiles++;
          self.progress.totalBytes = totalBytes;

          if (self.progress.totalFiles % 1000 === 0) {
            console.log(`[DeepCrawler] Indexados ${self.progress.totalFiles} arquivos... (Pasta atual: ${self.progress.currentFolder})`);
          }

          // Extração de CNPJ ou CPF no nome ou caminho
          let cnpj = '';
          const matchCnpj = (entry.name + ' ' + fullPath).match(CNPJ_REGEX);
          if (matchCnpj) cnpj = matchCnpj[0].replace(/\D/g, '');

          let cpf = '';
          const matchCpf = (entry.name + ' ' + fullPath).match(CPF_REGEX);
          if (matchCpf && (!cnpj || matchCpf[0].replace(/\D/g, '') !== cnpj)) {
            cpf = matchCpf[0].replace(/\D/g, '');
          }

          // Detecção de senha anotada no nome do arquivo
          let detectedPassword = '';
          const matchPw = entry.name.match(PASSWORD_REGEX);
          if (matchPw) detectedPassword = matchPw[1];

          // Safe date formatting
          let mtimeFmt = '';
          try {
            if (stat.mtime && !isNaN(stat.mtime.getTime())) {
              mtimeFmt = stat.mtime.toLocaleDateString('pt-BR') + ' ' + stat.mtime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }
          } catch(e) {}

          // Registro do arquivo
          const fileRecord = {
            id: Buffer.from(fullPath).toString('base64url'),
            name: entry.name,
            ext,
            size,
            sizeFmt: formatBytes(size),
            mtime: stat.mtime,
            mtimeFmt,
            path: fullPath,
            client: clientName || 'GERAL',
            regime: regime || 'GERAL',
            category,
            cnpj,
            cpf,
            detectedPassword
          };

          files.push(fileRecord);

          // Agregações por categoria
          if (!byCategory[category]) byCategory[category] = { count: 0, size: 0 };
          byCategory[category].count++;
          byCategory[category].size += size;

          // Agregações por cliente
          const clientKey = clientName || 'GERAL';
          if (!byClient[clientKey]) {
            byClient[clientKey] = {
              name: clientKey,
              regime,
              fileCount: 0,
              totalSize: 0,
              categories: {},
              latestFile: null
            };
          }
          byClient[clientKey].fileCount++;
          byClient[clientKey].totalSize += size;
          byClient[clientKey].categories[category] = (byClient[clientKey].categories[category] || 0) + 1;
          if (!byClient[clientKey].latestFile || stat.mtime > new Date(byClient[clientKey].latestFile.mtime)) {
            byClient[clientKey].latestFile = {
              name: entry.name,
              mtime: stat.mtime,
              path: fullPath
            };
          }

          // Registro especial de certificados
          if (category === 'CERTIFICADO' || ['.pfx', '.p12', '.cer'].includes(ext)) {
            certificates.push({
              name: entry.name,
              client: clientName || 'GERAL',
              path: fullPath,
              size: formatBytes(size),
              mtime: stat.mtime,
              detectedPassword: detectedPassword || (entry.name.toLowerCase().includes('senha') ? 'Verificar nome' : 'Não informada no nome')
            });
          }

          // Agregação de XMLs
          if (category === 'XML' || ext === '.xml') {
            const yrMatch = (currentPath + ' ' + entry.name).match(/\b(202[0-9])\b/);
            const yr = yrMatch ? yrMatch[1] : 'OUTROS_ANOS';
            if (!xmlStats[clientKey]) xmlStats[clientKey] = { total: 0, anos: {} };
            xmlStats[clientKey].total++;
            xmlStats[clientKey].anos[yr] = (xmlStats[clientKey].anos[yr] || 0) + 1;
          }
        }
      }
    }

    // Executa varredura nas pastas principais
    for (const t of targetFolders) {
      const targetPath = path.join(BASE_PATH, t.name);
      if (fs.existsSync(targetPath)) {
        self.progress.currentFolder = t.name;
        walkDir(targetPath, '', t.regime, 1);
      }
    }

    this.progress.finishedAt = new Date();
    const durationSec = Math.round((this.progress.finishedAt - this.progress.startedAt) / 1000);

    const summary = {
      totalFiles: files.length,
      totalBytes,
      totalSizeFormatted: formatBytes(totalBytes),
      totalCertificates: certificates.length,
      totalXml: byCategory.XML ? byCategory.XML.count : 0,
      totalPdfs: files.filter(f => f.ext === '.pdf').length,
      totalSpreadsheets: files.filter(f => ['.xlsx', '.xls', '.ods', '.csv'].includes(f.ext)).length,
      totalDocs: files.filter(f => ['.docx', '.doc'].includes(f.ext)).length,
      totalClientsAudited: Object.keys(byClient).length,
      durationSeconds: durationSec,
      auditedAt: this.progress.finishedAt
    };

    this.index = {
      summary,
      byCategory,
      certificates,
      xmlStats,
      byClient,
      // Armazena arquivos mais recentes e importantes
      filesCount: files.length,
      files: files
    };

    this.isAuditing = false;
    console.log(`[DeepCrawler] Varredura concluída em ${durationSec}s!`);
    console.log(`[DeepCrawler] Total de arquivos indexados: ${files.length} (${summary.totalSizeFormatted})`);
    console.log(`[DeepCrawler] Certificados: ${certificates.length} | XMLs: ${summary.totalXml} | PDFs: ${summary.totalPdfs}`);

    // Salva arquivo de índice
    try {
      fs.writeFileSync(AUDIT_OUTPUT, JSON.stringify(this.index, null, 2), 'utf8');
      console.log(`[DeepCrawler] Índice salvo com sucesso em ${AUDIT_OUTPUT}`);
    } catch(e) {
      console.error(`[DeepCrawler] Erro ao salvar audit_index.json:`, e.message);
    }

    return this.index;
  }

  // Busca instantânea sobre o índice em memória
  search(query, options = {}) {
    if (!this.index.files || this.index.files.length === 0) {
      if (fs.existsSync(AUDIT_OUTPUT)) {
        try {
          this.index = JSON.parse(fs.readFileSync(AUDIT_OUTPUT, 'utf8'));
        } catch(e) {}
      }
    }

    if (!query) return [];
    const q = cleanName(query).toLowerCase();
    const terms = q.split(' ').filter(Boolean);
    const limit = options.limit || 100;
    const categoryFilter = options.category;

    const results = [];
    for (const f of this.index.files) {
      if (categoryFilter && categoryFilter !== 'ALL' && f.category !== categoryFilter) continue;

      const targetStr = `${f.name} ${f.client} ${f.regime} ${f.category} ${f.cnpj} ${f.cpf}`.toLowerCase();
      const matchesAll = terms.every(t => targetStr.includes(t));
      if (matchesAll) {
        results.push(f);
        if (results.length >= limit) break;
      }
    }

    return results;
  }
}

module.exports = new DeepCrawler();
