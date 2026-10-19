const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const multer = require('multer');
const nfeParser = require('./nfe-parser');
const fiscalEngine = require('./fiscal-engine');
const esocialParser = require('./esocial-parser');
const extratosEngine = require('./extratos-engine');
const db = require('./db');

// Configuração do Multer para upload em memória
const uploadXML = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadExtratos = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Proteção permanente contra qualquer falha não tratada
process.on('uncaughtException', (err) => {
  console.error('[Servidor Protegido] Aviso de exceção:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Servidor Protegido] Aviso de rejeição:', reason);
});

const scanner = require('./scanner');
const deepCrawler = require('./deep_crawler');
const networkWatcher = require('./network_watcher');

function cleanName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_FILE = path.join(__dirname, 'cache_clients.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Carrega cache local rápido se existir
function loadLocalCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      scanner.cache = data;
      console.log(`Cache local carregado: ${data.clients.length} clientes.`);
    } catch (e) {
      console.error('Erro ao ler cache local:', e.message);
    }
  }
  // Garante que as planilhas oficiais estejam carregadas na memória
  if (!scanner.cache.spreadsheets || !scanner.cache.spreadsheets.renovacoes || scanner.cache.spreadsheets.renovacoes.length === 0) {
    try {
      scanner.loadSpreadsheets();
      console.log('Planilhas oficiais carregadas (licenças, senhas, extratos, ativas).');
    } catch(e) {
      console.error('Erro ao carregar planilhas:', e.message);
    }
  }

  // Aplica overrides customizados salvos em client_overrides.json
  try {
    scanner.applyOverrides();
  } catch(e) {
    console.error('Erro ao aplicar overrides:', e.message);
  }

  // Sincroniza empresas na tabela SQLite empresas_detalhes
  if (scanner.cache && Array.isArray(scanner.cache.clients) && scanner.cache.clients.length > 0) {
    try {
      db.sincronizarEmpresas(scanner.cache.clients);
    } catch(e) {
      console.error('Erro ao sincronizar empresas no SQLite:', e.message);
    }
  }
}

// Salva cache local
function saveLocalCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(scanner.cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar cache local:', e.message);
  }
}

// ============================================================
// ROTAS - CENTRAL DE NOTAS FISCAIS (NF-e / NFS-e / CT-e)
// ============================================================

