/**
 * db.js
 * Banco de Dados Industrial Local para o MC Hub Contábil (SQLite Nativo com WAL)
 * Zero dependências externas - utiliza node:sqlite (Node.js v24+)
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, 'mc_contabil.db');
const db = new DatabaseSync(DB_FILE);

// Ativa WAL (Write-Ahead Logging) e otimizações de performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  -- 1. TABELA DE NOTAS FISCAIS (XML)
  CREATE TABLE IF NOT EXISTS notas_fiscais (
    chave TEXT PRIMARY KEY,
    numero TEXT,
    serie TEXT,
    tipo TEXT,
    data_emissao TEXT,
    direcao TEXT,
    cnpj_emitente TEXT,
    razao_emitente TEXT,
    cnpj_destinatario TEXT,
    razao_destinatario TEXT,
    valor_total REAL,
    valor_icms REAL,
    valor_pis REAL,
    valor_cofins REAL,
    valor_ipi REAL,
    dados_completos_json TEXT,
    data_importacao TEXT
  );

  -- 2. TABELA DE EXTRATOS BANCÁRIOS & CONCILIAÇÃO
  CREATE TABLE IF NOT EXISTS extratos_transacoes (
    id TEXT PRIMARY KEY,
    nome_arquivo TEXT,
    banco_nome TEXT,
    banco_codigo TEXT,
    cor_banco TEXT,
    badge_banco TEXT,
    data TEXT,
    descricao TEXT,
    tipo TEXT,
    valor REAL,
    valor_original REAL,
    categoria TEXT,
    debito TEXT,
    credito TEXT,
    historico TEXT,
    data_processamento TEXT
  );

  -- 3. TABELA DE FOLHA DE PAGAMENTO & eSOCIAL
  CREATE TABLE IF NOT EXISTS folha_eventos (
    id TEXT PRIMARY KEY,
    evento TEXT,
    competencia TEXT,
    cpf TEXT,
    nome TEXT,
    empregador_cnpj TEXT,
    proventos REAL,
    descontos REAL,
    liquido REAL,
    dados_completos_json TEXT,
    data_processamento TEXT
  );

  -- 4. TABELA DE CONFIGURAÇÕES DE INTEGRAÇÃO DO DOMÍNIO SISTEMAS
  CREATE TABLE IF NOT EXISTS config_dominio (
    chave TEXT PRIMARY KEY,
    valor TEXT,
    descricao TEXT,
    atualizado_em TEXT
  );

  -- 5. TABELA DE DETALHES DAS EMPRESAS & VÍNCULO DOMÍNIO SISTEMAS
  CREATE TABLE IF NOT EXISTS empresas_detalhes (
    id TEXT PRIMARY KEY,
    cnpj TEXT,
    codigo_dominio TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    regime_tributario TEXT,
    acumulador_compra TEXT,
    acumulador_venda TEXT,
    conta_contabil TEXT,
    observacoes TEXT,
    atualizado_em TEXT
  );

  -- 6. TABELA DE CONFIGURAÇÃO DE REDE / ENDEREÇO ATIVO
  CREATE TABLE IF NOT EXISTS config_rede (
    chave TEXT PRIMARY KEY,
    valor TEXT,
    atualizado_em TEXT
  );

  -- ÍNDICES PARA BUSCA ULTRA RÁPIDA
  CREATE INDEX IF NOT EXISTS idx_notas_emissao ON notas_fiscais(data_emissao);
  CREATE INDEX IF NOT EXISTS idx_notas_emitente ON notas_fiscais(cnpj_emitente);
  CREATE INDEX IF NOT EXISTS idx_extratos_data ON extratos_transacoes(data);
  CREATE INDEX IF NOT EXISTS idx_extratos_banco ON extratos_transacoes(banco_nome);
  CREATE INDEX IF NOT EXISTS idx_folha_cpf ON folha_eventos(cpf);
  CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas_detalhes(cnpj);
  CREATE INDEX IF NOT EXISTS idx_empresas_cod_dom ON empresas_detalhes(codigo_dominio);
`);

console.log('[SQLite] Banco de dados industrial mc_contabil.db inicializado em modo WAL com sucesso!');

// ============================================================
// MÉTODOS - NOTAS FISCAIS
// ============================================================
const stmtSalvarNota = db.prepare(`
  INSERT OR REPLACE INTO notas_fiscais (
    chave, numero, serie, tipo, data_emissao, direcao,
    cnpj_emitente, razao_emitente, cnpj_destinatario, razao_destinatario,
    valor_total, valor_icms, valor_pis, valor_cofins, valor_ipi,
    dados_completos_json, data_importacao
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function salvarNota(n) {
  const tot = n.totais || {};
  stmtSalvarNota.run(
    n.chave || `CHV_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    String(n.numero || ''),
    String(n.serie || ''),
    n.tipo || 'NFE',
    n.dataEmissao || '',
    n.direcao || 'ENTRADA',
    n.emitente?.cnpj || '',
    n.emitente?.razaoSocial || '',
    n.destinatario?.cnpj || n.destinatario?.cpf || '',
    n.destinatario?.razaoSocial || '',
    tot.valorNota || tot.valorTotal || n.valorTotal || 0,
    tot.valorICMS || 0,
    tot.valorPIS || 0,
    tot.valorCOFINS || 0,
    tot.valorIPI || 0,
    JSON.stringify(n),
    new Date().toISOString()
  );
}

function salvarNotasBatch(lista) {
  for (const n of lista) {
    salvarNota(n);
  }
}

function obterNotas() {
  const rows = db.prepare('SELECT dados_completos_json FROM notas_fiscais ORDER BY data_emissao DESC').all();
  return rows.map(r => {
    try { return JSON.parse(r.dados_completos_json); } catch(e) { return null; }
  }).filter(Boolean);
}

function limparNotas() {
  db.exec('DELETE FROM notas_fiscais');
  return true;
}

// ============================================================
// MÉTODOS - EXTRATOS BANCÁRIOS
// ============================================================
const stmtSalvarTransacao = db.prepare(`
  INSERT OR REPLACE INTO extratos_transacoes (
    id, nome_arquivo, banco_nome, banco_codigo, cor_banco, badge_banco,
    data, descricao, tipo, valor, valor_original,
    categoria, debito, credito, historico, data_processamento
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function salvarTransacoesExtrato(transacoes, nomeArquivo = '') {
  const now = new Date().toISOString();
  for (const t of transacoes) {
    stmtSalvarTransacao.run(
      t.id || `TX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      nomeArquivo,
      t.banco || '',
      t.codigoBanco || '',
      t.corBanco || '',
      t.badgeBanco || '',
      t.data || '',
      t.descricao || '',
      t.tipo || '',
      t.valor || 0,
      t.valorOriginal || 0,
      t.conciliacao?.categoria || '',
      t.conciliacao?.debito || '',
      t.conciliacao?.credito || '',
      t.conciliacao?.historico || '',
      now
    );
  }
}

function obterTransacoesExtrato() {
  const rows = db.prepare('SELECT * FROM extratos_transacoes ORDER BY rowid DESC').all();
  return rows.map(r => ({
    id: r.id,
    data: r.data,
    descricao: r.descricao,
    tipo: r.tipo,
    valor: r.valor,
    valorOriginal: r.valor_original,
    banco: r.banco_nome,
    codigoBanco: r.banco_codigo,
    corBanco: r.cor_banco,
    badgeBanco: r.badge_banco,
    conciliacao: {
      categoria: r.categoria,
      debito: r.debito,
      credito: r.credito,
      valor: r.valor,
      historico: r.historico
    }
  }));
}

function limparExtratos() {
  db.exec('DELETE FROM extratos_transacoes');
  return true;
}

// ============================================================
// MÉTODOS - FOLHA DE PAGAMENTO / eSOCIAL
// ============================================================
const stmtSalvarEventoFolha = db.prepare(`
  INSERT OR REPLACE INTO folha_eventos (
    id, evento, competencia, cpf, nome, empregador_cnpj,
    proventos, descontos, liquido, dados_completos_json, data_processamento
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function salvarEventosFolha(eventos) {
  const now = new Date().toISOString();
  for (const ev of eventos) {
    const det = ev.detalhes || {};
    const id = ev.id || `${ev.evento}_${ev.trabalhador?.cpf || 'SEMCPF'}_${ev.competencia || 'ATUAL'}_${Math.random().toString(36).substr(2, 4)}`;
    stmtSalvarEventoFolha.run(
      id,
      ev.evento || '',
      ev.competencia || '',
      ev.trabalhador?.cpf || '',
      det.nome || '',
      ev.empregador?.inscricao || '',
      det.totalProventos || 0,
      det.totalDescontos || 0,
      det.valorLiquido || 0,
      JSON.stringify(ev),
      now
    );
  }
}

function obterEventosFolha() {
  const rows = db.prepare('SELECT dados_completos_json FROM folha_eventos ORDER BY rowid DESC').all();
  return rows.map(r => {
    try { return JSON.parse(r.dados_completos_json); } catch(e) { return null; }
  }).filter(Boolean);
}

function limparFolha() {
  db.exec('DELETE FROM folha_eventos');
  return true;
}

// ============================================================
// MIGRAÇÃO AUTOMÁTICA DE JSON LEGADO PARA SQLITE
// ============================================================
function migrarArquivosLegados() {
  try {
    // 1. Migra notas_processadas.json se existir
    const pNotas = path.join(__dirname, 'notas_processadas.json');
    if (fs.existsSync(pNotas)) {
      const data = JSON.parse(fs.readFileSync(pNotas, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        salvarNotasBatch(data);
        console.log(`[SQLite] Migradas ${data.length} notas fiscais do JSON legado.`);
      }
    }

    // 2. Migra extratos_processados.json se existir
    const pExtratos = path.join(__dirname, 'extratos_processados.json');
    if (fs.existsSync(pExtratos)) {
      const data = JSON.parse(fs.readFileSync(pExtratos, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        for (const ext of data) {
          if (ext.transacoes && ext.transacoes.length > 0) {
            salvarTransacoesExtrato(ext.transacoes, ext.nomeArquivo);
          }
        }
        console.log(`[SQLite] Migrados extratos bancários do JSON legado.`);
      }
    }

    // 3. Migra folha_processada.json se existir
    const pFolha = path.join(__dirname, 'folha_processada.json');
    if (fs.existsSync(pFolha)) {
      const data = JSON.parse(fs.readFileSync(pFolha, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        salvarEventosFolha(data);
        console.log(`[SQLite] Migrados ${data.length} eventos de folha do JSON legado.`);
      }
    }
  } catch (err) {
    console.error('[SQLite] Erro ao migrar arquivos legados:', err.message);
  }
}

// ============================================================
// MÉTODOS - CONFIGURAÇÕES DO DOMÍNIO SISTEMAS
// ============================================================
const CONFIG_DOMINIO_DEFAULT = {
  codigo_empresa_padrao: { valor: '1', descricao: 'Código padrão da Empresa no Domínio Sistemas' },
  acumulador_compra: { valor: '1', descricao: 'Acumulador para Compras de Mercadoria / Revenda' },
  acumulador_uso_consumo: { valor: '2', descricao: 'Acumulador para Compras de Uso e Consumo' },
  acumulador_venda: { valor: '10', descricao: 'Acumulador para Vendas de Mercadoria / Saídas' },
  acumulador_servico_tomado: { valor: '50', descricao: 'Acumulador para Serviços Tomados (NFS-e Entrada)' },
  acumulador_servico_prestado: { valor: '60', descricao: 'Acumulador para Serviços Prestados (NFS-e Saída)' },
  conta_banco_padrao: { valor: '1.1.1.02.0001', descricao: 'Conta Contábil do Banco Principal' },
  conta_fornecedores_padrao: { valor: '2.1.1.01.0001', descricao: 'Conta Contábil de Fornecedores a Pagar' },
  conta_clientes_padrao: { valor: '1.1.2.01.0001', descricao: 'Conta Contábil de Clientes a Receber' },
  conta_receita_padrao: { valor: '3.1.1.01.0001', descricao: 'Conta Contábil de Receita Bruta' },
  conta_despesa_padrao: { valor: '4.1.2.01.0001', descricao: 'Conta Contábil de Despesas Gerais' }
};

function inicializarConfigDominio() {
  try {
    const stmtCheck = db.prepare('SELECT COUNT(*) as count FROM config_dominio');
    const row = stmtCheck.get();
    if (row.count === 0) {
      const stmtInsert = db.prepare('INSERT INTO config_dominio (chave, valor, descricao, atualizado_em) VALUES (?, ?, ?, ?)');
      for (const [k, v] of Object.entries(CONFIG_DOMINIO_DEFAULT)) {
        stmtInsert.run(k, v.valor, v.descricao, new Date().toISOString());
      }
      console.log('[SQLite] Tabela config_dominio inicializada com padrões contábeis.');
    }
  } catch (e) {
    console.error('[SQLite] Erro ao inicializar config_dominio:', e.message);
  }
}

function obterConfigDominio() {
  try {
    const rows = db.prepare('SELECT chave, valor, descricao, atualizado_em FROM config_dominio').all();
    const config = {};
    for (const r of rows) {
      config[r.chave] = r.valor;
    }
    return config;
  } catch (e) {
    console.error('[SQLite] Erro ao ler config_dominio:', e.message);
    return {};
  }
}

function salvarConfigDominio(chave, valor, descricao = '') {
  try {
    const stmt = db.prepare(`
      INSERT INTO config_dominio (chave, valor, descricao, atualizado_em)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em
    `);
    stmt.run(chave, String(valor), descricao, new Date().toISOString());
  } catch (e) {
    console.error('[SQLite] Erro ao salvar config_dominio:', e.message);
  }
}

function salvarLoteConfigDominio(configs) {
  for (const [k, v] of Object.entries(configs)) {
    salvarConfigDominio(k, v);
  }
  return obterConfigDominio();
}

// ============================================================
// MÉTODOS - DETALHES DAS EMPRESAS & INTEGRAÇÃO DOMÍNIO
// ============================================================
const stmtUpsertEmpresa = db.prepare(`
  INSERT INTO empresas_detalhes (
    id, cnpj, codigo_dominio, razao_social, nome_fantasia,
    regime_tributario, acumulador_compra, acumulador_venda, conta_contabil,
    observacoes, atualizado_em
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    cnpj = excluded.cnpj,
    razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia,
    regime_tributario = excluded.regime_tributario,
    atualizado_em = excluded.atualizado_em
`);

function sincronizarEmpresas(clients) {
  if (!Array.isArray(clients) || clients.length === 0) return;
  const now = new Date().toISOString();
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const c of clients) {
      const cleanCnpj = String(c.cnpj || '').replace(/\D/g, '');
      stmtUpsertEmpresa.run(
        c.id,
        cleanCnpj,
        c.codigoDominio || null,
        c.razaoOficial || c.name || '',
        c.apelido || c.name || '',
        c.regime || 'SIMPLES_NACIONAL',
        c.acumuladorCompra || null,
        c.acumuladorVenda || null,
        c.contaContabil || null,
        c.path || '',
        now
      );
    }
    db.exec('COMMIT;');
    console.log(`[SQLite] Sincronizadas ${clients.length} empresas com a tabela empresas_detalhes.`);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('[SQLite] Erro ao sincronizar empresas:', err.message);
  }
}

function obterEmpresasDetalhes() {
  try {
    return db.prepare('SELECT * FROM empresas_detalhes').all();
  } catch (e) {
    console.error('[SQLite] Erro ao obter empresas_detalhes:', e.message);
    return [];
  }
}

function obterEmpresaPorCNPJ(cnpj) {
  try {
    const clean = String(cnpj || '').replace(/\D/g, '');
    if (!clean) return null;
    return db.prepare('SELECT * FROM empresas_detalhes WHERE cnpj = ?').get(clean);
  } catch (e) {
    console.error('[SQLite] Erro ao buscar empresa por CNPJ:', e.message);
    return null;
  }
}

function salvarCodigoDominioEmpresa(id, codigoDominio) {
  try {
    const stmt = db.prepare(`
      UPDATE empresas_detalhes
      SET codigo_dominio = ?, atualizado_em = ?
      WHERE id = ? OR cnpj = ?
    `);
    stmt.run(String(codigoDominio).trim(), new Date().toISOString(), id, id);
    return true;
  } catch (e) {
    console.error('[SQLite] Erro ao salvar codigo_dominio:', e.message);
    return false;
  }
}

// Métodos de Configuração de Rede & Conexão Automática
function obterConfigRede() {
  try {
    const rows = db.prepare('SELECT chave, valor FROM config_rede').all();
    const config = {};
    rows.forEach(r => { config[r.chave] = r.valor; });
    return config;
  } catch (e) {
    return {};
  }
}

function salvarConfigRede(endereco, apelido, autoConectar = true) {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO config_rede (chave, valor, atualizado_em)
      VALUES (?, ?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em
    `);
    stmt.run('endereco_ativo', String(endereco).trim(), now);
    if (apelido) stmt.run('apelido_ativo', String(apelido).trim(), now);
    stmt.run('auto_conectar', autoConectar ? 'true' : 'false', now);
    return true;
  } catch (e) {
    console.error('[SQLite] Erro ao salvar config_rede:', e.message);
    return false;
  }
}

// Inicializa configurações
inicializarConfigDominio();

module.exports = {
  db,
  salvarNota,
  salvarNotasBatch,
  obterNotas,
  limparNotas,
  salvarTransacoesExtrato,
  obterTransacoesExtrato,
  limparExtratos,
  salvarEventosFolha,
  obterEventosFolha,
  limparFolha,
  obterConfigDominio,
  salvarConfigDominio,
  salvarLoteConfigDominio,
  sincronizarEmpresas,
  obterEmpresasDetalhes,
  obterEmpresaPorCNPJ,
  salvarCodigoDominioEmpresa,
  obterConfigRede,
  salvarConfigRede
};
