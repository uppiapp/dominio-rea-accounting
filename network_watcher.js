const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

const BASE_PATH = '\\\\192.168.15.2\\mc assessoria contabil';

function classifyCategory(fileName, dirPath) {
  const fLower = fileName.toLowerCase();
  const dLower = dirPath.toLowerCase();
  const ext = path.extname(fLower);

  if (ext === '.xml') return 'XML';
  if (['.pfx', '.p12', '.cer', '.crt'].includes(ext) || fLower.includes('certificado')) return 'CERTIFICADO';
  if (dLower.includes('fiscal') || fLower.includes('darf') || fLower.includes('pgdas') || fLower.includes('dctf') || fLower.includes('iss') || fLower.includes('nota fiscal') || fLower.includes('nfe') || fLower.includes('nfce') || fLower.includes('sped') || fLower.includes('sintegra')) return 'FISCAL';
  if (dLower.includes('contabil') || dLower.includes('contábil') || fLower.includes('balanco') || fLower.includes('balanço') || fLower.includes('extrato') || fLower.includes('dre') || fLower.includes('razao') || fLower.includes('diario') || fLower.includes('caixa')) return 'CONTÁBIL';
  if (dLower.includes('pessoal') || dLower.includes('folha') || dLower.includes('dp') || fLower.includes('rescisao') || fLower.includes('admissao') || fLower.includes('fgts') || fLower.includes('gfip') || fLower.includes('inss') || fLower.includes('holerite')) return 'PESSOAL';
  if (dLower.includes('legaliz') || dLower.includes('societ') || fLower.includes('alvara') || fLower.includes('alvará') || fLower.includes('visa') || fLower.includes('vigilancia') || fLower.includes('vigilância') || fLower.includes('bombeiro') || fLower.includes('contrato') || fLower.includes('jucepa') || fLower.includes('cnd') || fLower.includes('certidao')) return 'LEGALIZAÇÃO';
  if (dLower.includes('parcelamento') || fLower.includes('parcelamento')) return 'PARCELAMENTO';
  return 'OUTROS';
}

function detectClientAndRegime(filePath) {
  const rel = path.relative(BASE_PATH, filePath);
  const parts = rel.split(path.sep);

  let regime = 'GERAL';
  let client = 'GERAL';

  if (parts.length > 0) {
    regime = parts[0];
  }
  if (parts.length > 1) {
    client = parts[1];
  }

  return { regime, client };
}

class NetworkWatcher {
  constructor() {
    this.watcher = null;
    this.isWatching = false;
    this.sseClients = [];
    this.recentEvents = [];
    this.maxEvents = 100;
    this.stats = {
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      startedAt: null
    };
  }

  start() {
    if (this.isWatching) return;
    this.isWatching = true;
    this.stats.startedAt = new Date();
    console.log('[Sentinela] Robô Sentinela iniciado com sucesso em modo seguro.');
  }

  handleEvent(type, filePath) {
    const fileName = path.basename(filePath);
    const { regime, client } = detectClientAndRegime(filePath);
    const category = classifyCategory(fileName, path.dirname(filePath));

    let actionLabel = 'adicionado';
    if (type === 'UPDATE') actionLabel = 'atualizado';
    if (type === 'DELETE') actionLabel = 'excluído';

    let icon = 'file-plus';
    let color = 'emerald';
    if (type === 'UPDATE') { icon = 'file-edit'; color = 'blue'; }
    if (type === 'DELETE') { icon = 'file-x'; color = 'rose'; }

    if (type === 'CREATE') this.stats.filesAdded++;
    if (type === 'UPDATE') this.stats.filesModified++;
    if (type === 'DELETE') this.stats.filesDeleted++;

    const now = new Date();
    const event = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      actionLabel,
      icon,
      color,
      fileName,
      client,
      regime,
      category,
      path: filePath,
      timestamp: now.toISOString(),
      timeFormatted: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dateFormatted: now.toLocaleDateString('pt-BR'),
      message: `[${category}] ${fileName} foi ${actionLabel} em "${client}"`
    };

    console.log(`[Sentinela ⚡] ${event.message}`);

    // Armazena no histórico recente (limite de 100)
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.pop();
    }

    // Transmite via SSE para todos os navegadores conectados
    this.broadcastSSE(event);
  }

  // Registra cliente SSE
  addSseClient(res) {
    this.sseClients.push(res);

    // Proteção contra crash de socket fechado / EPIPE
    res.on('error', (err) => {
      this.sseClients = this.sseClients.filter(c => c !== res);
    });

    res.on('close', () => {
      this.sseClients = this.sseClients.filter(c => c !== res);
    });

    try {
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Sentinela Conectado com Sucesso', activeClients: this.sseClients.length })}\n\n`);
    } catch(e) {
      this.sseClients = this.sseClients.filter(c => c !== res);
    }
  }

  broadcastSSE(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const clients = [...this.sseClients];
    for (const client of clients) {
      try {
        if (client.writable && !client.writableEnded) {
          client.write(data);
        } else {
          this.sseClients = this.sseClients.filter(c => c !== client);
        }
      } catch (err) {
        this.sseClients = this.sseClients.filter(c => c !== client);
      }
    }
  }

  getRecentEvents() {
    return this.recentEvents;
  }

  getStats() {
    return {
      ...this.stats,
      isWatching: this.isWatching,
      connectedClients: this.sseClients.length,
      totalRecentEvents: this.recentEvents.length
    };
  }
}

module.exports = new NetworkWatcher();