// Endpoint: Processar XMLs de notas fiscais (upload múltiplo)
app.post('/api/notas/processar', uploadXML.array('xmlFiles', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo XML enviado.' });
    }

    const resultados = [];
    const erros = [];

    for (const file of req.files) {
      try {
        const xmlString = file.buffer.toString('utf-8');
        const nota = nfeParser.parseNFeXML(xmlString);
        
        if (nota) {
          // Classificar a operação (Entrada ou Saída)
          // Usa o primeiro CNPJ de cliente ativo como referência
          const cnpjsEmpresa = (scanner.cache.clients || [])
            .map(c => (c.cnpj || '').replace(/\D/g, ''))
            .filter(c => c.length >= 11);
          
          let direcao = 'DESCONHECIDO';
          for (const cnpj of cnpjsEmpresa) {
            const dir = fiscalEngine.classificarOperacao(nota, cnpj);
            if (dir !== 'DESCONHECIDO') {
              direcao = dir;
              nota.cnpjEmpresa = cnpj;
              break;
            }
          }
          nota.direcao = direcao;
          nota.nomeArquivo = file.originalname;

          // Gerar lançamento contábil automático (partida dobrada)
          nota.lancamentoContabil = fiscalEngine.gerarLancamentoContabil(nota, {});

          // Salvar no SQLite e no motor fiscal
          db.salvarNota(nota);
          fiscalEngine.salvarNotaProcessada(nota);
          resultados.push(nota);
        } else {
          erros.push({ arquivo: file.originalname, erro: 'Não foi possível interpretar o XML.' });
        }
      } catch (parseErr) {
        erros.push({ arquivo: file.originalname, erro: parseErr.message });
      }
    }

    // Calcular resumo consolidado
    const resumo = {
      total: resultados.length,
      erros: erros.length,
      valorTotal: resultados.reduce((s, n) => s + (n.totais?.valorNota || 0), 0),
      totalICMS: resultados.reduce((s, n) => s + (n.totais?.valorICMS || 0), 0),
      totalPIS: resultados.reduce((s, n) => s + (n.totais?.valorPIS || 0), 0),
      totalCOFINS: resultados.reduce((s, n) => s + (n.totais?.valorCOFINS || 0), 0),
      totalIPI: resultados.reduce((s, n) => s + (n.totais?.valorIPI || 0), 0),
      entradas: resultados.filter(n => n.direcao === 'ENTRADA').length,
      saidas: resultados.filter(n => n.direcao === 'SAIDA').length
    };

    res.json({ success: true, notas: resultados, erros, resumo });
  } catch (err) {
    console.error('[Notas] Erro ao processar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Listar notas processadas (SQLite WAL)
app.get('/api/notas', (req, res) => {
  try {
    const notas = db.obterNotas();
    res.json({ success: true, notas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Limpar todas as notas processadas (SQLite WAL)
app.delete('/api/notas', (req, res) => {
  try {
    db.limparNotas();
    res.json({ success: true, message: 'Todas as notas foram removidas do banco de dados.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Função auxiliar para varredura recursiva segura de arquivos na rede SMB
function findFilesRecursively(dir, filterRegex, maxFiles = 100, currentList = []) {
  if (!fs.existsSync(dir) || currentList.length >= maxFiles) return currentList;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (currentList.length >= maxFiles) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findFilesRecursively(fullPath, filterRegex, maxFiles, currentList);
      } else if (entry.isFile() && filterRegex.test(entry.name)) {
        currentList.push(fullPath);
      }
    }
  } catch (e) {
    // Tratamento silencioso de pastas restritas ou lentas na rede
  }
  return currentList;
}

// Endpoint: Escanear e importar XMLs direto da pasta do cliente na rede SMB
app.post('/api/notas/escanear-rede', express.json(), async (req, res) => {
  try {
    const { clientId, folderPath } = req.body;
    let targetPath = folderPath;
    let clientObj = null;

    if (clientId) {
      clientObj = (scanner.cache.clients || []).find(c => c.id === clientId);
      if (clientObj) targetPath = clientObj.path;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: 'Pasta da empresa não encontrada na rede local.' });
    }

    const xmlFiles = findFilesRecursively(targetPath, /\.xml$/i, 100);
    if (xmlFiles.length === 0) {
      return res.json({ success: true, count: 0, notas: [], message: 'Nenhum arquivo XML encontrado na pasta desta empresa.' });
    }

    const clientCnpj = clientObj ? String(clientObj.cnpj || '').replace(/\D/g, '') : '';
    const resultados = [];
    const erros = [];

    for (const filePath of xmlFiles) {
      try {
        const nota = nfeParser.parseNFeFile(filePath);
        if (nota) {
          if (clientCnpj) {
            nota.direcao = fiscalEngine.classificarOperacao(nota, clientCnpj);
            nota.cnpjEmpresa = clientCnpj;
          }
          nota.nomeArquivo = path.basename(filePath);
          nota.lancamentoContabil = fiscalEngine.gerarLancamentoContabil(nota, {});
          db.salvarNota(nota);
          fiscalEngine.salvarNotaProcessada(nota);
          resultados.push(nota);
        }
      } catch (err) {
        erros.push({ arquivo: path.basename(filePath), erro: err.message });
      }
    }

    const resumo = {
      total: resultados.length,
      erros: erros.length,
      valorTotal: resultados.reduce((s, n) => s + (n.totais?.valorNota || 0), 0),
      totalICMS: resultados.reduce((s, n) => s + (n.totais?.valorICMS || 0), 0),
      totalPIS: resultados.reduce((s, n) => s + (n.totais?.valorPIS || 0), 0),
      totalCOFINS: resultados.reduce((s, n) => s + (n.totais?.valorCOFINS || 0), 0),
      totalIPI: resultados.reduce((s, n) => s + (n.totais?.valorIPI || 0), 0),
      entradas: resultados.filter(n => n.direcao === 'ENTRADA').length,
      saidas: resultados.filter(n => n.direcao === 'SAIDA').length
    };

    res.json({ success: true, count: resultados.length, notas: resultados, erros, resumo, pasta: targetPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Calcular imposto Simples Nacional
app.post('/api/notas/calcular-simples', express.json(), (req, res) => {
  try {
    const { receita12meses, valorNota, anexo } = req.body;
    const resultado = fiscalEngine.calcularImpostoSimples(receita12meses || 0, valorNota || 0, anexo || 1);
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Exportar Notas no Layout 19 oficial do Domínio Sistemas (Escrita Fiscal)
// Endpoint: Obter Configurações de Integração do Domínio Sistemas
app.get('/api/dominio/config', (req, res) => {
  try {
    const config = db.obterConfigDominio();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Salvar Configurações de Integração do Domínio Sistemas
app.post('/api/dominio/config', express.json(), (req, res) => {
  try {
    const atualizado = db.salvarLoteConfigDominio(req.body);
    res.json({ success: true, config: atualizado, message: 'Configurações do Domínio atualizadas com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Listar detalhes e códigos Domínio de todas as empresas
app.get('/api/empresas/detalhes', (req, res) => {
  try {
    const empresas = db.obterEmpresasDetalhes();
    res.json({ success: true, total: empresas.length, empresas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Salvar Código do Domínio para uma empresa específica
app.post('/api/empresas/codigo-dominio', express.json(), (req, res) => {
  const { id, codigoDominio } = req.body;
  if (!id || !codigoDominio) {
    return res.status(400).json({ success: false, error: 'ID e código do Domínio são obrigatórios.' });
  }
  const ok = db.salvarCodigoDominioEmpresa(id, codigoDominio);
  if (ok) {
    res.json({ success: true, message: `Código Domínio ${codigoDominio} salvo com sucesso!` });
  } else {
    res.status(500).json({ success: false, error: 'Erro ao salvar código no banco de dados SQLite.' });
  }
});

// ============================================================
// ENDPOINTS DE CONEXÃO DE REDE & ACESSO REMOTO / AUTOMÁTICO
// ============================================================

// Endpoint: Obter status e presets de conexão de rede
app.get('/api/rede/status', (req, res) => {
  try {
    const configSaved = db.obterConfigRede();
    const currentBase = scanner.getBasePath();
    const activePath = configSaved.endereco_ativo || currentBase;

    // Presets padrão reconhecidos pelo sistema
    const presets = [
      {
        id: 'drive_x',
        nome: 'Escritório: Drive X:\\ (Ultra Rápido)',
        tipo: 'LOCAL_DRIVE',
        endereco: 'X:\\',
        disponivel: fs.existsSync('X:\\'),
        descricao: 'Acesso direto ao drive mapeado na rede do escritório (Recomendado)'
      },
      {
        id: 'unc_rede',
        nome: 'Escritório: Rede SMB (\\\\192.168.15.2)',
        tipo: 'SMB_UNC',
        endereco: '\\\\192.168.15.2\\mc assessoria contabil',
        disponivel: fs.existsSync('\\\\192.168.15.2\\mc assessoria contabil'),
        descricao: 'Endereço de rede original do servidor local'
      },
      {
        id: 'local_c',
        nome: 'Pasta Local Offline (C:\\Contabil)',
        tipo: 'OFFLINE_FOLDER',
        endereco: 'C:\\Contabil',
        disponivel: fs.existsSync('C:\\Contabil'),
        descricao: 'Cópia de segurança ou pasta local na máquina'
      },
      {
        id: 'vpn_tailscale',
        nome: 'Acesso Remoto / Home Office (VPN)',
        tipo: 'VPN_REMOTE',
        endereco: configSaved.endereco_vpn || '\\\\mc-server-vpn\\contabil',
        disponivel: configSaved.endereco_vpn ? fs.existsSync(configSaved.endereco_vpn) : false,
        descricao: 'Conexão segura ponto-a-ponto via VPN Tailscale / WireGuard'
      }
    ];

    // Testa o endereço ativo
    let conectado = false;
    let latenciaMs = 0;
    const t0 = Date.now();
    try {
      if (fs.existsSync(activePath)) {
        conectado = true;
        latenciaMs = Date.now() - t0;
      }
    } catch (e) {
      conectado = false;
    }

    res.json({
      success: true,
      ativo: activePath,
      apelido: configSaved.apelido_ativo || (activePath.startsWith('X:') ? 'Drive X: (Escritório)' : 'Rede Local'),
      conectado,
      latenciaMs,
      autoConectar: configSaved.auto_conectar !== 'false',
      presets
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Testar um endereço específico de rede ou pasta
app.post('/api/rede/testar', express.json(), (req, res) => {
  try {
    const { endereco } = req.body;
    if (!endereco) {
      return res.status(400).json({ success: false, error: 'Endereço não informado.' });
    }

    const t0 = Date.now();
    const existe = fs.existsSync(endereco);
    const latenciaMs = Date.now() - t0;

    let subpastas = [];
    if (existe) {
      try {
        const itens = fs.readdirSync(endereco, { withFileTypes: true });
        subpastas = itens.filter(i => i.isDirectory()).slice(0, 10).map(i => i.name);
      } catch (e) {}
    }

    res.json({
      success: true,
      endereco,
      disponivel: existe,
      latenciaMs,
      subpastas,
      mensagem: existe ? `Conexão bem sucedida (${latenciaMs}ms). Pastas encontradas: ${subpastas.length}` : 'Endereço não acessível ou sem permissão na rede.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Conectar a um endereço e salvar para conectar sozinho
app.post('/api/rede/conectar', express.json(), (req, res) => {
  try {
    const { endereco, apelido, autoConectar } = req.body;
    if (!endereco) {
      return res.status(400).json({ success: false, error: 'Informe o endereço de conexão.' });
    }

    const cleanPath = String(endereco).trim();
    if (!fs.existsSync(cleanPath)) {
      return res.status(404).json({
        success: false,
        error: `Não foi possível conectar em "${cleanPath}". Verifique se o caminho existe, se a VPN está ativa ou se há permissão de rede.`
      });
    }

    // Atualiza o scanner
    scanner.setBasePath(cleanPath);

    // Salva configuração no SQLite para reconectar sozinho sempre
    db.salvarConfigRede(cleanPath, apelido || path.basename(cleanPath), autoConectar !== false);

    res.json({
      success: true,
      endereco: cleanPath,
      apelido: apelido || path.basename(cleanPath),
      mensagem: 'Conectado com sucesso! Este endereço será usado automaticamente ao abrir o sistema.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Exportar Notas no Layout 19 oficial do Domínio Sistemas (Escrita Fiscal)
app.get('/api/notas/exportar-dominio', (req, res) => {
  try {
    const notas = db.obterNotas();
    if (!notas || notas.length === 0) {
      return res.status(400).send('Nenhuma nota fiscal encontrada no banco de dados para exportar.');
    }
    const domConfig = db.obterConfigDominio();
    
    // Autodetecção da empresa vinculada no lote de notas
    let codigoEmpresa = req.query.codigoEmpresa;
    let cnpjEmpresa = req.query.cnpj || '';

    if (!codigoEmpresa || !cnpjEmpresa) {
      for (const n of notas) {
        const docAlvo = (n.direcao === 'ENTRADA' ? n.destinatario?.cnpj : n.emitente?.cnpj);
        if (docAlvo) {
          const emp = db.obterEmpresaPorCNPJ(docAlvo);
          if (emp) {
            cnpjEmpresa = cnpjEmpresa || emp.cnpj;
            if (emp.codigo_dominio) {
              codigoEmpresa = codigoEmpresa || emp.codigo_dominio;
              break;
            }
          }
        }
      }
    }

    codigoEmpresa = codigoEmpresa || domConfig.codigo_empresa_padrao || 1;
    const tipo = req.query.tipo || '02';

    const txt = fiscalEngine.gerarLayout19Notas(notas, {
      codigoEmpresa: parseInt(codigoEmpresa) || 1,
      cnpjEmpresa: cnpjEmpresa,
      tipoNotas: tipo,
      acumuladorCompra: domConfig.acumulador_compra,
      acumuladorVenda: domConfig.acumulador_venda,
      acumuladorUsoConsumo: domConfig.acumulador_uso_consumo,
      acumuladorServico: domConfig.acumulador_servico_tomado
    });
    
    res.setHeader('Content-Type', 'text/plain; charset=latin1');
    res.setHeader('Content-Disposition', `attachment; filename=MC_Dominio_Layout19_Notas_${new Date().toISOString().slice(0, 10)}.txt`);
    res.send(txt);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Exportar Fornecedores e Clientes no Layout 3 oficial do Domínio Sistemas
app.get('/api/notas/exportar-dominio-participantes', (req, res) => {
  try {
    const notas = db.obterNotas();
    if (!notas || notas.length === 0) {
      return res.status(400).send('Nenhuma nota fiscal encontrada no banco de dados para exportar fornecedores/clientes.');
    }
    const domConfig = db.obterConfigDominio();
    
    // Autodetecção da empresa vinculada no lote de notas
    let codigoEmpresa = req.query.codigoEmpresa;
    if (!codigoEmpresa) {
      for (const n of notas) {
        const docAlvo = (n.direcao === 'ENTRADA' ? n.destinatario?.cnpj : n.emitente?.cnpj);
        if (docAlvo) {
          const emp = db.obterEmpresaPorCNPJ(docAlvo);
          if (emp && emp.codigo_dominio) {
            codigoEmpresa = emp.codigo_dominio;
            break;
          }
        }
      }
    }

    codigoEmpresa = codigoEmpresa || domConfig.codigo_empresa_padrao || 1;

    const txt = fiscalEngine.gerarLayout3Participantes(notas, {
      codigoEmpresa: parseInt(codigoEmpresa) || 1
    });

    res.setHeader('Content-Type', 'text/plain; charset=latin1');
    res.setHeader('Content-Disposition', `attachment; filename=MC_Dominio_Layout3_Participantes_${new Date().toISOString().slice(0, 10)}.txt`);
    res.send(txt);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Listar Manuais Oficiais do Domínio Sistemas em C:\Contabil
app.get('/api/dominio/manuais', (req, res) => {
  try {
    const dir = 'C:\\Contabil';
    if (!fs.existsSync(dir)) {
      return res.json({ success: true, manuais: [] });
    }
    const files = fs.readdirSync(dir);
    const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf')).map(f => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      return {
        nome: f,
        tamanhoMB: (stat.size / (1024 * 1024)).toFixed(2),
        caminho: p
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome));

    res.json({ success: true, total: pdfs.length, manuais: pdfs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Abrir Manual do Domínio no leitor padrão do Windows
app.post('/api/dominio/manuais/abrir', express.json(), (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ success: false, error: 'Nome do manual não fornecido.' });
  const p = path.join('C:\\Contabil', path.basename(nome));
  if (!fs.existsSync(p)) {
    return res.status(404).json({ success: false, error: 'Manual não encontrado no disco.' });
  }
  exec(`start "" "${p}"`, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: `Manual "${nome}" aberto com sucesso!` });
  });
});

// ============================================================
// ROTAS - EXTRATOS BANCÁRIOS & CONCILIAÇÃO CONTÁBIL (PDF / OFX)
// ============================================================

// Endpoint: Processar Extratos Bancários (PDF / OFX com IA e Conciliação)
app.post('/api/extratos/processar', uploadExtratos.array('extratoFiles', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo de extrato enviado.' });
    }

    const extratosProcessados = [];
    const erros = [];

    for (const file of req.files) {
      try {
        const nome = file.originalname.toLowerCase();
        let resultado = null;

        if (nome.endsWith('.ofx')) {
          const conteudoOFX = file.buffer.toString('latin1');
          resultado = extratosEngine.parseOFX(conteudoOFX, file.originalname);
        } else if (nome.endsWith('.pdf')) {
          resultado = await extratosEngine.parsePDF(file.buffer, file.originalname);
        } else {
          erros.push({ arquivo: file.originalname, erro: 'Formato não suportado. Envie arquivos .pdf ou .ofx' });
          continue;
        }

        if (resultado) {
          db.salvarTransacoesExtrato(resultado.transacoes || [], file.originalname);
          extratosEngine.salvarExtratoProcessado(resultado);
          extratosProcessados.push(resultado);
        }
      } catch (errParse) {
        erros.push({ arquivo: file.originalname, erro: errParse.message });
      }
    }

    // Consolidação de transações e totais a partir do SQLite
    const todasTransacoes = db.obterTransacoesExtrato();
    const resumo = {
      totalArquivos: extratosProcessados.length,
      totalLancamentos: todasTransacoes.length,
      totalEntradas: todasTransacoes.filter(t => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0),
      totalSaidas: todasTransacoes.filter(t => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0),
      saldoLiquido: todasTransacoes.reduce((s, t) => s + (t.valorOriginal || 0), 0),
      totalTarifas: todasTransacoes.filter(t => t.conciliacao?.categoria === 'DESPESA_BANCARIA').reduce((s, t) => s + t.valor, 0),
      erros: erros.length
    };

    res.json({
      success: true,
      extratos: extratosProcessados,
      transacoes: todasTransacoes,
      resumo,
      erros
    });
  } catch (err) {
    console.error('[Extratos] Erro geral ao processar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Escanear e importar extratos (.ofx/.pdf) direto da pasta do cliente na rede SMB
app.post('/api/extratos/escanear-rede', express.json(), async (req, res) => {
  try {
    const { clientId, folderPath } = req.body;
    let targetPath = folderPath;
    let clientObj = null;

    if (clientId) {
      clientObj = (scanner.cache.clients || []).find(c => c.id === clientId);
      if (clientObj) targetPath = clientObj.path;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: 'Pasta da empresa não encontrada na rede local.' });
    }

    const extratoFiles = findFilesRecursively(targetPath, /\.(ofx|pdf)$/i, 50);
    if (extratoFiles.length === 0) {
      return res.json({ success: true, count: 0, transacoes: [], message: 'Nenhum arquivo OFX ou PDF encontrado na pasta desta empresa.' });
    }

    const extratosProcessados = [];
    const erros = [];

    for (const filePath of extratoFiles) {
      try {
        const nome = path.basename(filePath).toLowerCase();
        let resultado = null;

        if (nome.endsWith('.ofx')) {
          const conteudoOFX = fs.readFileSync(filePath, 'latin1');
          resultado = extratosEngine.parseOFX(conteudoOFX, path.basename(filePath));
        } else if (nome.endsWith('.pdf')) {
          const buffer = fs.readFileSync(filePath);
          resultado = await extratosEngine.parsePDF(buffer, path.basename(filePath));
        }

        if (resultado && resultado.transacoes && resultado.transacoes.length > 0) {
          db.salvarTransacoesExtrato(resultado.transacoes, path.basename(filePath));
          extratosEngine.salvarExtratoProcessado(resultado);
          extratosProcessados.push(resultado);
        }
      } catch (errParse) {
        erros.push({ arquivo: path.basename(filePath), erro: errParse.message });
      }
    }

    const todasTransacoes = db.obterTransacoesExtrato();
    res.json({
      success: true,
      count: extratosProcessados.length,
      extratos: extratosProcessados,
      transacoes: todasTransacoes,
      erros,
      pasta: targetPath
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Listar histórico de extratos processados (SQLite WAL)
app.get('/api/extratos/processados', (req, res) => {
  try {
    const todasTransacoes = db.obterTransacoesExtrato();
    const resumo = {
      totalArquivos: 0,
      totalLancamentos: todasTransacoes.length,
      totalEntradas: todasTransacoes.filter(t => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0),
      totalSaidas: todasTransacoes.filter(t => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0),
      saldoLiquido: todasTransacoes.reduce((s, t) => s + (t.valorOriginal || 0), 0),
      totalTarifas: todasTransacoes.filter(t => t.conciliacao?.categoria === 'DESPESA_BANCARIA').reduce((s, t) => s + t.valor, 0)
    };
    res.json({ success: true, extratos: [], transacoes: todasTransacoes, resumo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Limpar histórico de extratos (SQLite WAL)
app.delete('/api/extratos/processados', (req, res) => {
  try {
    db.limparExtratos();
    extratosEngine.limparExtratosProcessados();
    res.json({ success: true, message: 'Histórico de extratos removido com sucesso do banco de dados.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROTAS - DEPARTAMENTO PESSOAL (FOLHA & eSOCIAL)
// ============================================================

// Endpoint: Processar XMLs de Folha / eSocial (upload múltiplo)
app.post('/api/folha/processar', uploadXML.array('xmlFiles', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo XML enviado.' });
    }

    const resultados = [];
    const erros = [];

    for (const file of req.files) {
      try {
        const xmlString = file.buffer.toString('utf-8');
        const evento = esocialParser.parseEsocialXML(xmlString, file.originalname);
        if (evento && evento.success) {
          resultados.push(evento);
        } else {
          erros.push({ arquivo: file.originalname, erro: evento.error || 'Não foi possível interpretar o XML.' });
        }
      } catch (parseErr) {
        erros.push({ arquivo: file.originalname, erro: parseErr.message });
      }
    }

    // Salvar no SQLite (modo WAL)
    db.salvarEventosFolha(resultados);

    // Salvar backup no arquivo JSON
    try {
      const dbPath = path.join(__dirname, 'folha_processada.json');
      let historico = [];
      if (fs.existsSync(dbPath)) {
        try { historico = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch(e) {}
      }
      const novos = resultados.map(r => ({ ...r, dataProcessamento: new Date().toISOString() }));
      historico = [...novos, ...historico].slice(0, 500);
      fs.writeFileSync(dbPath, JSON.stringify(historico, null, 2), 'utf8');
    } catch(e) {}

    // Calcular resumo consolidado
    const s1200List = resultados.filter(r => r.evento === 'S-1200');
    const s2200List = resultados.filter(r => r.evento === 'S-2200');
    const s2299List = resultados.filter(r => r.evento === 'S-2299');
    const totalizacoes = resultados.filter(r => r.evento === 'S-5001' || r.evento === 'S-5011');

    const totalProventos = s1200List.reduce((s, r) => s + (r.detalhes?.totalProventos || 0), 0);
    const totalDescontos = s1200List.reduce((s, r) => s + (r.detalhes?.totalDescontos || 0), 0);
    const totalLiquido = s1200List.reduce((s, r) => s + (r.detalhes?.valorLiquido || 0), 0);
    const totalDCTFWeb = totalizacoes.reduce((s, r) => s + (r.detalhes?.totalDCTFWeb || 0), 0);

    const resumo = {
      totalArquivos: resultados.length,
      erros: erros.length,
      totalProventos,
      totalDescontos,
      totalLiquido,
      totalDCTFWeb,
      admissoes: s2200List.length,
      demissoes: s2299List.length,
      folhasTrabalhadores: s1200List.length
    };

    res.json({ success: true, eventos: resultados, erros, resumo });
  } catch (err) {
    console.error('[Folha] Erro ao processar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Listar histórico de folha / eSocial (SQLite WAL)
app.get('/api/folha', (req, res) => {
  try {
    const eventos = db.obterEventosFolha();
    res.json({ success: true, eventos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Limpar histórico de folha (SQLite WAL)
app.delete('/api/folha', (req, res) => {
  try {
    db.limparFolha();
    const dbPath = path.join(__dirname, 'folha_processada.json');
    if (fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]', 'utf8');
    res.json({ success: true, message: 'Histórico da folha limpo com sucesso do banco de dados.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Esquema de Tabelas FO do Domínio
app.get('/api/folha/schema', (req, res) => {
  try {
    const schemaPath = path.join(__dirname, 'dominio_fo_schema.json');
    if (fs.existsSync(schemaPath)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      res.json({ success: true, schema });
    } else {
      res.json({ success: false, error: 'Schema não gerado ainda.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Auditoria das Pastas de Pessoal / DP na Rede
app.get('/api/folha/auditoria-pastas', (req, res) => {
  try {
    const clients = scanner.cache.clients || [];
    const relatorio = [];

    for (const c of clients) {
      if (!c.active) continue;
      const clientPath = c.path;
      if (!clientPath || !fs.existsSync(clientPath)) continue;

      const dpFolderCandidates = ['PESSOAL', 'DEPARTAMENTO PESSOAL', 'DP'];
      let dpPath = null;
      for (const f of dpFolderCandidates) {
        const p = path.join(clientPath, f);
        if (fs.existsSync(p)) { dpPath = p; break; }
      }

      if (!dpPath) {
        relatorio.push({
          clienteId: c.id,
          nome: c.name,
          razao: c.razaoOficial || c.name,
          regime: c.regimeLabel,
          statusDP: 'SEM_PASTA_PESSOAL',
          subpastas: [],
          conformidadeDP: 0
        });
        continue;
      }

      let subs = [];
      try { subs = fs.readdirSync(dpPath); } catch(e) {}
      const subsUpper = subs.map(s => s.toUpperCase());

      const hasFolha = subsUpper.some(s => s.includes('FOLHA'));
      const hasAdmissoes = subsUpper.some(s => s.includes('ADMIS'));
      const hasRescisoes = subsUpper.some(s => s.includes('RESCIS'));
      const hasDeclaracoes = subsUpper.some(s => s.includes('DECLAR') || s.includes('ESOCIAL') || s.includes('SEFIP'));

      let conformidade = 0;
      if (hasFolha) conformidade += 25;
      if (hasAdmissoes) conformidade += 25;
      if (hasRescisoes) conformidade += 25;
      if (hasDeclaracoes) conformidade += 25;

      relatorio.push({
        clienteId: c.id,
        nome: c.name,
        razao: c.razaoOficial || c.name,
        regime: c.regimeLabel,
        dpPath,
        subpastas: subs,
        hasFolha,
        hasAdmissoes,
        hasRescisoes,
        hasDeclaracoes,
        conformidadeDP: conformidade,
        statusDP: conformidade === 100 ? 'COMPLETA' : conformidade >= 50 ? 'PARCIAL' : 'PENDENTE'
      });
    }

    res.json({
      success: true,
      totalAuditados: relatorio.length,
      completas: relatorio.filter(r => r.statusDP === 'COMPLETA').length,
      parciais: relatorio.filter(r => r.statusDP === 'PARCIAL').length,
      pendentes: relatorio.filter(r => r.statusDP === 'PENDENTE' || r.statusDP === 'SEM_PASTA_PESSOAL').length,
      empresas: relatorio
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROTAS - HUB PRINCIPAL
// ============================================================

// Endpoint: Status da conexão e última sincronização
app.get('/api/status', (req, res) => {
  const isNetworkAccessible = fs.existsSync('\\\\192.168.15.2\\mc assessoria contabil');
  res.json({
    online: isNetworkAccessible,
    networkPath: '\\\\192.168.15.2\\mc assessoria contabil',
    lastScan: scanner.cache.lastScan,
    isScanning: scanner.cache.isScanning,
    totalClients: scanner.cache.clients.length
  });
});

// Endpoint: Estatísticas consolidadas
app.get('/api/stats', (req, res) => {
  res.json(scanner.cache.stats || {});
});

// Endpoint: Lista de Clientes com busca e filtros rápidos
app.get('/api/clients', (req, res) => {
  let list = scanner.cache.clients || [];
  const { search, regime, compliance, active, sort } = req.query;

  if (search) {
    const q = search.toLowerCase().trim();
    const numQ = q.replace(/\D/g, '');
    list = list.filter(c => 
      c.name.toLowerCase().includes(q) ||
      (c.razaoOficial && c.razaoOficial.toLowerCase().includes(q)) ||
      (numQ.length >= 3 && c.cnpj && c.cnpj.includes(numQ)) ||
      (c.cnpjFormatted && c.cnpjFormatted.includes(q)) ||
      (c.ie && c.ie.includes(q)) ||
      (c.municipio && c.municipio.toLowerCase().includes(q)) ||
      (c.uf && c.uf.toLowerCase().includes(q)) ||
      (c.inscrMobiliaria && c.inscrMobiliaria.toLowerCase().includes(q))
    );
  }

  if (regime && regime !== 'ALL') {
    list = list.filter(c => c.regime === regime);
  }

  if (compliance && compliance !== 'ALL') {
    list = list.filter(c => c.compliance.status === compliance);
  }

  if (active !== undefined && active !== 'ALL') {
    const isActive = active === 'true';
    list = list.filter(c => c.active === isActive);
  }

  // Ordenação
  if (sort === 'name_asc') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'name_desc') {
    list.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sort === 'date_desc') {
    list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  } else if (sort === 'date_asc') {
    list.sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified));
  } else {
    // Padrão: por nome alfabético
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  res.json({
    total: list.length,
    clients: list
  });
});

// Endpoint: Detalhes de um cliente específico (árvore de diretórios)
app.get('/api/clients/:id', (req, res) => {
  try {
    const client = scanner.cache.clients.find(c => c.id === req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado no cadastro' });
    }

    const details = scanner.getClientDetails(client.path);
    res.json({
      client,
      details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Abrir pasta do cliente no Windows Explorer
app.post('/api/clients/open', (req, res) => {
  const { path: folderPath, id, name } = req.body;
  let targetPath = folderPath;

  if (!targetPath && (id || name)) {
    const client = scanner.cache.clients.find(c => c.id === id || c.name === name || c.name === id);
    if (client) targetPath = client.path;
  }

  if (!targetPath) {
    return res.status(400).json({ error: 'Caminho ou identificador da pasta não fornecido' });
  }

  // Se a unidade mapeada X:\ estiver montada, converte o caminho UNC para a letra X:
  if (fs.existsSync('X:\\')) {
    targetPath = targetPath.replace(/^(\\\\\\\\|\\\\|\/\/|\/)?192\.168\.15\.2[\\\/]+mc assessoria contabil/i, 'X:');
    targetPath = path.normalize(targetPath);
  }
  targetPath = targetPath.replace(/\//g, '\\');

  let finalPath = targetPath;
  if (!fs.existsSync(finalPath)) {
    const parentDir = path.dirname(finalPath);
    if (fs.existsSync(parentDir)) {
      finalPath = parentDir;
    } else {
      return res.status(404).json({ error: `Pasta não encontrada no disco: ${finalPath}` });
    }
  }

  console.log(`[Abrir Pasta] Abrindo no Windows Explorer: "${finalPath}"`);

  try {
    // Método 1: PowerShell Invoke-Item com -LiteralPath (mais confiável no Windows para abrir na pasta exata sem problemas de '&' ou acentos)
    const escaped = finalPath.replace(/'/g, "''");
    exec(`powershell.exe -NoProfile -Command "Invoke-Item -LiteralPath '${escaped}'"`, (psErr) => {
      if (psErr) {
        // Fallback: spawn explorer.exe direto
        try {
          const child = spawn('explorer.exe', [finalPath], { detached: true, stdio: 'ignore' });
          child.unref();
        } catch (e) {
          exec(`start "" "${finalPath}"`, { shell: 'cmd.exe' }, () => {});
        }
      }
    });

    res.json({ 
      success: true, 
      path: finalPath,
      message: `Pasta aberta: ${finalPath}` 
    });
  } catch (err) {
    console.error('Erro ao abrir pasta:', err.message);
    res.status(500).json({ error: `Erro ao abrir Explorer: ${err.message}` });
  }
});

// ============================================================
// EXPLORADOR DE PASTAS E ARQUIVOS DIRETO NA WEB (MONETRA STYLE)
// ============================================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Endpoint: Navegar em qualquer pasta direto na web
app.get('/api/explorer/browse', (req, res) => {
  try {
    let targetPath = req.query.path || '';
    const clientId = req.query.clientId || '';

    if (!targetPath && clientId) {
      const client = (scanner.cache.clients || []).find(c => c.id === clientId);
      if (client) targetPath = client.path;
    }

    if (!targetPath) {
      targetPath = scanner.getBasePath();
    }

    // Normalização para Windows (converte para X: se disponível)
    if (fs.existsSync('X:\\')) {
      targetPath = targetPath.replace(/^(\\\\\\\\|\\\\|\/\/|\/)?192\.168\.15\.2[\\\/]+mc assessoria contabil/i, 'X:');
    }
    targetPath = path.normalize(targetPath);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: `Pasta não encontrada: ${targetPath}` });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      targetPath = path.dirname(targetPath);
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const pastas = [];
    const arquivos = [];

    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      try {
        if (entry.isDirectory()) {
          let subCount = 0;
          try {
            subCount = fs.readdirSync(fullPath).length;
          } catch(e) {}
          pastas.push({
            name: entry.name,
            path: fullPath,
            count: subCount
          });
        } else if (entry.isFile()) {
          const fileStat = fs.statSync(fullPath);
          const ext = path.extname(entry.name).toLowerCase();
          arquivos.push({
            name: entry.name,
            path: fullPath,
            size: fileStat.size,
            sizeFormatted: formatBytes(fileStat.size),
            ext,
            mtime: fileStat.mtime,
            isPdf: ext === '.pdf',
            isXml: ext === '.xml',
            isSpreadsheet: ['.xlsx', '.xls', '.csv'].includes(ext),
            isImage: ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
          });
        }
      } catch (errEntry) {}
    }

    pastas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    arquivos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));

    const partes = targetPath.split(path.sep).filter(Boolean);
    const breadcrumbs = [];
    let acum = '';
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i];
      if (i === 0 && p.includes(':')) {
        acum = p + path.sep;
      } else {
        acum = path.join(acum, p);
      }
      breadcrumbs.push({ name: p, path: acum });
    }

    const parentPath = path.dirname(targetPath);
    const hasParent = parentPath && parentPath !== targetPath && fs.existsSync(parentPath);

    res.json({
      success: true,
      currentPath: targetPath,
      parentPath: hasParent ? parentPath : null,
      breadcrumbs,
      totalPastas: pastas.length,
      totalArquivos: arquivos.length,
      pastas,
      arquivos
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Visualizar ou Baixar arquivo da pasta
app.get('/api/explorer/file', (req, res) => {
  try {
    let filePath = req.query.path || '';
    if (!filePath) {
      return res.status(400).send('Caminho do arquivo não fornecido.');
    }

    if (fs.existsSync('X:\\')) {
      filePath = filePath.replace(/^(\\\\\\\\|\\\\|\/\/|\/)?192\.168\.15\.2[\\\/]+mc assessoria contabil/i, 'X:');
    }
    filePath = path.normalize(filePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Arquivo não encontrado no servidor de rede.');
    }

    const filename = path.basename(filePath);
    const isDownload = req.query.download === '1';

    if (isDownload) {
      res.download(filePath, filename);
    } else {
      res.sendFile(filePath);
    }
  } catch (err) {
    res.status(500).send(`Erro ao abrir arquivo: ${err.message}`);
  }
});

// Endpoint: Criar nova pasta de cliente padronizada
app.post('/api/clients/create', (req, res) => {
  try {
    const { regime, clientName, cnpj } = req.body;

    if (!regime || !clientName) {
      return res.status(400).json({ error: 'Regime tributário e Nome da Empresa são obrigatórios' });
    }

    const result = scanner.createClientFolder(regime, clientName, cnpj);
    saveLocalCache();

    res.json({
      success: true,
      message: `Cliente "${result.clientName}" criado com sucesso com todas as pastas oficiais!`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Padronizar pastas de cliente existente
app.post('/api/clients/standardize', (req, res) => {
  try {
    const { id, path: clientPath, regime } = req.body;
    let target = clientPath;
    let reg = regime;

    if (id) {
      const client = scanner.cache.clients.find(c => c.id === id);
      if (client) {
        target = client.path;
        reg = client.regime;
      }
    }

    if (!target) {
      return res.status(400).json({ error: 'Identificador ou caminho do cliente não fornecido' });
    }

    const result = scanner.standardizeClientFolder(target, reg);
    saveLocalCache();

    res.json({
      success: true,
      message: `Pastas padronizadas! Foram criadas ${result.totalCreated} pastas faltantes.`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Alterar status do cliente na carteira (Ativa / Ex-Cliente / Paralisada)
app.post('/api/clients/:id/status', (req, res) => {
  try {
    const { status, obs } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status é obrigatório (ATIVA, EX_CLIENTE, PARALISADA)' });
    }

    const result = scanner.updateClientStatus(req.params.id, status, obs);
    saveLocalCache();

    res.json({
      success: true,
      message: `Status de "${result.client.name}" atualizado para: ${status}`,
      client: result.client,
      stats: result.stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Padronização em Lote
app.post('/api/clients/standardize-batch', (req, res) => {
  try {
    const { clientIds } = req.body;
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum cliente selecionado para padronização' });
    }

    let count = 0;
    const errors = [];

    for (const id of clientIds) {
      const client = scanner.cache.clients.find(c => c.id === id);
      if (client) {
        try {
          scanner.standardizeClientFolder(client.path, client.regime);
          count++;
        } catch (e) {
          errors.push({ name: client.name, error: e.message });
        }
      }
    }

    saveLocalCache();
    res.json({
      success: true,
      totalPadronizados: count,
      erros: errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Forçar sincronização da rede
app.post('/api/sync', async (req, res) => {
  if (scanner.cache.isScanning) {
    return res.json({ message: 'Varredura já está em andamento', isScanning: true });
  }

  // Dispara em background para resposta rápida
  scanner.scanNetwork().then(() => {
    saveLocalCache();
  }).catch(err => {
    console.error('Erro na varredura:', err.message);
  });

  res.json({ message: 'Sincronização iniciada com sucesso em segundo plano!', isScanning: true });
});

// Endpoint: Exportar Excel consolidado
app.get('/api/export/excel', (req, res) => {
  try {
    const buffer = scanner.generateExcel();
    const filename = `Clientes_MC_Assessoria_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: SSE Stream do Robô Sentinela em Tempo Real
app.get('/api/feed/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (res.flushHeaders) res.flushHeaders();
  networkWatcher.addSseClient(res);
});

// Endpoint: Histórico de Eventos Recentes do Sentinela
app.get('/api/feed/recent', (req, res) => {
  res.json({
    stats: networkWatcher.getStats(),
    events: networkWatcher.getRecentEvents()
  });
});

// Endpoint: Busca Global Instantânea de Arquivos da Rede
app.get('/api/search/files', (req, res) => {
  const q = req.query.q || '';
  const category = req.query.category || 'ALL';
  const limit = parseInt(req.query.limit) || 100;
  const results = deepCrawler.search(q, { category, limit });
  res.json({
    query: q,
    category,
    total: results.length,
    results
  });
});

// Endpoint: Estatísticas da Varredura Profunda
app.get('/api/audit/deep-stats', (req, res) => {
  res.json({
    summary: deepCrawler.index.summary || {},
    byCategory: deepCrawler.index.byCategory || {},
    isAuditing: deepCrawler.isAuditing,
    progress: deepCrawler.progress
  });
});

// Endpoint: Certificados Digitais Encontrados
app.get('/api/audit/certificates', (req, res) => {
  const certs = deepCrawler.index.certificates || [];
  res.json(certs);
});

// Endpoint: Disparar Varredura Profunda
app.post('/api/audit/run-deep', (req, res) => {
  if (deepCrawler.isAuditing) {
    return res.json({ message: 'Varredura profunda já está em andamento!', isAuditing: true });
  }
  deepCrawler.runDeepAudit().catch(err => console.error('Erro na varredura profunda:', err.message));
  res.json({ message: 'Varredura profunda iniciada com sucesso em segundo plano!', isAuditing: true });
});

// Endpoint: Renovações de Licenças (VISA & Prefeituras)
app.get('/api/renovacoes', (req, res) => {
  const renovacoes = scanner.cache.spreadsheets.renovacoes || [];
  const enriched = renovacoes.map(ren => {
    const client = scanner.cache.clients.find(c => {
      if (c.licenca && c.licenca.empresa === ren.empresa) return true;
      const cleanC = cleanName(c.name);
      const cleanR = cleanName(ren.empresa);
      return cleanC.includes(cleanR) || cleanR.includes(cleanC);
    });
    return {
      ...ren,
      clientId: client ? client.id : null,
      clientName: client ? client.name : ren.empresa,
      clientPath: client ? client.path : null,
      cnpj: client ? client.cnpjFormatted || client.cnpj : '',
      regime: ren.regime || (client ? client.regime : 'SIMPLES_NACIONAL')
    };
  });
  res.json(enriched);
});

// Alias para compatibilidade
app.get('/api/licencas', (req, res) => {
  res.redirect('/api/renovacoes');
});

// Alias para eventos do Sentinela
app.get('/api/sentinela/recent', (req, res) => {
  res.redirect('/api/feed/recent');
});

// Endpoint: Extratos Bancários (Dona Malvina Contábil)
app.get('/api/extratos', (req, res) => {
  const extratos = scanner.cache.spreadsheets.extratos || [];
  const enriched = extratos.map(ext => {
    const client = scanner.cache.clients.find(c => {
      const cleanC = cleanName(c.name);
      const cleanE = cleanName(ext.empresa);
      return cleanC.includes(cleanE) || cleanE.includes(cleanC);
    });
    return {
      ...ext,
      clientId: client ? client.id : null,
      clientPath: client ? client.path : null,
      cnpj: client ? client.cnpjFormatted || client.cnpj : ''
    };
  });
  res.json(enriched);
});

// Endpoint: Cofre de Senhas e Acessos do Escritório (Agrega todas as planilhas de credenciais)
app.get('/api/senhas', (req, res) => {
  const { categoria, q } = req.query;
  const sp = scanner.cache.spreadsheets || {};
  let list = [];
  const seen = new Set();

  function addSenha(item, categoriaDefault, tipoDefault) {
    if (!item) return;
    const empresa = item.empresa || item.empresaOuServico || item.razaoSocial || item.nome || '';
    const usuario = item.usuario || item.login || item.cnpj || item.cpf || '';
    const senha = item.senha || item.senhaSefa || item.senhaSimples || item.senhaGov || item.codigo || '';
    const obs = item.obs || item.observacao || item.cidadeUf || item.fic || '';
    const tipo = item.tipo || item.categoria || tipoDefault || 'GERAL';
    const cat = item.categoria || categoriaDefault || tipoDefault || 'GERAL';

    if (!senha && !usuario) return;
    const key = `${empresa}|${usuario}|${senha}`;
    if (seen.has(key)) return;
    seen.add(key);

    list.push({
      id: list.length + 1,
      empresa: empresa || 'Diversos',
      usuario: usuario || '-',
      senha: senha || '-',
      tipo: tipo,
      categoria: cat,
      obs: obs || ''
    });
  }

  // Combina todas as planilhas do escritório
  (sp.senhas || []).forEach(s => addSenha(s, 'ESCRITORIO', 'ESCRITÓRIO'));
  (sp.senhasPrefeituras || []).forEach(s => addSenha(s, 'PREFEITURAS', 'PREFEITURA'));
  (sp.senhasSefa || []).forEach(s => {
    if (s.senhaSefa) addSenha({ ...s, senha: s.senhaSefa, usuario: s.cnpj || s.cpf }, 'SEFA', 'SEFA');
    if (s.senhaGov) addSenha({ ...s, senha: s.senhaGov, usuario: s.cpf || s.cnpj }, 'GOV', 'GOV');
  });
  (sp.senhasSimples || []).forEach(s => addSenha(s, 'SIMPLES', 'SIMPLES NACIONAL'));
  (sp.senhasPrefSefa || []).forEach(s => addSenha(s, 'PREFEITURAS', 'PREFEITURA / SEFA'));
  (sp.senhasCadEco || []).forEach(s => addSenha(s, 'PREFEITURAS', 'CAD. ECONÔMICO'));
  (sp.senhasDiversas || []).forEach(s => addSenha(s, 'DIVERSAS', 'DIVERSOS'));

  if (categoria && categoria !== 'ALL') {
    list = list.filter(s => 
      (s.categoria && s.categoria.toUpperCase().includes(categoria.toUpperCase())) || 
      (s.tipo && s.tipo.toUpperCase().includes(categoria.toUpperCase()))
    );
  }
  if (q) {
    const query = q.toLowerCase();
    list = list.filter(s => 
      s.empresa.toLowerCase().includes(query) ||
      s.usuario.toLowerCase().includes(query) ||
      s.tipo.toLowerCase().includes(query) ||
      s.obs.toLowerCase().includes(query)
    );
  }
  res.json(list);
});

// Endpoint: Bombeiros e Alvarás
app.get('/api/bombeiros', (req, res) => {
  res.json(scanner.cache.spreadsheets.bombeiros || []);
});

// Endpoint: Parcelamentos
app.get('/api/parcelamentos', (req, res) => {
  res.json(scanner.cache.spreadsheets.parcelamentos || []);
});

// Endpoint: IRPF
app.get('/api/irpf', (req, res) => {
  res.json(scanner.cache.irpf || []);
});

// Endpoint: Links Oficiais de Licenças e Prefeituras
app.get('/api/licencas-links', (req, res) => {
  const links = [
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Castanhal / PA',
      url: 'https://sefin.castanhal.pa.gov.br/ecis/paginas/publico/fm_impressao_guia_alvara.xhtml',
      descricao: 'Emissão de Guia de Taxa Sanitária (DAM) e Alvará de Funcionamento',
      tag: 'Principal'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Belém / PA',
      url: 'https://financas.belem.pa.gov.br/areas/tlpl/',
      descricao: 'Taxa de Licença para Localização e Funcionamento (TLPL)'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Ananindeua / PA',
      url: 'https://ananindeua-pa.desenvolvecidade.com.br/empresadigital/acessoSistema.jsf',
      descricao: 'Portal Empresa Digital - Alvará e Tributos'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Benevides / PA',
      url: 'https://benevides.desenvolvecidade.com.br/empresadigital/acessoSistema.jsf',
      descricao: 'Portal Empresa Digital - Alvarás e Licenciamento'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Parauapebas / PA',
      url: 'https://parauapebas.desenvolvecidade.com.br/empresadigital/home.jsf',
      descricao: 'Portal Empresa Digital Parauapebas'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Marabá / PA',
      url: 'https://portaldocontribuinte.maraba.pa.gov.br/',
      descricao: 'Portal do Contribuinte Marabá'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'Óbidos / PA',
      url: 'https://obidos-pa.desenvolvecidade.com.br/desenvolvecidade/#/dashboard',
      descricao: 'Desenvolve Cidade Óbidos'
    },
    {
      categoria: 'Prefeituras (Alvará & Taxas)',
      municipio: 'São Pedro da Aldeia / RJ',
      url: 'https://e-gov.pmspa.rj.gov.br/?serv=224',
      descricao: 'Portal Tributário PM-SPA'
    },
    {
      categoria: 'Órgãos GOV (Certidões & CNPJ)',
      municipio: 'Federal / Receita',
      url: 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp',
      descricao: 'Emissão de Comprovante de CNPJ Atualizado'
    },
    {
      categoria: 'Órgãos GOV (Certidões & CNPJ)',
      municipio: 'Federal / PGFN',
      url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
      descricao: 'Certidão Negativa de Débitos Federais e Dívida Ativa'
    },
    {
      categoria: 'Órgãos GOV (Certidões & CNPJ)',
      municipio: 'Estadual / SEFA-PA',
      url: 'https://app.sefa.pa.gov.br/emissao-certidao/conInternaCertidao.action',
      descricao: 'Certidão Negativa de Débitos Estaduais (SEFA-PA)'
    },
    {
      categoria: 'Órgãos GOV (Certidões & CNPJ)',
      municipio: 'Caixa / FGTS',
      url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      descricao: 'Certidão de Regularidade do FGTS (CRF)'
    }
  ];
  res.json(links);
});

// Endpoint: Auditoria do Dossiê da Vigilância Sanitária (VISA) de um Cliente
app.get('/api/clients/:id/dossie-visa', (req, res) => {
  try {
    const client = scanner.cache.clients.find(c => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    // Coleta todos os arquivos dentro da pasta do cliente (recursivo até 3 níveis)
    const files = [];
    function scanDir(dir, depth = 0) {
      if (depth > 3 || !fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(dir, e.name);
          if (e.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else {
            files.push({ name: e.name, path: fullPath, lower: e.name.toLowerCase() });
          }
        }
      } catch (err) {}
    }
    scanDir(client.path);

    // Definição dos 12 itens do Dossiê VISA
    const itemsDefs = [
      { id: 1, label: 'Requerimento VISA Assinado', regex: /requerimento.*visa/i, obrigatorio: true },
      { id: 2, label: 'Cartão CNPJ Atualizado', regex: /cnpj.*(atualizado|cartao)|cartao.*cnpj/i, obrigatorio: true },
      { id: 3, label: 'CNH / Documento do Sócio', regex: /cnh|rg|doc.*socio|documento.*socio/i, obrigatorio: true },
      { id: 4, label: 'Contrato Social Registrado', regex: /contrato.*social/i, obrigatorio: true },
      { id: 5, label: 'Certidão Negativa de Débitos (CND)', regex: /certidao.*negativa|cnd/i, obrigatorio: true },
      { id: 6, label: 'Taxa / Comprovante VISA (DAM)', regex: /boleto.*visa|taxa.*vigilancia|guia.*recolhimento|comprovante.*visa/i, obrigatorio: true },
      { id: 7, label: 'Habite-se / Bombeiros (CCB)', regex: /bombeiro|habite-se|cbmpa/i, obrigatorio: true },
      { id: 8, label: 'Declaração Limpeza de Caixa d\'Água', regex: /cx.*dagua|caixa.*dagua|caixa.*d.gua/i, obrigatorio: true },
      { id: 9, label: 'Controle de Pragas / Dedetização', regex: /praga|dedetizacao|desinsetizacao|laudo.*execuc/i, obrigatorio: true },
      { id: 10, label: 'Curso de Boas Práticas', regex: /curso|boas.*pratica|manipulacao/i, obrigatorio: true },
      { id: 11, label: 'Dispensa / Meio Ambiente (SEMMA)', regex: /semma|meio.*ambiente|dispensa|dla/i, obrigatorio: false },
      { id: 12, label: 'Alvará Sanitário Anterior / Histórico', regex: /alvara.*visa|alvara.*provisorio/i, obrigatorio: false }
    ];

    const checklist = itemsDefs.map(def => {
      const match = files.find(f => def.regex.test(f.lower));
      return {
        id: def.id,
        label: def.label,
        obrigatorio: def.obrigatorio,
        status: match ? 'PRESENTE' : 'PENDENTE',
        fileName: match ? match.name : null,
        filePath: match ? match.path : null
      };
    });

    const presentes = checklist.filter(c => c.status === 'PRESENTE').length;
    const total = checklist.length;
    const percent = Math.round((presentes / total) * 100);

    res.json({
      client: {
        id: client.id,
        name: client.name,
        cnpj: client.cnpjFormatted || client.cnpj,
        municipio: client.municipio,
        path: client.path
      },
      resumo: {
        totalItens: total,
        presentes,
        pendentes: total - presentes,
        percentual: percent,
        prontoParaProtocolo: checklist.filter(c => c.obrigatorio && c.status === 'PENDENTE').length === 0
      },
      checklist
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inicialização do Servidor
loadLocalCache();

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 MC Assessoria Contábil Hub iniciado com sucesso!`);
  console.log(`🌐 Acesso Local: http://localhost:${PORT}`);
  console.log(`📁 Pasta de Rede: \\\\192.168.15.2\\mc assessoria contabil`);
  console.log(`=======================================================`);

  // Inicia o Robô Sentinela em tempo real
  networkWatcher.start();

  // Se não havia cache local, realiza primeira varredura
  if (!scanner.cache.clients || scanner.cache.clients.length === 0) {
    console.log('Nenhum cache encontrado. Iniciando varredura inicial...');
    scanner.scanNetwork().then(() => {
      saveLocalCache();
    });
  }
});
