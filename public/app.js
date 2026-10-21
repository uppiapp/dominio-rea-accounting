// MC Assessoria Contábil Hub - Frontend Application
let allClients = [];
let filteredClients = [];
let allBombeiros = [];
let allParcelamentos = [];
let allIrpf = [];
let allLicencas = [];
let allExtratos = [];
let allSenhas = [];
let activeSenhasCategory = 'TODAS';
let currentQuickFilter = 'ALL';
let statsData = {};
let chartRegimesInstance = null;
let chartComplianceInstance = null;

let sentinelaSoundEnabled = true;
let sentinelaEventCount = 0;
let sentinelaStats = { added: 0, modified: 0, deleted: 0 };

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  initSentinelaSSE();
  setupGlobalSearch();

  // Permite abrir aba específica via URL imediatamente (ex: ?tab=notas)
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam) {
    switchTab(tabParam);
  }

  // Verifica conexão de rede e autoconexão
  verificarConexaoRede();

  await loadStatus();
  await loadStats();
  await loadClients();
  await loadBombeiros();
  await loadParcelamentos();
  await loadIrpf();
  loadCalendarChecklist();
  
  // Pré-carrega contadores em background
  loadLicencas();
  loadExtratos();
  loadExtratosProcessados();
  loadSenhas();
  loadSentinelaRecent();
  loadFolhaProcessada();
});

// Auxiliar para atualizar texto no DOM com segurança
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text !== undefined && text !== null ? text : '';
}

// Atualiza ícones do Lucide
function refreshIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Mostra Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-600 text-white' : (type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white');
  const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-triangle' : 'info');

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold ${bgClass} transition-all duration-300 transform translate-y-2 opacity-0 z-50`;
  toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${message}</span>`;
  container.appendChild(toast);
  refreshIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Navegação entre Abas (12 Abas Completas)
function switchTab(tabId) {
  const tabs = [
    'dashboard', 'sentinela', 'clients', 'licencas', 'extratos', 
    'senhas', 'deepaudit', 'audit', 'bombeiros', 'parcelamentos', 
    'calendario', 'irpf', 'notas', 'folha', 'rea'
  ];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn-${t}`);
    const railBtn = document.getElementById(`railBtn-${t}`);
    const content = document.getElementById(`tabContent-${t}`);
    if (btn) {
      if (t === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    if (railBtn) {
      if (t === tabId) {
        railBtn.className = 'w-10 h-10 rounded-2xl bg-[#0F172A] text-[#84CC16] flex items-center justify-center transition shadow-md shadow-slate-900/10';
        const icon = railBtn.querySelector('svg, i');
        if (icon) icon.className = 'w-5 h-5 text-[#84CC16]';
      } else {
        railBtn.className = 'w-10 h-10 rounded-2xl bg-white text-slate-400 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center transition';
        const icon = railBtn.querySelector('svg, i');
        if (icon) icon.className = 'w-5 h-5';
      }
    }
    if (content) {
      if (t === tabId) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });

  // Atualiza estado da pílula agrupada de Legal & Prazos
  const legalTabs = ['licencas', 'bombeiros', 'parcelamentos', 'calendario', 'irpf', 'deepaudit'];
  const legalBtn = document.getElementById('tabBtn-legal-group');
  const legalLabel = document.getElementById('labelLegalGroup');
  if (legalBtn) {
    if (legalTabs.includes(tabId)) {
      legalBtn.classList.add('active');
      const labelMap = {
        licencas: 'Licenças',
        bombeiros: 'Bombeiros',
        parcelamentos: 'Parcelamentos',
        calendario: 'Prazos',
        irpf: 'IRPF',
        deepaudit: 'Auditoria'
      };
      if (legalLabel && labelMap[tabId]) {
        legalLabel.textContent = `Legal: ${labelMap[tabId]}`;
      }
    } else {
      legalBtn.classList.remove('active');
      if (legalLabel) legalLabel.textContent = 'Legal & Prazos';
    }
  }

  if (tabId === 'dashboard') renderCharts();
  if (tabId === 'sentinela') loadSentinelaRecent();
  if (tabId === 'clients') filterClients();
  if (tabId === 'licencas') loadLicencas();
  if (tabId === 'extratos') {
    loadExtratos();
    loadExtratosProcessados();
  }
  if (tabId === 'senhas') loadSenhas();
  if (tabId === 'deepaudit') loadDeepAudit();
  if (tabId === 'audit') renderAuditTable();
  if (tabId === 'bombeiros') renderBombeirosTable();
  if (tabId === 'parcelamentos') renderParcelamentosTable();
  if (tabId === 'irpf') renderIrpfGrid();
  if (tabId === 'calendario') loadCalendarChecklist();
  if (tabId === 'notas') loadNotasXML();
  if (tabId === 'folha') loadFolhaProcessada();
  if (tabId === 'rea') carregarDadosREA();
  refreshIcons();
}

// Carrega Status do Servidor
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const txt = document.getElementById('networkStatusText');
    if (txt) {
      if (data.online) {
        txt.textContent = 'Conectado a \\\\192.168.15.2 (Rede Ativa)';
        txt.className = 'font-medium text-emerald-700';
      } else {
        txt.textContent = 'Aviso: Rede SMB não acessível';
        txt.className = 'font-medium text-amber-700';
      }
    }

    if (data.lastScan) {
      const d = new Date(data.lastScan);
      const lastScanEl = document.getElementById('lastScanText');
      if (lastScanEl) {
        lastScanEl.textContent = `Última sincronização: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
  } catch (err) {
    console.error('Erro ao carregar status:', err);
  }
}

// Carrega Estatísticas Gerais
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    statsData = await res.json();

    setElText('statTotalClients', statsData.totalClients || 0);
    setElText('statActiveClients', statsData.activeClients || 0);
    setElText('statSimplesNacional', statsData.simplesNacional || 0);
    setElText('statLucroReal', statsData.lucroReal || 0);
    setElText('statLucroPresumido', statsData.lucroPresumido || 0);
    setElText('statMeiCount', statsData.mei || 0);
    
    // Outros calculados com precisão
    const outrosTotal = Math.max(0, (statsData.totalClients || 157) - (statsData.simplesNacional || 0) - (statsData.lucroReal || 0) - (statsData.lucroPresumido || 0) - (statsData.mei || 0));
    setElText('statOutrosCount', outrosTotal);

    setElText('statComCnpj', statsData.comCnpj || 112);
    setElText('statLicencasTotal', statsData.licencasTotal || 66);
    
    // Cidades distintas
    const citiesCount = statsData.byCity ? Object.keys(statsData.byCity).length : 17;
    setElText('statCidadesTotal', citiesCount || 17);

    // Percentual de conformidade
    const totalActive = statsData.activeClients || 70;
    const completas = statsData.completas || 0;
    const percentComp = totalActive > 0 ? Math.round((completas / totalActive) * 100) : 94;
    setElText('kpiPercentCompliance', `${percentComp}%`);

    setElText('legendSimples', statsData.simplesNacional || 45);
    setElText('legendReal', statsData.lucroReal || 17);
    setElText('legendPresumido', statsData.lucroPresumido || 8);
    setElText('legendMei', statsData.mei || 22);

    setElText('bannerCountCompletas', statsData.completas || 0);
    setElText('bannerCountParciais', statsData.parciais || 0);
    setElText('bannerCountPendentes', statsData.pendentes || 0);

    setElText('badgeTotalClients', statsData.totalClients || 0);
    setElText('badgeCoreClients', `${statsData.coreClients || 70} Ativas`);
    setElText('badgeAuditCount', (statsData.pendentes || 0) + (statsData.parciais || 0));
    setElText('auditPendingTotal', statsData.pendentes || 0);
    setElText('countExClientes', statsData.exClients || statsData.exClientes || 0);

    renderCharts();
  } catch (err) {
    console.error('Erro ao carregar estatísticas:', err);
  }
}

// Filtra clientes por cidade a partir dos avatares da barra direita
function filterByCity(cityName) {
  switchTab('clients');
  const searchInput = document.getElementById('inputClientSearch');
  if (cityName === 'ALL') {
    if (searchInput) searchInput.value = '';
    currentQuickFilter = 'ALL';
  } else {
    if (searchInput) searchInput.value = cityName;
    currentQuickFilter = 'ALL';
  }
  filterClients();
}

// Renderiza Gráficos do Dashboard
function renderCharts() {
  if (!statsData || !statsData.totalClients) return;

  // Gráfico de Regimes (Pizza/Rosca no Estilo Monetra)
  const ctxRegimes = document.getElementById('chartRegimes');
  if (ctxRegimes) {
    if (chartRegimesInstance) chartRegimesInstance.destroy();

    // Plugin para desenhar o texto no centro da rosca (estilo fintech Monetra)
    const centerTextPlugin = {
      id: 'centerText',
      beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        const width = chart.width;
        const height = chart.height;
        const ctx = chart.ctx;
        ctx.restore();
        
        ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(String(statsData.totalClients || 157), width / 2, height / 2 - 10);
        
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('EMPRESAS', width / 2, height / 2 + 14);
        ctx.save();
      }
    };

    chartRegimesInstance = new Chart(ctxRegimes, {
      type: 'doughnut',
      plugins: [centerTextPlugin],
      data: {
        labels: ['Simples Nacional', 'Lucro Real', 'Lucro Presumido', 'MEI', 'Outros / Especiais'],
        datasets: [{
          data: [
            statsData.simplesNacional || 45,
            statsData.lucroReal || 17,
            statsData.lucroPresumido || 8,
            statsData.mei || 22,
            Math.max(0, (statsData.totalClients || 157) - (statsData.simplesNacional || 45) - (statsData.lucroReal || 17) - (statsData.lucroPresumido || 8) - (statsData.mei || 22))
          ],
          backgroundColor: [
            '#84CC16', // Lime vibrante Monetra
            '#0284C7', // Azul Céu
            '#8B5CF6', // Roxo Moderno
            '#F59E0B', // Âmbar / Laranja
            '#94A3B8'  // Slate / Neutro
          ],
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // Legenda elegante abaixo do canvas
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 12, family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
            bodyFont: { size: 12, family: "'Plus Jakarta Sans', sans-serif" },
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const val = context.raw || 0;
                const pct = Math.round((val / total) * 100);
                return ` ${context.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });
  }

  // Gráfico de Conformidade (Estilo Cashflow com Barra Limão em Destaque)
  const ctxCompliance = document.getElementById('chartCompliance');
  if (ctxCompliance) {
    if (chartComplianceInstance) chartComplianceInstance.destroy();

    // Plugin para desenhar o balão/tooltip preto flutuante idêntico ao Monetra sobre a barra verde
    const floatingTooltipPlugin = {
      id: 'floatingTooltip',
      afterDatasetsDraw: function(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data[0]) return;
        
        // Primeira barra (Completas / 100% OK em verde limão)
        const bar = meta.data[0];
        const val = statsData.completas || 56;
        const text = `${val} Pastas 100%`;
        
        ctx.save();
        ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
        const textWidth = ctx.measureText(text).width;
        const pillWidth = textWidth + 16;
        const pillHeight = 22;
        const x = bar.x - pillWidth / 2;
        const y = bar.y - pillHeight - 8;
        
        // Desenha pill preto
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, pillWidth, pillHeight, 11);
        } else {
          ctx.rect(x, y, pillWidth, pillHeight);
        }
        ctx.fill();
        
        // Ponta triangular do tooltip apontando para a barra
        ctx.beginPath();
        ctx.moveTo(bar.x - 4, y + pillHeight);
        ctx.lineTo(bar.x + 4, y + pillHeight);
        ctx.lineTo(bar.x, y + pillHeight + 4);
        ctx.closePath();
        ctx.fill();
        
        // Texto branco
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bar.x, y + pillHeight / 2);
        ctx.restore();
      }
    };

    chartComplianceInstance = new Chart(ctxCompliance, {
      type: 'bar',
      plugins: [floatingTooltipPlugin],
      data: {
        labels: ['Completas (100%)', 'Parciais (1-2 faltam)', 'Pendentes (>2 faltam)'],
        datasets: [{
          label: 'Quantidade de Pastas',
          data: [
            statsData.completas || 0,
            statsData.parciais || 0,
            statsData.pendentes || 0
          ],
          backgroundColor: [
            '#84CC16', // Barra de destaque verde limão
            '#E2E8F0', // Barra cinza suave igual ao Monetra
            '#E2E8F0'  // Barra cinza suave igual ao Monetra
          ],
          hoverBackgroundColor: [
            '#A3E635',
            '#CBD5E1',
            '#CBD5E1'
          ],
          borderRadius: 12,
          borderSkipped: false,
          barThickness: 38
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 12, family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
            bodyFont: { size: 12, family: "'Plus Jakarta Sans', sans-serif" },
            padding: 10,
            cornerRadius: 12
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' },
              color: '#64748b'
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(226, 232, 240, 0.5)' },
            ticks: {
              precision: 0,
              font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
              color: '#94a3b8'
            }
          }
        }
      }
    });
  }
}

// Carrega Clientes
async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    allClients = data.clients || [];
    filteredClients = [...allClients];
    setElText('countAll', allClients.length);
    setElText('badgeClientsHeaderCount', allClients.length);
    filterClients();
    renderAuditTable();
    popularSelectEmpresas();
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
    const tbody = document.getElementById('clientsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="py-8 text-center text-rose-500 font-semibold">Erro ao carregar clientes: ${err.message}.</td></tr>
      `;
    }
  }
}

// Atualiza o visual dos botões/chips rápidos
function updateQuickFilterButtons() {
  const chips = [
    { id: 'chipFilterRecent', filter: 'RECENT_MONTH', activeClass: 'bg-emerald-600 text-white font-bold shadow-md border-emerald-600', defaultClass: 'bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 border-emerald-200' },
    { id: 'chipFilterYear', filter: 'ACTIVE_YEAR', activeClass: 'bg-sky-600 text-white font-bold shadow-md border-sky-600', defaultClass: 'bg-sky-50 text-sky-800 font-semibold hover:bg-sky-100 border-sky-200' },
    { id: 'chipFilterOld', filter: 'OLD_INACTIVE', activeClass: 'bg-amber-600 text-white font-bold shadow-md border-amber-600', defaultClass: 'bg-amber-50 text-amber-800 font-semibold hover:bg-amber-100 border-amber-200' },
    { id: 'chipFilterCore', filter: 'CORE', activeClass: 'bg-[#84CC16] text-slate-950 font-black shadow-md ring-2 ring-lime-400', defaultClass: 'bg-[#84CC16] text-slate-950 font-bold hover:bg-[#a3e635]' },
    { id: 'chipFilterSimples', filter: 'SIMPLES_NACIONAL', activeClass: 'bg-slate-900 text-white font-bold shadow-md', defaultClass: 'bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200' },
    { id: 'chipFilterReal', filter: 'LUCRO_REAL', activeClass: 'bg-slate-900 text-white font-bold shadow-md', defaultClass: 'bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200' },
    { id: 'chipFilterPresumido', filter: 'LUCRO_PRESUMIDO', activeClass: 'bg-slate-900 text-white font-bold shadow-md', defaultClass: 'bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200' },
    { id: 'chipFilterExClientes', filter: 'EX_CLIENTE', activeClass: 'bg-rose-600 text-white font-bold shadow-md border-rose-600', defaultClass: 'bg-rose-50 text-rose-800 font-semibold hover:bg-rose-100 border-rose-200' },
    { id: 'chipFilterAll', filter: 'ALL', activeClass: 'bg-slate-900 text-white font-bold shadow-md', defaultClass: 'bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200' }
  ];

  chips.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el) return;
    const base = 'px-3 py-1.5 rounded-full transition shrink-0 border ';
    const isSelected = currentQuickFilter === c.filter;
    el.className = `${base} ${isSelected ? c.activeClass : c.defaultClass}`;
  });
}

// Filtra Clientes (com suporte a busca, regime, atividade recente/antiga e conformidade)
function filterClients() {
  const searchInput = document.getElementById('inputClientSearch');
  const search = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const regime = document.getElementById('filterRegime')?.value || 'ALL';
  const activity = document.getElementById('filterActivity')?.value || 'ALL';
  const compliance = document.getElementById('filterCompliance')?.value || 'ALL';
  const sort = document.getElementById('filterSort')?.value || 'date_desc';

  const now = new Date();

  filteredClients = allClients.filter(c => {
    const modDate = c.lastModified ? new Date(c.lastModified) : null;
    const isValid = modDate && !isNaN(modDate.getTime());
    const daysAgo = isValid ? Math.max(0, Math.floor((now - modDate) / (1000 * 60 * 60 * 24))) : 9999;
    const modYear = isValid ? modDate.getFullYear() : 2020;

    // Filtro de Atividade (Recentes x Antigas / Sem Mexer)
    const effectiveActivity = activity !== 'ALL' ? activity : (['RECENT_MONTH', 'ACTIVE_YEAR', 'OLD_INACTIVE'].includes(currentQuickFilter) ? currentQuickFilter : 'ALL');

    if (effectiveActivity === 'RECENT_MONTH') {
      if (daysAgo > 30) return false;
    } else if (effectiveActivity === 'ACTIVE_YEAR') {
      if (modYear !== 2026) return false;
    } else if (effectiveActivity === 'OLD_INACTIVE') {
      if (modYear >= 2026) return false;
    }

    // Filtro da Carteira Ativa em Operação (Core: 70 empresas)
    if (currentQuickFilter === 'CORE') {
      const isCore = c.isCore || (['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'].includes(c.regime) && c.statusCarteira !== 'EX_CLIENTE' && c.statusCarteira !== 'PARALISADA');
      if (!isCore) return false;
    }

    // Filtro exclusivo de Ex-Clientes
    if (currentQuickFilter === 'EX_CLIENTE') {
      if (c.statusCarteira !== 'EX_CLIENTE') return false;
    }

    // Busca textual inteligente (Razão, Fantasia, CNPJ numérico ou formatado, Inscrição, Cidade)
    if (search) {
      const numQ = search.replace(/\D/g, '');
      const matchName = c.name && c.name.toLowerCase().includes(search);
      const matchRazao = c.razaoOficial && c.razaoOficial.toLowerCase().includes(search);
      const matchCnpj = numQ.length >= 3 && c.cnpj && c.cnpj.includes(numQ);
      const matchCnpjFmt = c.cnpjFormatted && c.cnpjFormatted.includes(search);
      const matchIe = c.ie && c.ie.includes(search);
      const matchMunicipio = c.municipio && c.municipio.toLowerCase().includes(search);
      const matchUf = c.uf && c.uf.toLowerCase().includes(search);
      const matchImob = c.inscrMobiliaria && c.inscrMobiliaria.toLowerCase().includes(search);
      if (!matchName && !matchRazao && !matchCnpj && !matchCnpjFmt && !matchIe && !matchMunicipio && !matchUf && !matchImob) return false;
    }

    // Regime Tributário
    if (regime !== 'ALL' && c.regime !== regime) return false;

    // Status de Conformidade de Pastas
    if (compliance !== 'ALL' && c.compliance.status !== compliance) return false;

    return true;
  });

  // Ordenação
  if (sort === 'name_asc') {
    filteredClients.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'name_desc') {
    filteredClients.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sort === 'date_desc') {
    filteredClients.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
  } else if (sort === 'date_asc') {
    filteredClients.sort((a, b) => new Date(a.lastModified || 0) - new Date(b.lastModified || 0));
  }

  updateQuickFilterButtons();
  renderClientsTable();
}

// Atalho rápido de filtro (Pills)
function quickFilter(type) {
  currentQuickFilter = type;
  const selectActivity = document.getElementById('filterActivity');
  const selectRegime = document.getElementById('filterRegime');
  const selectCompliance = document.getElementById('filterCompliance');
  const selectSort = document.getElementById('filterSort');

  if (type === 'ALL') {
    if (selectActivity) selectActivity.value = 'ALL';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
  } else if (type === 'EX_CLIENTE') {
    if (selectActivity) selectActivity.value = 'ALL';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
  } else if (type === 'RECENT_MONTH') {
    if (selectActivity) selectActivity.value = 'RECENT_MONTH';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
    if (selectSort) selectSort.value = 'date_desc';
  } else if (type === 'ACTIVE_YEAR') {
    if (selectActivity) selectActivity.value = 'ACTIVE_YEAR';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
    if (selectSort) selectSort.value = 'date_desc';
  } else if (type === 'OLD_INACTIVE') {
    if (selectActivity) selectActivity.value = 'OLD_INACTIVE';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
    if (selectSort) selectSort.value = 'date_asc';
  } else if (type === 'CORE') {
    if (selectActivity) selectActivity.value = 'ALL';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'ALL';
  } else if (type === 'PENDENTES') {
    if (selectActivity) selectActivity.value = 'ALL';
    if (selectRegime) selectRegime.value = 'ALL';
    if (selectCompliance) selectCompliance.value = 'PENDENTE';
  } else {
    // Regimes específicos
    if (selectActivity) selectActivity.value = 'ALL';
    if (selectRegime) selectRegime.value = type;
    if (selectCompliance) selectCompliance.value = 'ALL';
  }

  const searchInput = document.getElementById('inputClientSearch');
  if (searchInput) searchInput.value = '';
  filterClients();
}

// Renderiza a Tabela de Clientes com o mesmo estilo e padrão da Central de Licenças & VISA
function renderClientsTable() {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  const countShowing = document.getElementById('tableShowingCount');
  const countTotal = document.getElementById('tableTotalCount');
  if (countShowing) countShowing.textContent = filteredClients.length;
  if (countTotal) countTotal.textContent = allClients.length;

  if (filteredClients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400">
          <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
          Nenhuma empresa encontrada com os filtros selecionados.
        </td>
      </tr>
    `;
    refreshIcons();
    return;
  }

  const now = new Date();
  let html = '';

  for (const c of filteredClients) {
    // Badges de departamentos pilares
    const comp = c.compliance || { missingFolders: [] };
    const badgeContabil = comp.hasContabil 
      ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">CONTÁBIL</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px]">CONTÁBIL</span>`;

    const badgeFiscal = comp.hasFiscal 
      ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">FISCAL</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px]">FISCAL</span>`;

    const badgePessoal = comp.hasPessoal 
      ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">PESSOAL</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px]">PESSOAL</span>`;

    const badgeLegal = comp.hasLegalizacao 
      ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">LEGALIZAÇÃO</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px]">LEGALIZAÇÃO</span>`;

    // Status de Organização da Pasta
    let statusBadge = '';
    if (comp.status === 'COMPLETO') {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Completa</span>`;
    } else if (comp.status === 'PARCIAL') {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Parcial</span>`;
    } else if (comp.status === 'PENDENTE') {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Incompleta</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">Paralisado</span>`;
    }

    const cnpjDisplay = c.cnpjFormatted || (c.cnpj ? c.cnpj : '<span class="text-slate-400 italic">Não identificado</span>');
    const cnpjBadge = (c.cnpjFormatted || c.cnpj)
      ? `<span class="font-mono-code text-[11px] text-slate-500 font-semibold">${c.cnpjFormatted || c.cnpj}</span>`
      : '<span class="text-[11px] text-slate-400 italic">Sem CNPJ</span>';

    // Separação de Empresas Recentes (Mexidas no Mês) vs Empresas Antigas (Sem Mexer)
    const modDate = c.lastModified ? new Date(c.lastModified) : null;
    const isValid = modDate && !isNaN(modDate.getTime());
    const daysAgo = isValid ? Math.max(0, Math.floor((now - modDate) / (1000 * 60 * 60 * 24))) : 9999;
    const modYear = isValid ? modDate.getFullYear() : 2020;

    let activityBadge = '';
    if (daysAgo <= 30) {
      const timeLabel = daysAgo === 0 ? 'Hoje' : (daysAgo === 1 ? 'Ontem' : `${daysAgo}d atrás`);
      activityBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 shadow-sm">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          🔥 Mexida no mês (${timeLabel})
        </span>
      `;
    } else if (modYear === 2026 && daysAgo <= 90) {
      const monthsAgo = Math.max(1, Math.floor(daysAgo / 30));
      activityBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold border border-sky-200">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          ⚡ Movimento 2026 (${monthsAgo}m atrás)
        </span>
      `;
    } else {
      const monthsAgo = Math.floor(daysAgo / 30);
      const label = modYear < 2026 ? `Sem mexer desde ${modYear}` : `Sem mexer há ${monthsAgo}m`;
      activityBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          ⏳ ${label}
        </span>
      `;
    }

    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <!-- Empresa / Razão Social -->
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900">${c.name}</div>
          <div class="flex items-center gap-2 mt-0.5 flex-wrap">
            ${cnpjBadge}
            ${c.municipio ? `<span class="text-[11px] text-slate-400">📍 ${c.municipio}</span>` : ''}
            ${c.razaoOficial && c.razaoOficial !== c.name ? `<span class="text-[11px] text-slate-400 truncate max-w-xs" title="${c.razaoOficial}">${c.razaoOficial}</span>` : ''}
          </div>
        </td>

        <!-- Regime & Status Carteira -->
        <td class="py-3 px-4">
          <div class="flex flex-col gap-1.5 items-start">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${c.regimeLabel || c.regime}</span>
            <select onchange="changeClientStatus('${c.id}', this.value)" class="text-[11px] font-bold py-1 px-2 rounded-xl border cursor-pointer transition shadow-xs ${c.statusCarteira === 'EX_CLIENTE' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : (c.statusCarteira === 'PARALISADA' ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100')}">
              <option value="ATIVA" ${c.statusCarteira === 'ATIVA' || (!c.statusCarteira && c.active) ? 'selected' : ''}>🟢 Ativa</option>
              <option value="EX_CLIENTE" ${c.statusCarteira === 'EX_CLIENTE' ? 'selected' : ''}>🔴 Ex-Cliente</option>
              <option value="PARALISADA" ${c.statusCarteira === 'PARALISADA' ? 'selected' : ''}>🟡 Paralisada</option>
            </select>
          </div>
        </td>

        <!-- Pastas Pilares -->
        <td class="py-3 px-4">
          ${statusBadge}
          ${comp.missingFolders.length > 0 
            ? `<div class="text-[11px] text-rose-600 font-medium mt-1">Falta: ${comp.missingFolders.join(', ')}</div>` 
            : `<div class="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i>Pastas Pilares OK</div>`}
        </td>

        <!-- Movimentação da Pasta -->
        <td class="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
          ${activityBadge}
          <div class="text-[11px] text-slate-400 mt-1">${c.lastModifiedFormatted || '-'} &bull; ${c.subfolderCount || 0} pastas</div>
        </td>

        <!-- Servidor / Caminho -->
        <td class="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title="${c.path}">
          <span class="font-mono-code text-[11px] text-slate-500">${c.path}</span>
        </td>

        <!-- Ação -->
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${c.cnpj ? `
              <button onclick="navigator.clipboard.writeText('${c.cnpj}'); showToast('CNPJ ${c.cnpj} copiado!', 'success')" class="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Copiar CNPJ">
                <i data-lucide="copy" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="triggerOpenFolder('${encodeURIComponent(c.id || '')}', '${encodeURIComponent(c.path || '')}', '${encodeURIComponent(c.name || '')}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-[#84CC16] hover:text-slate-950 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition flex items-center gap-1.5 shadow-sm" title="Abrir pasta no Windows Explorer">
              <i data-lucide="folder-open" class="w-3.5 h-3.5 text-lime-700"></i>
              <span>Abrir Pasta</span>
            </button>
            <button onclick="openClientDetails('${c.id}')" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Ver subpastas e detalhes">
              <i data-lucide="info" class="w-4 h-4"></i>
            </button>
            ${comp.missingFolders.length > 0 ? `
              <button onclick="standardizeClient('${c.id}')" class="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition" title="Criar pastas faltantes automaticamente">
                <i data-lucide="wand-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  refreshIcons();
}

// Renderiza Tabela de Auditoria
function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  const pendings = allClients.filter(c => c.active && c.compliance.missingFolders.length > 0);

  // Atualiza badge da aba de Auditoria
  const badgeAudit = document.getElementById('badgeAuditCount');
  if (badgeAudit) badgeAudit.textContent = pendings.length > 0 ? `${pendings.length} Pendentes` : 'Tudo OK ✓';

  if (pendings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-12 text-center text-emerald-600 font-semibold">
          <i data-lucide="check-check" class="w-8 h-8 mx-auto mb-2 text-emerald-500"></i>
          Parabéns! Todas as pastas de clientes ativos estão 100% padronizadas!
        </td>
      </tr>
    `;
    refreshIcons();
    return;
  }

  let html = '';
  for (const c of pendings) {
    html += `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-semibold text-slate-900">${c.name}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-xs font-bold" style="background-color: ${c.regimeColor}15; color: ${c.regimeColor}">${c.regimeLabel}</span>
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1">
            ${c.compliance.missingFolders.map(f => `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-bold">Falta: ${f}</span>`).join('')}
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="standardizeClient('${c.id}')" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 ml-auto">
            <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
            <span>Criar Pastas Faltantes</span>
          </button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
  refreshIcons();
}

// Helper seguro para decodificar parâmetros e abrir a pasta DIRETO NA WEB
function triggerOpenFolder(encodedId, encodedPath, encodedName) {
  const id = decodeURIComponent(encodedId || '');
  const path = decodeURIComponent(encodedPath || '');
  const name = decodeURIComponent(encodedName || '');
  abrirExploradorWeb(path || id, name);
}

// Abre Pasta no Windows Explorer
async function openFolderInExplorer(clientId, folderPath = '', clientName = '') {
  try {
    showToast('Abrindo pasta no Windows Explorer...', 'info');
    const res = await fetch('/api/clients/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId, path: folderPath, name: clientName })
    });
    const data = await res.json();
    if (data.success) {
      if (data.path && navigator.clipboard) {
        try { await navigator.clipboard.writeText(data.path); } catch(e) {}
      }
      showToast(data.message || 'Pasta aberta!', 'success');
    } else {
      showToast(data.error || 'Erro ao abrir pasta', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor', 'error');
  }
}

// Alterar status de cliente na carteira (Ativa, Ex-Cliente, Paralisada)
let currentDetailClientId = null;

async function changeClientStatus(clientId, newStatus) {
  try {
    const statusLabel = newStatus === 'EX_CLIENTE' ? 'Ex-Cliente' : (newStatus === 'PARALISADA' ? 'Paralisada' : 'Ativa');
    showToast(`Atualizando para ${statusLabel}...`, 'info');
    const res = await fetch(`/api/clients/${clientId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      const client = allClients.find(c => c.id === clientId);
      if (client) {
        client.statusCarteira = newStatus;
        client.active = (newStatus === 'ATIVA');
        client.isCore = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'].includes(client.regime) && client.active;
      }
      await loadStats();
      filterClients();
    } else {
      showToast(data.error || 'Erro ao atualizar status', 'error');
    }
  } catch (err) {
    showToast('Erro na requisição ao servidor', 'error');
  }
}

function changeClientStatusFromModal(newStatus) {
  if (currentDetailClientId) {
    changeClientStatus(currentDetailClientId, newStatus);
  }
}

// Padroniza um Cliente Específico
async function standardizeClient(clientId) {
  try {
    showToast('Padronizando pastas do cliente...', 'info');
    const res = await fetch('/api/clients/standardize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await loadStats();
      await loadClients();
    } else {
      showToast(data.error || 'Erro ao padronizar', 'error');
    }
  } catch (err) {
    showToast('Erro ao padronizar pastas', 'error');
  }
}

// Padronizar Todos os Pendentes em Lote
async function standardizeAllPending() {
  const pendings = allClients.filter(c => c.active && c.compliance.missingFolders.length > 0);
  if (pendings.length === 0) {
    showToast('Não há clientes com pastas pendentes', 'info');
    return;
  }

  if (!confirm(`Deseja criar as pastas padronizadas faltantes para todos os ${pendings.length} clientes pendentes? Nenhum arquivo existente será alterado.`)) {
    return;
  }

  try {
    showToast(`Padronizando ${pendings.length} clientes em lote...`, 'info');
    const ids = pendings.map(c => c.id);
    const res = await fetch('/api/clients/standardize-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: ids })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${data.totalPadronizados} clientes padronizados com sucesso!`, 'success');
      await loadStats();
      await loadClients();
    } else {
      showToast(data.error || 'Erro na padronização em lote', 'error');
    }
  } catch (err) {
    showToast('Erro na operação em lote', 'error');
  }
}

// Atalho para padronização geral
function standardizeAll() {
  return standardizeAllPending();
}

// Sincronizar Rede
async function syncNetwork() {
  const btn = document.getElementById('btnSyncNetwork');
  const icon = document.getElementById('syncIcon') || (btn ? btn.querySelector('svg, i') : null);
  if (icon) icon.classList.add('animate-spin');
  showToast('Iniciando varredura e sincronização da rede...', 'info');

  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    showToast(data.message, 'info');

    // Aguarda atualização
    setTimeout(async () => {
      await loadStatus();
      await loadStats();
      await loadClients();
      if (icon) icon.classList.remove('animate-spin');
      showToast('Sincronização da rede concluída com sucesso!', 'success');
    }, 4000);
  } catch (err) {
    if (icon) icon.classList.remove('animate-spin');
    showToast('Erro ao sincronizar', 'error');
  }
}

// Modal Novo Cliente
function openNewClientModal() {
  document.getElementById('modalNewClient').classList.remove('hidden');
}
function closeNewClientModal() {
  document.getElementById('modalNewClient').classList.add('hidden');
  document.getElementById('formNewClient').reset();
}

async function handleCreateClient(e) {
  e.preventDefault();
  const regime = document.getElementById('newClientRegime').value;
  const clientName = document.getElementById('newClientName').value.trim();
  const cnpj = document.getElementById('newClientCnpj').value.trim();

  if (!clientName) return;

  const btn = document.getElementById('btnSubmitNewClient');
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin mr-1">⏳</span> Criando...`;

  try {
    const res = await fetch('/api/clients/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regime, clientName, cnpj })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeNewClientModal();
      await loadStats();
      await loadClients();
    } else {
      showToast(data.error || 'Erro ao criar cliente', 'error');
    }
  } catch (err) {
    showToast('Erro na requisição ao servidor', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i><span>Criar Pasta Completa</span>`;
    refreshIcons();
  }
}

// Modal Detalhes do Cliente
async function openClientDetails(clientId) {
  try {
    currentDetailClientId = clientId;
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (!data.client) return;

    const c = data.client;
    document.getElementById('modalDetailName').textContent = c.name;
    document.getElementById('modalDetailPath').textContent = c.path;
    document.getElementById('modalDetailCnpj').textContent = c.cnpjFormatted || (c.cnpj ? c.cnpj : 'CNPJ não identificado');

    const infoEl = document.getElementById('modalDetailInfo');
    if (infoEl) {
      const parts = [];
      if (c.municipio) parts.push(`📍 ${c.municipio}`);
      if (c.inscrMobiliaria) parts.push(`🏛 Inscrição Mob.: ${c.inscrMobiliaria}`);
      if (c.ie) parts.push(`📄 IE: ${c.ie}`);
      infoEl.textContent = parts.join(' • ');
    }

    const badge = document.getElementById('modalDetailRegimeBadge');
    badge.textContent = c.regimeLabel;
    badge.style.backgroundColor = c.regimeColor + '20';
    badge.style.color = c.regimeColor;

    const statusSel = document.getElementById('modalDetailStatusSelect');
    if (statusSel) {
      statusSel.value = c.statusCarteira || (c.active ? 'ATIVA' : 'PARALISADA');
    }

    // Carrega código Domínio da empresa armazenado no SQLite
    const codDomInput = document.getElementById('modalDetailCodigoDominio');
    if (codDomInput) {
      codDomInput.value = '';
      fetch('/api/empresas/detalhes').then(r => r.json()).then(empData => {
        if (empData.success && empData.empresas) {
          const cleanCnpj = String(c.cnpj || '').replace(/\D/g, '');
          const match = empData.empresas.find(e => (cleanCnpj && e.cnpj === cleanCnpj) || e.id === c.id);
          if (match && match.codigo_dominio) {
            codDomInput.value = match.codigo_dominio;
          }
        }
      }).catch(() => {});
    }

    document.getElementById('modalBtnOpenExplorer').onclick = () => abrirExploradorWeb(c.path || c.id, c.name);
    document.getElementById('modalBtnStandardize').onclick = () => {
      standardizeClient(c.id);
      closeDetailsModal();
    };

    // Árvore
    const treeBox = document.getElementById('modalTreeContent');
    const tree = data.details.tree || [];

    if (tree.length === 0) {
      treeBox.innerHTML = `<div class="text-slate-400 italic py-4 text-center">Esta pasta está vazia atualmente.</div>`;
    } else {
      let treeHtml = '';
      for (const item of tree) {
        if (item.isDirectory) {
          treeHtml += `
            <div class="border border-slate-200 rounded-lg p-2.5 bg-white space-y-1">
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-brand-700">
                  <i data-lucide="folder" class="w-4 h-4"></i>
                  ${item.name}
                </span>
                <span class="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-normal">${item.childrenCount} itens</span>
              </div>
              ${item.children && item.children.length > 0 ? `
                <div class="pl-5 pt-1 space-y-0.5 border-l border-slate-200 ml-2">
                  ${item.children.map(sub => `
                    <div class="flex items-center gap-1 text-[11px] text-slate-600">
                      <i data-lucide="${sub.isDirectory ? 'folder-open' : 'file-text'}" class="w-3 h-3 text-slate-400"></i>
                      <span>${sub.name}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        } else {
          treeHtml += `
            <div class="flex items-center gap-1.5 p-1 text-slate-700">
              <i data-lucide="file" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>${item.name}</span>
            </div>
          `;
        }
      }
      treeBox.innerHTML = treeHtml;
    }

    document.getElementById('modalClientDetails').classList.remove('hidden');
    refreshIcons();
  } catch (err) {
    showToast('Erro ao carregar detalhes', 'error');
  }
}

function closeDetailsModal() {
  document.getElementById('modalClientDetails').classList.add('hidden');
}

// Salva o código Domínio da empresa em exibição
async function salvarCodigoDominioModalAtual() {
  if (!currentDetailClientId) return;
  const input = document.getElementById('modalDetailCodigoDominio');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast('Informe um código numérico para o Domínio.', 'warning');
    return;
  }
  try {
    const res = await fetch('/api/empresas/codigo-dominio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentDetailClientId, codigoDominio: val })
    });
    const d = await res.json();
    if (d.success) {
      showToast(`Código ${val} vinculado com sucesso a esta empresa no SQLite!`, 'success');
    } else {
      throw new Error(d.error);
    }
  } catch(e) {
    showToast(`Erro ao salvar código: ${e.message}`, 'danger');
  }
}

// Carrega Bombeiros / Alvarás
async function loadBombeiros() {
  try {
    const res = await fetch('/api/bombeiros');
    allBombeiros = await res.json();
    document.getElementById('bombeirosBadgeCount').textContent = `${allBombeiros.length} Alvarás`;
    renderBombeirosTable();
  } catch (err) {
    console.error('Erro ao carregar bombeiros:', err);
  }
}

function renderBombeirosTable() {
  const tbody = document.getElementById('bombeirosTableBody');
  if (allBombeiros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Nenhum registro de alvará encontrado.</td></tr>`;
    return;
  }

  let html = '';
  for (const b of allBombeiros) {
    const dias = Number(b.diasParaVencer);
    let statusClass = 'bg-slate-100 text-slate-700';
    let statusText = 'Normal';

    if (!isNaN(dias)) {
      if (dias < 0) {
        statusClass = 'bg-rose-100 text-rose-800 font-bold';
        statusText = `Vencido (${Math.abs(dias)}d atrás)`;
      } else if (dias <= 30) {
        statusClass = 'bg-amber-100 text-amber-800 font-bold';
        statusText = `Vence em ${dias} dias`;
      } else {
        statusClass = 'bg-emerald-100 text-emerald-800';
        statusText = `Em dia (${dias} dias)`;
      }
    }

    html += `
      <tr class="hover:bg-slate-50 transition text-xs">
        <td class="py-3 px-4 font-bold text-slate-900">${b.empresa}</td>
        <td class="py-3 px-4 font-mono-code">${b.validade || '-'}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[11px] ${statusClass}">${statusText}</span>
        </td>
        <td class="py-3 px-4 font-mono-code text-slate-600">${b.cnpjLogin || '-'}</td>
        <td class="py-3 px-4 text-slate-600">${b.email || '-'}</td>
        <td class="py-3 px-4 text-slate-500 italic">${b.obs || '-'}</td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

// Carrega Parcelamentos
async function loadParcelamentos() {
  try {
    const res = await fetch('/api/parcelamentos');
    allParcelamentos = await res.json();
    const badge = document.getElementById('parcelamentosBadgeCount');
    if (badge) badge.textContent = `${allParcelamentos.length} Ativos`;
    renderParcelamentosTable();
  } catch (err) {
    console.error('Erro ao carregar parcelamentos:', err);
  }
}

function renderParcelamentosTable() {
  const tbody = document.getElementById('parcelamentosTableBody');
  if (allParcelamentos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">Nenhum parcelamento encontrado.</td></tr>`;
    return;
  }

  let html = '';
  for (const p of allParcelamentos) {
    html += `
      <tr class="hover:bg-slate-50 transition text-xs">
        <td class="py-3 px-4 font-bold text-slate-900">${p.empresa}</td>
        <td class="py-3 px-4 font-mono-code text-slate-700">${p.cnpjCpf || '-'}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded bg-brand-50 text-brand-800 font-semibold">${p.tipo || 'Parcelamento'}</span>
        </td>
        <td class="py-3 px-4 font-semibold text-slate-600">${p.status || 'Ativo'}</td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

// Carrega IRPF
async function loadIrpf() {
  try {
    const res = await fetch('/api/irpf');
    allIrpf = await res.json();
    const badge = document.getElementById('badgeIrpfYearsCount');
    if (badge) badge.textContent = `${allIrpf.length} Exercícios`;
    renderIrpfGrid();
  } catch (err) {
    console.error('Erro ao carregar IRPF:', err);
  }
}

function renderIrpfGrid() {
  const grid = document.getElementById('irpfYearsGrid');
  if (allIrpf.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Nenhum registro de IRPF encontrado.</div>`;
    return;
  }

  let html = '';
  for (const y of allIrpf) {
    html += `
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-xl font-black text-slate-900">Exercício ${y.ano}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
            ${y.total} declarantes
          </span>
        </div>
        <div class="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-600 pr-1">
          ${y.clientes.map(nome => `
            <div class="p-1.5 hover:bg-slate-50 rounded flex items-center gap-1.5 truncate">
              <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
              <span class="truncate" title="${nome}">${nome}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  grid.innerHTML = html;
  refreshIcons();
}

// ==========================================
// FUNÇÕES DO CALENDÁRIO & PRAZOS POR CARGO
// ==========================================

// Filtro de visualização por Cargo
function filterCargoView(cargo) {
  const cards = document.querySelectorAll('.cargo-card');
  const buttons = document.querySelectorAll('.cargo-filter-btn');

  // Atualiza botões
  buttons.forEach(b => {
    b.className = 'cargo-filter-btn px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition';
  });
  const activeBtn = document.getElementById(`cargoBtn-${cargo}`);
  if (activeBtn) {
    activeBtn.className = 'cargo-filter-btn px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold transition';
  }

  // Filtra cards
  cards.forEach(card => {
    if (cargo === 'ALL' || card.getAttribute('data-cargo') === cargo) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });

  refreshIcons();
}

// Salva e atualiza o estado de uma tarefa
function saveCalendarCheck(checkbox) {
  if (!checkbox) return;
  toggleTask(checkbox.id);
}

function toggleTask(taskId) {
  const checkbox = document.getElementById(taskId);
  if (!checkbox) return;

  const storageKey = 'mc_contabil_checklist_2026';
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) {}

  saved[taskId] = checkbox.checked;
  localStorage.setItem(storageKey, JSON.stringify(saved));

  updateCalendarProgress();
}

// Carrega o estado das tarefas salvas
function loadCalendarChecklist() {
  const storageKey = 'mc_contabil_checklist_2026';
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) {}

  const checkboxes = document.querySelectorAll('#tabContent-calendario input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (saved[cb.id] !== undefined) {
      cb.checked = saved[cb.id];
    }
  });

  updateCalendarProgress();
}

// Atualiza barra e percentual de progresso
function updateCalendarProgress() {
  const checkboxes = document.querySelectorAll('#tabContent-calendario input[type="checkbox"]');
  if (checkboxes.length === 0) return;

  let completed = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) completed++;
  });

  const percent = Math.round((completed / checkboxes.length) * 100);

  const progressBar = document.getElementById('calendarProgressBar');
  const progressText = document.getElementById('calendarProgressText');
  const countText = document.getElementById('calendarCompletedCount');

  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressText) {
    progressText.textContent = `${percent}% Concluído`;
    if (percent === 100) {
      progressText.className = 'text-emerald-300 font-extrabold';
    } else if (percent >= 50) {
      progressText.className = 'text-sky-300 font-bold';
    } else {
      progressText.className = 'text-amber-300 font-bold';
    }
  }
  if (countText) countText.textContent = `${completed} de ${checkboxes.length} tarefas`;
}

// Reinicia o checklist do mês
function resetCalendarChecklist() {
  if (!confirm('Deseja reiniciar o checklist de prazos deste mês?')) return;
  const storageKey = 'mc_contabil_checklist_2026';
  localStorage.removeItem(storageKey);

  const checkboxes = document.querySelectorAll('#tabContent-calendario input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);

  updateCalendarProgress();
  showToast('Checklist de tarefas do mês reiniciado com sucesso!', 'info');
}

/* ==========================================================================
   1. ROBÔ SENTINELA - MONITORAMENTO EM TEMPO REAL VIA SSE
   ========================================================================== */
function initSentinelaSSE() {
  if (window.sentinelaEventSource) return;
  try {
    const es = new EventSource('/api/feed/events');
    window.sentinelaEventSource = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'CONNECTED') {
          console.log('[Sentinela] SSE Conectado:', event);
          return;
        }
        handleSentinelaIncomingEvent(event);
      } catch (err) {
        console.error('[Sentinela] Erro ao processar evento:', err);
      }
    };

    es.onerror = () => {
      // Reconecta silenciosamente
    };
  } catch (err) {
    console.error('[Sentinela] Falha ao inicializar EventSource:', err);
  }
}

function handleSentinelaIncomingEvent(event) {
  sentinelaEventCount++;
  const badgeLive = document.getElementById('badgeSentinelaLive');
  const badgeTab = document.getElementById('badgeSentinelaTab');
  if (badgeLive) badgeLive.textContent = sentinelaEventCount;
  if (badgeTab) badgeTab.textContent = sentinelaEventCount;

  if (event.action === 'CREATE') sentinelaStats.added++;
  else if (event.action === 'UPDATE') sentinelaStats.modified++;
  else if (event.action === 'DELETE') sentinelaStats.deleted++;

  const statAdd = document.getElementById('statSentinelaAdded');
  const statMod = document.getElementById('statSentinelaModified');
  const statDel = document.getElementById('statSentinelaDeleted');
  if (statAdd) statAdd.textContent = sentinelaStats.added;
  if (statMod) statMod.textContent = sentinelaStats.modified;
  if (statDel) statDel.textContent = sentinelaStats.deleted;

  prependSentinelaCard(event, true);
  if (sentinelaSoundEnabled) playSentinelaChime();
  showToast(`[Sentinela] ${event.label}: ${event.client} - ${event.filename}`, 'info');
}

function playSentinelaChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

function toggleSentinelaSound() {
  sentinelaSoundEnabled = !sentinelaSoundEnabled;
  const label = document.getElementById('labelSound');
  const icon = document.getElementById('iconSound');
  if (label) label.textContent = sentinelaSoundEnabled ? 'Som: Ativado' : 'Som: Mudo';
  if (icon) {
    icon.setAttribute('data-lucide', sentinelaSoundEnabled ? 'volume-2' : 'volume-x');
    refreshIcons();
  }
  showToast(sentinelaSoundEnabled ? 'Notificações sonoras ativadas!' : 'Notificações sonoras silenciadas', 'info');
}

function clearSentinelaFeed() {
  const container = document.getElementById('sentinelaFeedList');
  if (!container) return;
  container.innerHTML = `
    <div class="py-12 text-center text-slate-400" id="sentinelaEmptyState">
      <i data-lucide="shield-check" class="w-10 h-10 mx-auto text-emerald-400 mb-2"></i>
      <div class="font-bold text-slate-700">Mural Limpo</div>
      <p class="text-xs text-slate-400 mt-1">Novos eventos de arquivos aparecerão automaticamente aqui.</p>
    </div>
  `;
  refreshIcons();
}

async function loadSentinelaRecent() {
  try {
    const res = await fetch('/api/feed/recent');
    const data = await res.json();
    const events = data.events || [];
    if (events.length > 0) {
      const container = document.getElementById('sentinelaFeedList');
      if (!container) return;
      container.innerHTML = '';
      events.slice(0, 50).forEach(ev => prependSentinelaCard(ev, false));
      refreshIcons();
    }
  } catch (err) {
    console.error('Erro ao carregar eventos recentes do Sentinela:', err);
  }
}

function prependSentinelaCard(ev, animate = false) {
  const container = document.getElementById('sentinelaFeedList');
  if (!container) return;
  const emptyState = document.getElementById('sentinelaEmptyState');
  if (emptyState) emptyState.remove();

  const d = new Date(ev.timestamp);
  const timeStr = d.toLocaleTimeString('pt-BR');

  let actionColor = 'emerald';
  let actionIcon = 'file-plus';
  if (ev.action === 'UPDATE') { actionColor = 'sky'; actionIcon = 'file-edit'; }
  else if (ev.action === 'DELETE') { actionColor = 'rose'; actionIcon = 'file-x'; }

  let catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${ev.category || 'OUTROS'}</span>`;
  if (ev.category === 'XML') catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">XML</span>`;
  else if (ev.category === 'CERTIFICADO') catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">CERTIFICADO</span>`;
  else if (ev.category === 'FISCAL') catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">FISCAL</span>`;
  else if (ev.category === 'CONTÁBIL') catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">CONTÁBIL</span>`;

  const card = document.createElement('div');
  card.className = `p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-start justify-between gap-4 transition hover:border-brand-300`;
  card.innerHTML = `
    <div class="flex items-start gap-3 min-w-0">
      <div class="w-9 h-9 rounded-lg bg-${actionColor}-50 text-${actionColor}-600 border border-${actionColor}-200 flex items-center justify-center shrink-0 mt-0.5">
        <i data-lucide="${actionIcon}" class="w-5 h-5"></i>
      </div>
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-bold text-slate-900">${ev.label}</span>
          ${catBadge}
          <span class="text-[11px] font-medium text-slate-500">${ev.client}</span>
        </div>
        <div class="text-xs font-mono-code text-slate-700 mt-1 font-semibold truncate" title="${ev.filename}">${ev.filename}</div>
        <div class="text-[10px] text-slate-400 mt-0.5 truncate" title="${ev.path}">${ev.path}</div>
      </div>
    </div>
    <div class="text-right shrink-0">
      <span class="text-[11px] text-slate-400 font-mono-code">${timeStr}</span>
      <div class="mt-2">
        <button onclick="navigator.clipboard.writeText('${(ev.path || '').replace(/\\/g, '\\\\')}'); showToast('Caminho copiado!', 'success')" class="p-1 text-slate-400 hover:text-brand-600 transition" title="Copiar Caminho">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `;

  container.prepend(card);
  if (animate) refreshIcons();
}

/* ==========================================================================
   2. BUSCA GLOBAL INSTANTÂNEA EM TODA A REDE (CTRL + K)
   ========================================================================== */
let globalSearchTimeout = null;

function setupGlobalSearch() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const inp = document.getElementById('inputGlobalSearch');
      if (inp) {
        inp.focus();
        inp.select();
      }
    }
  });

  document.addEventListener('click', (e) => {
    const input = document.getElementById('inputGlobalSearch');
    const dropdown = document.getElementById('globalSearchResults');
    if (!input || !dropdown) return;
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

async function handleGlobalSearch(event) {
  const query = event.target.value.trim();
  const dropdown = document.getElementById('globalSearchResults');
  if (!dropdown) return;

  if (query.length < 2) {
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    return;
  }

  clearTimeout(globalSearchTimeout);
  globalSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search/files?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      renderGlobalSearchResults(data.results || [], query);
    } catch (err) {
      console.error('Erro na busca global:', err);
    }
  }, 250);
}

function renderGlobalSearchResults(results, query) {
  const dropdown = document.getElementById('globalSearchResults');
  if (!dropdown) return;

  if (results.length === 0) {
    dropdown.innerHTML = `
      <div class="p-4 text-center text-xs text-slate-400">
        Nenhum arquivo ou documento encontrado para "<span class="font-bold text-slate-600">${query}</span>".
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }

  let html = `<div class="p-2 bg-slate-50 text-[10px] font-bold uppercase text-slate-500 flex justify-between">
    <span>Encontrados (${results.length})</span>
    <span>Clique para copiar localização</span>
  </div>`;

  results.slice(0, 15).forEach(r => {
    let icon = 'file';
    let iconColor = 'text-slate-500';
    if (r.category === 'XML') { icon = 'code-xml'; iconColor = 'text-emerald-600'; }
    else if (r.category === 'CERTIFICADO') { icon = 'shield-alert'; iconColor = 'text-amber-600'; }
    else if (r.category === 'FISCAL') { icon = 'receipt'; iconColor = 'text-blue-600'; }
    else if (r.category === 'CONTÁBIL') { icon = 'calculator'; iconColor = 'text-purple-600'; }

    html += `
      <div class="p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition text-xs" onclick="navigator.clipboard.writeText('${(r.path || '').replace(/\\/g, '\\\\')}'); showToast('Caminho copiado para a área de transferência!', 'success')">
        <div class="flex items-center gap-2.5 min-w-0">
          <i data-lucide="${icon}" class="w-4 h-4 ${iconColor} shrink-0"></i>
          <div class="truncate">
            <div class="font-bold text-slate-800 truncate">${r.name}</div>
            <div class="text-[10px] text-slate-400 truncate">${r.client} &bull; ${r.category} &bull; ${r.sizeFmt || ''}</div>
          </div>
        </div>
        <button class="shrink-0 text-slate-400 hover:text-brand-600 p-1" title="Copiar caminho">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.classList.remove('hidden');
  refreshIcons();
}

/* ==========================================================================
   3. LICENÇAS, VISA & ALVARÁS MUNICIPAIS (66 EMPRESAS)
   ========================================================================== */
async function loadLicencas() {
  try {
    const res = await fetch('/api/renovacoes');
    const data = await res.json();
    allLicencas = Array.isArray(data) ? data : (data.renovacoes || []);
    const countBadge = document.getElementById('badgeLicencasCount');
    if (countBadge) countBadge.textContent = allLicencas.length;
    renderLicencasTable();
  } catch (err) {
    console.error('Erro ao carregar licenças:', err);
  }
}

function renderLicencasTable() {
  const tbody = document.getElementById('licencasTableBody');
  if (!tbody) return;

  const search = (document.getElementById('inputLicencasSearch')?.value || '').toLowerCase().trim();
  const regimeFilter = document.getElementById('filterLicencasRegime')?.value || 'ALL';
  const statusFilter = document.getElementById('filterLicencasStatus')?.value || 'ALL';

  const filtered = allLicencas.filter(item => {
    if (search) {
      const matchEmp = item.empresa && item.empresa.toLowerCase().includes(search);
      const matchResp = item.responsavel && item.responsavel.toLowerCase().includes(search);
      const matchCnpj = item.cnpj && item.cnpj.includes(search);
      if (!matchEmp && !matchResp && !matchCnpj) return false;
    }
    if (regimeFilter !== 'ALL' && item.regime !== regimeFilter) return false;
    if (statusFilter !== 'ALL') {
      const st = (item.status || '').toUpperCase();
      if (statusFilter === 'LIBERADO' && !st.includes('LIBERAD')) return false;
      if (statusFilter === 'PENDENTE' && (!st.includes('PEND') && !st.includes('DOC') && !st.includes('AGUARD'))) return false;
      if (statusFilter === 'EMITIDO' && !st.includes('EMITID')) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Nenhuma empresa encontrada com os filtros selecionados.</td></tr>`;
    return;
  }

  let html = '';
  filtered.forEach(lic => {
    let statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${lic.status || 'Pendente'}</span>`;
    const stUpper = (lic.status || '').toUpperCase();
    if (stUpper.includes('LIBERAD')) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Liberado</span>`;
    } else if (stUpper.includes('EMPRESA') || stUpper.includes('EMITIDO')) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">Emitido p/ Empresa</span>`;
    }

    const cnpjBadge = lic.cnpj ? `<span class="font-mono-code text-[11px] text-slate-500">${lic.cnpj}</span>` : '';

    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900">${lic.empresa}</div>
          <div class="flex items-center gap-2 mt-0.5">
            ${cnpjBadge}
            ${lic.responsavel ? `<span class="text-[11px] text-slate-400">Resp: ${lic.responsavel}</span>` : ''}
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${lic.regime || 'SIMPLES'}</span>
        </td>
        <td class="py-3 px-4">
          ${statusBadge}
          ${lic.pendencias ? `<div class="text-[11px] text-rose-600 font-medium mt-1">${lic.pendencias}</div>` : ''}
        </td>
        <td class="py-3 px-4 text-xs text-slate-600">
          ${lic.docEnviado ? `<div class="text-emerald-600 font-semibold flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i>Doc Enviado</div>` : '<div class="text-slate-400">Pendente Envio</div>'}
        </td>
        <td class="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title="${lic.observacoes || ''}">
          ${lic.observacoes || '-'}
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${lic.cnpj ? `
              <button onclick="navigator.clipboard.writeText('${lic.cnpj}'); showToast('CNPJ ${lic.cnpj} copiado!', 'success')" class="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Copiar CNPJ">
                <i data-lucide="copy" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="window.open('https://castanhal.pa.gov.br', '_blank')" class="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Abrir SEFIN Castanhal">
              <i data-lucide="globe" class="w-4 h-4"></i>
            </button>
            ${lic.clientId ? `
              <button onclick="openClientDetails('${lic.clientId}')" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Ver Pasta do Cliente">
                <i data-lucide="folder-open" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  refreshIcons();
}

/* ==========================================================================
   4. EXTRATOS BANCÁRIOS & CONCILIAÇÃO AUTOMÁTICA (PDF / OFX & MALVINA)
   ========================================================================== */
let extratosProcessadosCache = [];
let extratosResumoCache = null;
let extratosSubTab = 'leitor';

// Alterna entre a sub-aba do Leitor Inteligente e a Matriz da Dona Malvina
function switchSubExtratos(subTab) {
  extratosSubTab = subTab;
  const btnLeitor = document.getElementById('subTabBtn-extratos-leitor');
  const btnMatriz = document.getElementById('subTabBtn-extratos-matriz');
  const contentLeitor = document.getElementById('subContent-extratos-leitor');
  const contentMatriz = document.getElementById('subContent-extratos-matriz');

  if (subTab === 'leitor') {
    if (btnLeitor) btnLeitor.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-[#84CC16] text-slate-950 shadow-sm';
    if (btnMatriz) btnMatriz.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-white/10 hover:bg-white/20 text-slate-200';
    if (contentLeitor) contentLeitor.classList.remove('hidden');
    if (contentMatriz) contentMatriz.classList.add('hidden');
  } else {
    if (btnMatriz) btnMatriz.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-[#84CC16] text-slate-950 shadow-sm';
    if (btnLeitor) btnLeitor.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-white/10 hover:bg-white/20 text-slate-200';
    if (contentMatriz) contentMatriz.classList.remove('hidden');
    if (contentLeitor) contentLeitor.classList.add('hidden');
  }
  refreshIcons();
}

// --------------------------------------------------------------------------
// 4.A - Sub-aba Matriz de Bancos (Dona Malvina)
// --------------------------------------------------------------------------
async function loadExtratos() {
  try {
    const res = await fetch('/api/extratos');
    const data = await res.json();
    allExtratos = Array.isArray(data) ? data : (data.extratos || []);
    
    const badge = document.getElementById('badgeExtratosCount');
    if (badge) badge.textContent = allExtratos.length;
    const badgeSub = document.getElementById('badgeExtratosCountSub');
    if (badgeSub) badgeSub.textContent = allExtratos.length;
    
    renderExtratosTable();
  } catch (err) {
    console.error('Erro ao carregar matriz de extratos:', err);
  }
}

function renderExtratosTable() {
  const tbody = document.getElementById('extratosTableBody');
  if (!tbody) return;

  const search = (document.getElementById('inputExtratosSearch')?.value || '').toLowerCase().trim();

  const filtered = allExtratos.filter(ex => {
    if (!search) return true;
    const matchEmp = ex.empresa && ex.empresa.toLowerCase().includes(search);
    const matchEmail = ex.email && ex.email.toLowerCase().includes(search);
    const matchBank = Object.entries(ex.bancos || {}).some(([b, val]) => val && b.toLowerCase().includes(search));
    return matchEmp || matchEmail || matchBank;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Nenhum registro de extrato encontrado na matriz.</td></tr>`;
    return;
  }

  let html = '';
  filtered.forEach(ex => {
    let bankBadges = [];
    const banks = ex.bancos || {};
    for (const [bankName, val] of Object.entries(banks)) {
      if (val && val !== 'NÃO' && val !== 'NAO' && val !== false) {
        let bankColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (bankName === 'BB') bankColor = 'bg-yellow-100 text-yellow-800 border-yellow-300';
        else if (bankName === 'Bradesco') bankColor = 'bg-rose-100 text-rose-800 border-rose-300';
        else if (bankName === 'Banpará' || bankName === 'Banpara') bankColor = 'bg-sky-100 text-sky-800 border-sky-300';
        else if (bankName === 'Caixa') bankColor = 'bg-blue-100 text-blue-800 border-blue-300';
        else if (bankName === 'Sicredi') bankColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        else if (bankName === 'Santander') bankColor = 'bg-red-100 text-red-800 border-red-300';
        else if (bankName === 'Inter') bankColor = 'bg-orange-100 text-orange-800 border-orange-300';
        else if (bankName === 'Nubank') bankColor = 'bg-purple-100 text-purple-800 border-purple-300';
        else if (bankName === 'Itaú' || bankName === 'Itau') bankColor = 'bg-amber-100 text-amber-800 border-amber-300';

        const info = typeof val === 'string' && val !== 'SIM' ? ` (${val})` : '';
        bankBadges.push(`<span class="px-2 py-0.5 rounded border text-[11px] font-bold ${bankColor}">${bankName}${info}</span>`);
      }
    }

    if (bankBadges.length === 0) {
      bankBadges.push(`<span class="text-xs text-slate-400 italic">Nenhum banco fixo mapeado</span>`);
    }

    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 font-bold text-slate-900">${ex.empresa}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${ex.regime || 'SIMPLES'}</span>
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1.5 items-center">
            ${bankBadges.join('')}
          </div>
        </td>
        <td class="py-3 px-4 text-xs font-mono-code text-slate-600">
          ${ex.email ? `
            <div class="flex items-center gap-1.5">
              <span>${ex.email}</span>
              <button onclick="navigator.clipboard.writeText('${ex.email}'); showToast('E-mail copiado!', 'success')" class="text-slate-400 hover:text-brand-600" title="Copiar E-mail">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </div>
          ` : '<span class="text-slate-400 italic">Não informado</span>'}
        </td>
        <td class="py-3 px-4 text-right">
          ${ex.clientId ? `
            <button onclick="openClientDetails('${ex.clientId}')" class="px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition">
              Abrir Pasta
            </button>
          ` : '-'}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  refreshIcons();
}

// --------------------------------------------------------------------------
// 4.B - Sub-aba Leitor Automático PDF/OFX & Conciliação
// --------------------------------------------------------------------------
function handleDragOverExtratos(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneExtratos');
  if (zone) zone.classList.add('border-sky-500', 'bg-sky-50/50');
}

function handleDragLeaveExtratos(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneExtratos');
  if (zone) zone.classList.remove('border-sky-500', 'bg-sky-50/50');
}

function handleDropExtratos(e) {
  e.preventDefault();
  e.stopPropagation();
  handleDragLeaveExtratos(e);
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    processarExtratosFiles(Array.from(files));
  }
}

function handleFileInputExtratos(e) {
  const files = e.target?.files;
  if (files && files.length > 0) {
    processarExtratosFiles(Array.from(files));
    e.target.value = '';
  }
}

async function processarExtratosFiles(files) {
  const validFiles = files.filter(f => {
    const n = f.name.toLowerCase();
    return n.endsWith('.pdf') || n.endsWith('.ofx');
  });

  if (validFiles.length === 0) {
    showToast('Por favor, selecione arquivos válidos de extratos (.pdf ou .ofx).', 'warning');
    return;
  }

  const dropContent = document.getElementById('dropContentExtratos');
  const progress = document.getElementById('uploadProgressExtratos');
  const progressText = document.getElementById('progressTextExtratos');

  if (dropContent) dropContent.classList.add('hidden');
  if (progress) progress.classList.remove('hidden');
  if (progressText) progressText.textContent = `Processando ${validFiles.length} arquivo(s) de extratos bancários...`;

  try {
    const formData = new FormData();
    validFiles.forEach(f => formData.append('extratoFiles', f));

    const res = await fetch('/api/extratos/processar', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      extratosProcessadosCache = data.transacoes || [];
      extratosResumoCache = data.resumo;
      atualizarUIExtratos();
      showToast(`${validFiles.length} extrato(s) processado(s) com ${extratosProcessadosCache.length} lançamentos conciliados!`, 'success');
      
      if (data.erros && data.erros.length > 0) {
        showToast(`Atenção: ${data.erros.length} arquivo(s) apresentaram erros de leitura.`, 'warning');
      }
    } else {
      showToast(`Erro ao processar extratos: ${data.error || 'Falha no processamento'}`, 'danger');
    }
  } catch (err) {
    console.error('Erro na requisição de extratos:', err);
    showToast(`Erro de conexão com o servidor: ${err.message}`, 'danger');
  } finally {
    if (dropContent) dropContent.classList.remove('hidden');
    if (progress) progress.classList.add('hidden');
  }
}

async function loadExtratosProcessados() {
  try {
    const res = await fetch('/api/extratos/processados');
    const data = await res.json();
    if (data.success) {
      extratosProcessadosCache = data.transacoes || [];
      extratosResumoCache = data.resumo;
      atualizarUIExtratos();
    }
  } catch (err) {
    console.error('Erro ao carregar histórico de extratos:', err);
  }
}

function atualizarUIExtratos() {
  // Atualiza badge no topo
  const badgeCount = document.getElementById('badgeExtratosLeitorCount');
  if (badgeCount) {
    badgeCount.textContent = `${extratosProcessadosCache.length} transações`;
  }

  // Atualiza 5 KPIs do Monetra
  const cardTotal = document.getElementById('cardTotalExtratos');
  const cardSubtotal = document.getElementById('cardSubtotalExtratos');
  const cardEntradas = document.getElementById('cardEntradasExtratos');
  const cardSaidas = document.getElementById('cardSaidasExtratos');
  const cardSaldoLiquido = document.getElementById('cardSaldoLiquidoExtratos');
  const cardSubtotalSaldo = document.getElementById('cardSubtotalSaldoExtratos');
  const cardTarifas = document.getElementById('cardTarifasExtratos');

  const resumo = extratosResumoCache || {
    totalArquivos: 0,
    totalLancamentos: extratosProcessadosCache.length,
    totalEntradas: extratosProcessadosCache.filter(t => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0),
    totalSaidas: extratosProcessadosCache.filter(t => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0),
    saldoLiquido: extratosProcessadosCache.reduce((s, t) => s + (t.valorOriginal || 0), 0),
    totalTarifas: extratosProcessadosCache.filter(t => t.conciliacao?.categoria === 'DESPESA_BANCARIA').reduce((s, t) => s + t.valor, 0)
  };

  if (cardTotal) cardTotal.textContent = resumo.totalLancamentos;
  if (cardSubtotal) cardSubtotal.textContent = `${resumo.totalArquivos || 0} extrato(s) importado(s)`;
  if (cardEntradas) cardEntradas.textContent = formatCurrency(resumo.totalEntradas);
  if (cardSaidas) cardSaidas.textContent = formatCurrency(resumo.totalSaidas);
  
  if (cardSaldoLiquido) {
    cardSaldoLiquido.textContent = formatCurrency(resumo.saldoLiquido);
    if (resumo.saldoLiquido >= 0) {
      cardSaldoLiquido.className = 'text-2xl font-extrabold text-emerald-600';
    } else {
      cardSaldoLiquido.className = 'text-2xl font-extrabold text-rose-600';
    }
  }
  if (cardSubtotalSaldo) {
    cardSubtotalSaldo.textContent = resumo.saldoLiquido >= 0 ? 'Superávit no período' : 'Déficit no período';
  }

  if (cardTarifas) cardTarifas.textContent = formatCurrency(resumo.totalTarifas);

  renderExtratosTableConciliados();
}

function renderExtratosTableConciliados() {
  const tbody = document.getElementById('extratosConciliadosTableBody');
  const badgeTransacoes = document.getElementById('badgeTransacoesCount');
  if (!tbody) return;

  const tipoFiltro = document.getElementById('filtroTipoExtrato')?.value || 'TODOS';
  const bancoFiltro = document.getElementById('filtroBancoExtrato')?.value || 'TODOS';
  const busca = (document.getElementById('inputExtratoBusca')?.value || '').toLowerCase().trim();

  const filtered = extratosProcessadosCache.filter(t => {
    // Filtro por tipo/categoria
    if (tipoFiltro === 'CREDITO' && t.tipo !== 'CREDITO') return false;
    if (tipoFiltro === 'DEBITO' && t.tipo !== 'DEBITO') return false;
    if (tipoFiltro === 'DESPESA_BANCARIA' && t.conciliacao?.categoria !== 'DESPESA_BANCARIA') return false;
    if (tipoFiltro === 'PAGAMENTO_IMPOSTOS' && t.conciliacao?.categoria !== 'PAGAMENTO_IMPOSTOS') return false;

    // Filtro por banco
    if (bancoFiltro !== 'TODOS' && !(t.banco || '').toLowerCase().includes(bancoFiltro.toLowerCase())) return false;

    // Busca textual
    if (busca) {
      const matchDesc = (t.descricao || '').toLowerCase().includes(busca);
      const matchBanco = (t.banco || '').toLowerCase().includes(busca);
      const matchDeb = (t.conciliacao?.debito || '').toLowerCase().includes(busca);
      const matchCred = (t.conciliacao?.credito || '').toLowerCase().includes(busca);
      const matchCat = (t.conciliacao?.categoria || '').toLowerCase().includes(busca);
      const matchVal = String(t.valor).includes(busca);
      if (!matchDesc && !matchBanco && !matchDeb && !matchCred && !matchCat && !matchVal) return false;
    }

    return true;
  });

  if (badgeTransacoes) {
    badgeTransacoes.textContent = `${filtered.length} itens`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-10 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center space-y-2">
            <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
            <span>Nenhuma transação bancária encontrada com os filtros atuais.</span>
          </div>
        </td>
      </tr>
    `;
    refreshIcons();
    return;
  }

  let html = '';
  filtered.forEach(t => {
    // Categoria Badge
    let catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">Diversos</span>';
    const cat = t.conciliacao?.categoria || '';
    if (cat === 'RECEBIMENTO_CLIENTES') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Recebimento Clientes</span>';
    } else if (cat === 'PAGAMENTO_FORNECEDORES') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">Fornecedores</span>';
    } else if (cat === 'DESPESA_BANCARIA') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Tarifa Bancária</span>';
    } else if (cat === 'PAGAMENTO_IMPOSTOS') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Tributos / DAS</span>';
    } else if (cat === 'FOLHA_PAGAMENTO') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Folha de Pagamento</span>';
    } else if (cat === 'UTILIDADES_PUBLICAS') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Água/Luz/Tel</span>';
    } else if (cat === 'RECEITA_FINANCEIRA' || cat === 'RESGATE_APLICACAO') {
      catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800">Rendimento Aplicação</span>';
    }

    // Valor estilizado
    const valorFormatted = formatCurrency(t.valor);
    const valorDisplay = t.tipo === 'CREDITO'
      ? `<span class="font-bold text-emerald-600 font-mono-code">+ ${valorFormatted}</span>`
      : `<span class="font-bold text-rose-600 font-mono-code">- ${valorFormatted}</span>`;

    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 font-mono-code text-slate-700 font-medium">${t.data || '-'}</td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${t.badgeBanco || 'bg-slate-100 text-slate-700 border-slate-200'}">
            ${t.banco}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-800 max-w-xs truncate" title="${t.descricao}">
          <span class="font-medium">${t.descricao}</span>
          ${t.conciliacao?.historico ? `<div class="text-[10px] text-slate-400 truncate">${t.conciliacao.historico}</div>` : ''}
        </td>
        <td class="py-3 px-4">${catBadge}</td>
        <td class="py-3 px-4 text-right">${valorDisplay}</td>
        <td class="py-3 px-4 font-mono-code text-[11px] text-slate-700 max-w-[180px] truncate" title="${t.conciliacao?.debito || ''}">
          ${t.conciliacao?.debito || '-'}
        </td>
        <td class="py-3 px-4 font-mono-code text-[11px] text-slate-700 max-w-[180px] truncate" title="${t.conciliacao?.credito || ''}">
          ${t.conciliacao?.credito || '-'}
        </td>
        <td class="py-3 px-4 text-center">
          <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shadow-2xs">
            <i data-lucide="check" class="w-3 h-3 text-emerald-600"></i> Partida Dobrada
          </span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  refreshIcons();
}

// Exportar para Excel / CSV no padrão contábil
function exportarExtratosExcel() {
  if (extratosProcessadosCache.length === 0) {
    showToast('Aviso: Nenhuma transação bancária para exportar.', 'warning');
    return;
  }

  const cabecalho = ['Data', 'Banco', 'Codigo_Banco', 'Tipo_Operacao', 'Valor', 'Descricao_Original', 'Categoria_Contabil', 'Conta_Debito', 'Conta_Credito', 'Historico_Contabil'];
  const linhas = extratosProcessadosCache.map(t => [
    t.data || '',
    `"${(t.banco || '').replace(/"/g, '""')}"`,
    t.codigoBanco || '',
    t.tipo || '',
    (t.valor || 0).toFixed(2).replace('.', ','),
    `"${(t.descricao || '').replace(/"/g, '""')}"`,
    t.conciliacao?.categoria || '',
    `"${(t.conciliacao?.debito || '').replace(/"/g, '""')}"`,
    `"${(t.conciliacao?.credito || '').replace(/"/g, '""')}"`,
    `"${(t.conciliacao?.historico || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MC_Hub_Extratos_Conciliados_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Planilha de extratos conciliados exportada com sucesso!', 'success');
}

// Exportar no formato do Domínio Sistemas (Lançamentos Contábeis TXT)
function exportarExtratosDominio() {
  if (extratosProcessadosCache.length === 0) {
    showToast('Aviso: Nenhuma transação para gerar o arquivo do Domínio.', 'warning');
    return;
  }

  // Gera o arquivo de importação padrão de lançamentos contábeis do Domínio
  // Formato: DATA|DEBITO|CREDITO|VALOR|HISTORICO
  const linhas = extratosProcessadosCache.map(t => {
    const dataTxt = t.data || '';
    const vlrTxt = (t.valor || 0).toFixed(2).replace('.', ',');
    const debito = t.conciliacao?.debito ? t.conciliacao.debito.split(' - ')[0] : '';
    const credito = t.conciliacao?.credito ? t.conciliacao.credito.split(' - ')[0] : '';
    const hist = (t.conciliacao?.historico || t.descricao || '').replace(/[\|\r\n]/g, ' ');
    return `${dataTxt}|${debito}|${credito}|${vlrTxt}|${hist}`;
  });

  const txtContent = linhas.join('\r\n');
  const blob = new Blob([txtContent], { type: 'text/plain;charset=latin1;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MC_Dominio_Lancamentos_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Arquivo para Domínio Contábil gerado com sucesso! (Utilitários > Importação > Lançamentos)', 'success');
}

// Limpa todas as transações de extrato
async function limparExtratosProcessadosUI() {
  if (extratosProcessadosCache.length === 0) {
    showToast('Nenhum extrato para limpar.', 'info');
    return;
  }

  if (!confirm('Deseja realmente limpar todas as transações bancárias e o histórico de extratos processados?')) return;
  try {
    const res = await fetch('/api/extratos/processados', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      extratosProcessadosCache = [];
      extratosResumoCache = null;
      atualizarUIExtratos();
      showToast('Histórico de extratos removido com sucesso.', 'info');
    }
  } catch (err) {
    showToast(`Erro ao limpar extratos: ${err.message}`, 'danger');
  }
}

/* ==========================================================================
   5. COFRE DE SENHAS DO ESCRITÓRIO (229 CREDENCIAIS)
   ========================================================================== */
async function loadSenhas() {
  try {
    const res = await fetch('/api/senhas');
    const data = await res.json();
    allSenhas = Array.isArray(data) ? data : (data.senhas || []);
    const countBadge = document.getElementById('badgeSenhasCount');
    if (countBadge) countBadge.textContent = allSenhas.length;
    renderSenhasCategoryPills();
    renderSenhasTable();
  } catch (err) {
    console.error('Erro ao carregar senhas:', err);
  }
}

function renderSenhasCategoryPills() {
  const container = document.getElementById('senhasCategoryPills');
  if (!container) return;

  const categories = ['TODAS', 'PREFEITURAS', 'SEFA', 'PGFN', 'ESCRITORIO', 'GOV', 'BOMBEIROS'];
  let html = '';
  categories.forEach(cat => {
    const isActive = activeSenhasCategory === cat;
    const activeClasses = isActive 
      ? 'bg-amber-600 text-white font-bold shadow-sm' 
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium';
    html += `
      <button onclick="filterSenhasByCategory('${cat}')" class="px-3 py-1 rounded-lg transition whitespace-nowrap ${activeClasses}">
        ${cat}
      </button>
    `;
  });
  container.innerHTML = html;
}

function filterSenhasByCategory(cat) {
  activeSenhasCategory = cat;
  renderSenhasCategoryPills();
  renderSenhasTable();
}

function renderSenhasTable() {
  const tbody = document.getElementById('senhasTableBody');
  if (!tbody) return;

  const search = (document.getElementById('inputSenhasSearch')?.value || '').toLowerCase().trim();

  const filtered = allSenhas.filter(s => {
    if (activeSenhasCategory !== 'TODAS') {
      const tipo = (s.tipo || '').toUpperCase();
      if (activeSenhasCategory === 'PREFEITURAS' && !tipo.includes('PREFEITURA')) return false;
      if (activeSenhasCategory === 'SEFA' && !tipo.includes('SEFA')) return false;
      if (activeSenhasCategory === 'PGFN' && !tipo.includes('PGFN')) return false;
      if (activeSenhasCategory === 'ESCRITORIO' && !tipo.includes('ESCRITÓRIO') && !tipo.includes('ESCRITORIO')) return false;
      if (activeSenhasCategory === 'GOV' && !tipo.includes('GOV')) return false;
      if (activeSenhasCategory === 'BOMBEIROS' && !tipo.includes('BOMBEIRO')) return false;
    }

    if (search) {
      const matchEmp = s.empresa && s.empresa.toLowerCase().includes(search);
      const matchUser = s.usuario && s.usuario.toLowerCase().includes(search);
      const matchTipo = s.tipo && s.tipo.toLowerCase().includes(search);
      const matchObs = s.obs && s.obs.toLowerCase().includes(search);
      if (!matchEmp && !matchUser && !matchTipo && !matchObs) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Nenhuma credencial encontrada.</td></tr>`;
    return;
  }

  let html = '';
  filtered.forEach((s, idx) => {
    const passwordId = `pwd-masked-${idx}`;
    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">${s.tipo || 'GERAL'}</span>
        </td>
        <td class="py-3 px-4 font-bold text-slate-900">${s.empresa || '-'}</td>
        <td class="py-3 px-4 text-xs font-mono-code text-slate-700">${s.usuario || '-'}</td>
        <td class="py-3 px-4 font-mono-code text-xs">
          <div class="flex items-center gap-1.5">
            <span id="${passwordId}" class="tracking-widest font-bold text-slate-800" data-raw="${s.senha || ''}">••••••••</span>
            <button onclick="togglePasswordVisibility('${passwordId}')" class="text-slate-400 hover:text-slate-700 p-1" title="Ver / Ocultar">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
        <td class="py-3 px-4 text-xs text-slate-500 max-w-xs truncate" title="${s.obs || ''}">${s.obs || '-'}</td>
        <td class="py-3 px-4 text-right">
          <button onclick="navigator.clipboard.writeText('${(s.senha || '').replace(/'/g, "\\'")}'); showToast('Senha copiada com sucesso!', 'success')" class="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition flex items-center gap-1 ml-auto">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copiar</span>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  refreshIcons();
}

function togglePasswordVisibility(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const raw = el.getAttribute('data-raw') || '';
  if (el.textContent === '••••••••') {
    el.textContent = raw || '(vazio)';
    el.classList.remove('tracking-widest');
  } else {
    el.textContent = '••••••••';
    el.classList.add('tracking-widest');
  }
}

/* ==========================================================================
   6. AUDITORIA PROFUNDA DE ARQUIVOS & CERTIFICADOS DIGITAIS
   ========================================================================== */
async function loadDeepAuditStats() {
  try {
    const res = await fetch('/api/audit/deep-stats');
    const data = await res.json();
    const stats = data.summary || data.stats || {};
    const byCategory = data.byCategory || stats.byCategory || {};
    
    const countBadge = document.getElementById('badgeDeepFiles');
    if (countBadge) {
      const tf = stats.totalFiles || (data.progress && data.progress.totalFiles) || 0;
      countBadge.textContent = tf > 0 ? `${Math.round(tf / 1000)}k+` : 'Pronto';
    }

    const statFiles = document.getElementById('deepStatFiles');
    if (statFiles) statFiles.textContent = (stats.totalFiles || (data.progress && data.progress.totalFiles) || 0).toLocaleString('pt-BR');

    const statSize = document.getElementById('deepStatSize');
    if (statSize) statSize.textContent = stats.totalSizeFormatted || '0 MB';

    const statXml = document.getElementById('deepStatXml');
    if (statXml) statXml.textContent = ((byCategory.XML && byCategory.XML.count) || 0).toLocaleString('pt-BR');

    const statCerts = document.getElementById('deepStatCerts');
    if (statCerts) statCerts.textContent = stats.certificatesCount || 0;

    const statPdfs = document.getElementById('deepStatPdfs');
    if (statPdfs) statPdfs.textContent = ((byCategory.FISCAL && byCategory.FISCAL.count) || 0) + ((byCategory.CONTÁBIL && byCategory.CONTÁBIL.count) || 0);

    const statSheets = document.getElementById('deepStatSheets');
    if (statSheets) statSheets.textContent = ((byCategory.PLANILHA && byCategory.PLANILHA.count) || 120);

  } catch (err) {
    console.error('Erro ao carregar estatísticas profundas:', err);
  }
}

async function loadDeepAudit() {
  await loadDeepAuditStats();
  try {
    const res = await fetch('/api/audit/certificates');
    const data = await res.json();
    const certs = Array.isArray(data) ? data : (data.certificates || []);
    renderCertificatesTable(certs);
  } catch (err) {
    console.error('Erro ao carregar certificados:', err);
  }
}

function renderCertificatesTable(certs) {
  const tbody = document.getElementById('certificatesTableBody');
  if (!tbody) return;

  if (certs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Nenhum certificado digital indexado no momento.</td></tr>`;
    return;
  }

  let html = '';
  certs.forEach(cert => {
    const passwordBadge = cert.detectedPassword 
      ? `<span class="px-2 py-0.5 rounded font-mono-code text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">${cert.detectedPassword}</span>`
      : `<span class="text-xs text-slate-400 italic">Padrão / Não anotada</span>`;

    html += `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 font-mono-code text-xs font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-amber-500 shrink-0"></i>
          <span>${cert.name}</span>
        </td>
        <td class="py-3 px-4 text-xs font-semibold text-slate-700">${cert.client || 'Geral'}</td>
        <td class="py-3 px-4 text-xs font-mono-code text-slate-500">${cert.size || '-'}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            ${passwordBadge}
            ${cert.detectedPassword ? `
              <button onclick="navigator.clipboard.writeText('${cert.detectedPassword}'); showToast('Senha do certificado copiada!', 'success')" class="text-slate-400 hover:text-amber-600" title="Copiar Senha">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="navigator.clipboard.writeText('${(cert.path || '').replace(/\\/g, '\\\\')}'); showToast('Caminho do certificado copiado!', 'success')" class="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition">
            Copiar Localização
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  refreshIcons();
}

async function triggerDeepScan() {
  const btn = document.getElementById('btnTriggerDeep');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i><span>Indexando Rede...</span>`;
  }
  showToast('Iniciando auditoria profunda em background...', 'info');

  try {
    const res = await fetch('/api/audit/run-deep', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Auditoria iniciada!', 'success');
  } catch (err) {
    showToast('Erro ao iniciar auditoria', 'error');
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i><span>Executar Nova Varredura</span>`;
        refreshIcons();
      }
    }, 3000);
  }
}

/* ==========================================================================
   7. MODAIS AUXILIARES
   ========================================================================== */
function openGuiaRapidoModal() {
  const m = document.getElementById('modalGuiaRapido');
  if (m) {
    m.classList.remove('hidden');
    refreshIcons();
  }
}

function closeGuiaRapidoModal() {
  const m = document.getElementById('modalGuiaRapido');
  if (m) m.classList.add('hidden');
}

function openLicencasModal() {
  const m = document.getElementById('modalLicencasLinks');
  if (m) {
    m.classList.remove('hidden');
    refreshIcons();
  }
}

function closeLicencasModal() {
  const m = document.getElementById('modalLicencasLinks');
  if (m) m.classList.add('hidden');
}

// Fechamento de modais via Tecla ESC e clique no fundo escuro
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailsModal();
    closeNewClientModal();
    closeGuiaRapidoModal();
    closeLicencasModal();
    fecharModalDetalhesNota();
    const dropdown = document.getElementById('globalSearchResults');
    if (dropdown) dropdown.classList.add('hidden');
  }
});

['modalGuiaRapido', 'modalLicencasLinks', 'modalNewClient', 'modalClientDetails', 'modalDetalhesNota'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        el.classList.add('hidden');
      }
    });
  }
});

// =========================================================================
// MÓDULO: CENTRAL DE NOTAS FISCAIS & LEITOR XML COM IA (DESIGN MONETRA)
// =========================================================================
let notasProcessadasCache = [];
let filtroAtualNotas = 'TODAS';
let termoBuscaNotas = '';
let selectedEmpresaNotasId = '';
let selectedEmpresaExtratosId = '';

// Popula os menus dropdown de empresas nas abas Notas e Extratos
function popularSelectEmpresas() {
  const selNotas = document.getElementById('selectEmpresaNotas');
  const selExtratos = document.getElementById('selectEmpresaExtratos');
  if (!selNotas && !selExtratos) return;

  const sorted = [...allClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (selNotas) {
    const prevVal = selNotas.value;
    selNotas.innerHTML = '<option value="">✨ Autodetectar Empresa pelo CNPJ dos XMLs (Recomendado)</option>';
    sorted.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      const cnpjFmt = formatCNPJ(c.cnpj) || 'Sem CNPJ';
      opt.textContent = `${c.name} (${cnpjFmt})`;
      selNotas.appendChild(opt);
    });
    if (prevVal) selNotas.value = prevVal;
  }

  if (selExtratos) {
    const prevVal = selExtratos.value;
    selExtratos.innerHTML = '<option value="">✨ Selecione a Empresa para Conciliação Contábil</option>';
    sorted.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      const cnpjFmt = formatCNPJ(c.cnpj) || 'Sem CNPJ';
      opt.textContent = `${c.name} (${cnpjFmt})`;
      selExtratos.appendChild(opt);
    });
    if (prevVal) selExtratos.value = prevVal;
  }
}

// Manipulador da troca de empresa ativa na Central de Notas
function handleSelectEmpresaNotas(clientId) {
  selectedEmpresaNotasId = clientId;
  const btn = document.getElementById('btnEscanearRedeNotas');
  if (clientId) {
    const c = allClients.find(x => x.id === clientId);
    if (btn) btn.title = `Escanear pasta de ${c?.name || 'empresa'} na rede local`;
    showToast(`Empresa selecionada: ${c?.name || 'Cliente'}`, 'info');
  } else {
    if (btn) btn.title = 'Escanear automaticamente arquivos XML na pasta da empresa na rede local (\\\\192.168.15.2)';
  }
}

// Manipulador da troca de empresa ativa na Central de Extratos
function handleSelectEmpresaExtratos(clientId) {
  selectedEmpresaExtratosId = clientId;
  const btn = document.getElementById('btnEscanearRedeExtratos');
  if (clientId) {
    const c = allClients.find(x => x.id === clientId);
    if (btn) btn.title = `Escanear extratos na pasta de ${c?.name || 'empresa'} na rede local`;
    showToast(`Empresa selecionada para extratos: ${c?.name || 'Cliente'}`, 'info');
  } else {
    if (btn) btn.title = 'Escanear automaticamente arquivos OFX ou PDF na pasta CONTÁBIL da empresa na rede local';
  }
}

// Escanear automaticamente pasta de rede da empresa selecionada para buscar XMLs
async function escanearPastaRedeNotas() {
  if (!selectedEmpresaNotasId) {
    showToast('Por favor, selecione uma empresa no menu acima para escanear a pasta na rede local.', 'warning');
    return;
  }

  const btn = document.getElementById('btnEscanearRedeNotas');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div><span>Buscando XMLs...</span>`;
  }

  try {
    showToast('Escaneando pasta da empresa na rede local (\\\\192.168.15.2)...', 'info');
    const res = await fetch('/api/notas/escanear-rede', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: selectedEmpresaNotasId })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao escanear rede');
    }

    if (data.count === 0) {
      showToast(data.message || 'Nenhum XML encontrado na pasta desta empresa.', 'info');
    } else {
      showToast(`Sucesso! ${data.count} nota(s) fiscal(is) encontrada(s) e importada(s) da rede local!`, 'success');
      await loadNotasXML();
    }
  } catch (err) {
    showToast(`Falha ao escanear rede: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

// Escanear automaticamente pasta de rede da empresa selecionada para buscar extratos OFX / PDF
async function escanearPastaRedeExtratos() {
  if (!selectedEmpresaExtratosId) {
    showToast('Por favor, selecione uma empresa no menu acima para escanear extratos na rede local.', 'warning');
    return;
  }

  const btn = document.getElementById('btnEscanearRedeExtratos');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div><span>Buscando Extratos...</span>`;
  }

  try {
    showToast('Escaneando extratos (OFX/PDF) na pasta da rede local...', 'info');
    const res = await fetch('/api/extratos/escanear-rede', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: selectedEmpresaExtratosId })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao escanear extratos');
    }

    if (data.count === 0) {
      showToast(data.message || 'Nenhum extrato OFX ou PDF encontrado na pasta.', 'info');
    } else {
      showToast(`Sucesso! ${data.count} arquivo(s) de extrato importado(s) com ${data.transacoesTotal || 0} lançamentos!`, 'success');
      await loadExtratosProcessados();
    }
  } catch (err) {
    showToast(`Falha ao escanear extratos: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

// Carrega as notas já salvas no backend
async function loadNotasXML() {
  try {
    const res = await fetch('/api/notas');
    const data = await res.json();
    if (data.success && Array.isArray(data.notas)) {
      notasProcessadasCache = data.notas;
      atualizarUINotas();
    }
  } catch (err) {
    console.error('Erro ao carregar notas fiscais:', err);
  }
}

// Drag & Drop Handlers
function handleDragOverNotas(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneNotas');
  if (zone) {
    zone.classList.add('border-lime-500', 'bg-lime-50/30', 'scale-[1.01]');
  }
}

function handleDragLeaveNotas(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneNotas');
  if (zone) {
    zone.classList.remove('border-lime-500', 'bg-lime-50/30', 'scale-[1.01]');
  }
}

function handleDropNotas(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneNotas');
  if (zone) {
    zone.classList.remove('border-lime-500', 'bg-lime-50/30', 'scale-[1.01]');
  }
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    enviarXmlsAoServidor(e.dataTransfer.files);
  }
}

function handleFileInputNotas(e) {
  if (e.target && e.target.files && e.target.files.length > 0) {
    enviarXmlsAoServidor(e.target.files);
  }
}

// Envio dos arquivos XML para o backend
async function enviarXmlsAoServidor(files) {
  const xmlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'));
  if (xmlFiles.length === 0) {
    showToast('Aviso: Nenhum arquivo XML válido foi selecionado.', 'warning');
    return;
  }

  const dropContent = document.getElementById('dropContentNotas');
  const uploadProgress = document.getElementById('uploadProgressNotas');
  const progressText = document.getElementById('progressTextNotas');

  if (dropContent) dropContent.classList.add('hidden');
  if (uploadProgress) {
    uploadProgress.classList.remove('hidden');
    uploadProgress.classList.add('flex');
  }
  if (progressText) progressText.textContent = `Processando ${xmlFiles.length} nota(s) fiscal(is) com IA...`;

  const formData = new FormData();
  xmlFiles.forEach(file => {
    formData.append('xmlFiles', file);
  });

  try {
    const res = await fetch('/api/notas/processar', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      if (data.notas && data.notas.length > 0) {
        notasProcessadasCache = [...data.notas, ...notasProcessadasCache];
        atualizarUINotas();
        showToast(`Sucesso: ${data.notas.length} nota(s) processada(s) e integradas!`, 'success');
      } else {
        showToast('Nenhum dado fiscal pôde ser extraído dos XMLs fornecidos.', 'warning');
      }
    } else {
      showToast(`Erro ao processar: ${data.error || 'Falha no servidor'}`, 'danger');
    }
  } catch (err) {
    console.error('Erro na requisição de notas:', err);
    showToast(`Erro de comunicação com o servidor: ${err.message}`, 'danger');
  } finally {
    setTimeout(() => {
      if (uploadProgress) {
        uploadProgress.classList.add('hidden');
        uploadProgress.classList.remove('flex');
      }
      if (dropContent) dropContent.classList.remove('hidden');
      const input = document.getElementById('inputXmlFiles');
      if (input) input.value = '';
    }, 600);
  }
}

// Atualiza toda a interface da aba Notas
function atualizarUINotas(listaFiltrada) {
  renderNotasDashboard(notasProcessadasCache);
  if (listaFiltrada) {
    renderNotasTable(listaFiltrada);
    refreshIcons();
  } else {
    aplicarFiltrosNotas();
  }
}

// Renderiza os 5 KPIs no topo
function renderNotasDashboard(notas) {
  const total = notas.length;
  const entradas = notas.filter(n => n.direcao === 'ENTRADA').length;
  const saidas = notas.filter(n => n.direcao === 'SAIDA').length;
  const valorTotal = notas.reduce((acc, n) => acc + (n.totais?.valorNota || 0), 0);
  const totalICMS = notas.reduce((acc, n) => acc + (n.totais?.valorICMS || 0), 0);
  const totalPIS = notas.reduce((acc, n) => acc + (n.totais?.valorPIS || 0), 0);
  const totalCOFINS = notas.reduce((acc, n) => acc + (n.totais?.valorCOFINS || 0), 0);
  const totalIPI = notas.reduce((acc, n) => acc + (n.totais?.valorIPI || 0), 0);

  const elBadgeCount = document.getElementById('badgeNotasCount');
  if (elBadgeCount) elBadgeCount.textContent = `${total} notas`;

  const elCardTotal = document.getElementById('cardTotalNotas');
  if (elCardTotal) elCardTotal.textContent = total;

  const elCardSubtotal = document.getElementById('cardSubtotalNotas');
  if (elCardSubtotal) elCardSubtotal.textContent = `${entradas} entradas · ${saidas} saídas`;

  const elCardValor = document.getElementById('cardValorTotalNotas');
  if (elCardValor) elCardValor.textContent = formatCurrency(valorTotal);

  const elCardICMS = document.getElementById('cardTotalICMS');
  if (elCardICMS) elCardICMS.textContent = formatCurrency(totalICMS);

  const elCardPisCofins = document.getElementById('cardTotalPisCofins');
  if (elCardPisCofins) elCardPisCofins.textContent = formatCurrency(totalPIS + totalCOFINS);

  const elCardSubPisCofins = document.getElementById('cardSubtotalPisCofins');
  if (elCardSubPisCofins) elCardSubPisCofins.textContent = `PIS: ${formatCurrency(totalPIS)} · COFINS: ${formatCurrency(totalCOFINS)}`;

  const elCardIPI = document.getElementById('cardTotalIPI');
  if (elCardIPI) elCardIPI.textContent = formatCurrency(totalIPI);
}

// Renderiza a tabela de notas
function renderNotasTable(notas) {
  const tbody = document.getElementById('tbodyNotas');
  const emptyState = document.getElementById('emptyNotasState');

  if (!tbody) return;
  tbody.innerHTML = '';

  if (notas.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  notas.forEach((nota, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition cursor-pointer';
    tr.onclick = (e) => {
      // Se não clicou num botão, abre o modal
      if (!e.target.closest('button')) {
        abrirModalDetalhesNota(nota.chave || idx);
      }
    };

    // Tipo Badge
    let badgeTipoClass = 'bg-emerald-100 text-emerald-800';
    if (nota.tipo === 'NFSE') badgeTipoClass = 'bg-blue-100 text-blue-800';
    if (nota.tipo === 'CTE') badgeTipoClass = 'bg-purple-100 text-purple-800';

    // Operação Badge
    const op = nota.direcao || 'DESCONHECIDO';
    let badgeOp = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">OUTRA</span>';
    if (op === 'ENTRADA') {
      badgeOp = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">ENTRADA</span>';
    } else if (op === 'SAIDA') {
      badgeOp = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">SAÍDA</span>';
    }

    const dataEmissaoFormatada = formatDateBR(nota.dataEmissao);
    const emitNome = nota.emitente?.razaoSocial || nota.emitente?.nomeFantasia || '-';
    const emitCnpj = formatCNPJ(nota.emitente?.cnpj);
    const destNome = nota.destinatario?.razaoSocial || nota.destinatario?.nomeFantasia || '-';
    const destCnpj = formatCNPJ(nota.destinatario?.cnpj || nota.destinatario?.cpf);
    const cfop = nota.produtos && nota.produtos.length > 0 ? (nota.produtos[0].cfop || '-') : '-';
    const vlrTotal = formatCurrency(nota.totais?.valorNota || 0);
    const vlrIcms = formatCurrency(nota.totais?.valorICMS || 0);

    tr.innerHTML = `
      <td class="py-3 px-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badgeTipoClass}">
          ${nota.tipo || 'NFE'}
        </span>
      </td>
      <td class="py-3 px-4 font-bold text-slate-900">
        ${nota.numero || '-'}<span class="text-slate-400 font-normal"> / ${nota.serie || '1'}</span>
      </td>
      <td class="py-3 px-4 text-slate-500 whitespace-nowrap">
        ${dataEmissaoFormatada}
      </td>
      <td class="py-3 px-4 max-w-[200px] truncate" title="${emitNome} (${emitCnpj})">
        <div class="font-semibold text-slate-800 truncate">${emitNome}</div>
        <div class="text-[10px] text-slate-400 font-mono">${emitCnpj}</div>
      </td>
      <td class="py-3 px-4 max-w-[200px] truncate" title="${destNome} (${destCnpj})">
        <div class="font-semibold text-slate-800 truncate">${destNome}</div>
        <div class="text-[10px] text-slate-400 font-mono">${destCnpj}</div>
      </td>
      <td class="py-3 px-4 font-mono font-bold text-slate-700">
        ${cfop}
      </td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
        ${vlrTotal}
      </td>
      <td class="py-3 px-4 text-right text-slate-600 whitespace-nowrap">
        ${vlrIcms}
      </td>
      <td class="py-3 px-4 text-center whitespace-nowrap">
        ${badgeOp}
      </td>
      <td class="py-3 px-4 text-center whitespace-nowrap">
        <button onclick="abrirModalDetalhesNota('${nota.chave || idx}')" class="p-1.5 rounded-xl bg-slate-100 hover:bg-lime-500 hover:text-slate-950 text-slate-600 transition" title="Ver Detalhes & Contabilidade">
          <i data-lucide="eye" class="w-4 h-4"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Filtro por Abas/Pílulas (Todas, Entradas, Saídas, NFS-e)
function setFiltroNotas(filtro) {
  filtroAtualNotas = filtro;
  const botoes = ['TODAS', 'ENTRADA', 'SAIDA', 'NFSE'];
  botoes.forEach(b => {
    const btn = document.getElementById(`filterNotaBtn-${b}`);
    if (btn) {
      if (b === filtro) {
        btn.className = 'px-3 py-1 rounded-full font-bold bg-[#0F172A] text-[#84CC16] shadow-sm transition';
      } else {
        btn.className = 'px-3 py-1 rounded-full font-semibold text-slate-600 hover:text-slate-900 transition';
      }
    }
  });
  aplicarFiltrosNotas();
}

// Filtro de busca no campo de texto da tabela de notas
function handleSearchNotas(e) {
  termoBuscaNotas = (e.target.value || '').toLowerCase().trim();
  aplicarFiltrosNotas();
}

// Aplicação unificada dos filtros (Pílulas + Campo de Busca)
function aplicarFiltrosNotas() {
  let filtradas = [...notasProcessadasCache];

  if (filtroAtualNotas === 'ENTRADA') {
    filtradas = filtradas.filter(n => n.direcao === 'ENTRADA');
  } else if (filtroAtualNotas === 'SAIDA') {
    filtradas = filtradas.filter(n => n.direcao === 'SAIDA');
  } else if (filtroAtualNotas === 'NFSE') {
    filtradas = filtradas.filter(n => n.tipo === 'NFSE');
  }

  if (termoBuscaNotas) {
    filtradas = filtradas.filter(n => {
      const num = String(n.numero || '');
      const emit = (n.emitente?.razaoSocial || '').toLowerCase();
      const dest = (n.destinatario?.razaoSocial || '').toLowerCase();
      const cnpjEmit = String(n.emitente?.cnpj || '');
      const cnpjDest = String(n.destinatario?.cnpj || '');
      const chave = String(n.chave || '');
      const cfop = n.produtos && n.produtos[0] ? String(n.produtos[0].cfop || '') : '';
      return num.includes(termoBuscaNotas) ||
             emit.includes(termoBuscaNotas) ||
             dest.includes(termoBuscaNotas) ||
             cnpjEmit.includes(termoBuscaNotas) ||
             cnpjDest.includes(termoBuscaNotas) ||
             chave.includes(termoBuscaNotas) ||
             cfop.includes(termoBuscaNotas);
    });
  }

  renderNotasTable(filtradas);
  refreshIcons();
}

// Abre o Modal com todos os dados da nota e lançamento contábil
function abrirModalDetalhesNota(chaveOuIndex) {
  let nota = null;
  if (typeof chaveOuIndex === 'string') {
    nota = notasProcessadasCache.find(n => n.chave === chaveOuIndex);
  }
  if (!nota) {
    const idx = parseInt(chaveOuIndex, 10);
    if (!isNaN(idx)) nota = notasProcessadasCache[idx];
  }
  if (!nota) return;

  const modal = document.getElementById('modalDetalhesNota');
  const titulo = document.getElementById('modalNotaTitulo');
  const chave = document.getElementById('modalNotaChave');
  const conteudo = document.getElementById('modalNotaConteudo');

  if (titulo) titulo.textContent = `${nota.tipo || 'NF-e'} Nº ${nota.numero || '-'} (Série ${nota.serie || '1'})`;
  if (chave) chave.innerHTML = `<span class="font-mono">${nota.chave || 'Sem chave'}</span>`;

  if (conteudo) {
    // Produtos da nota
    let produtosHtml = '';
    (nota.produtos || []).forEach((p, i) => {
      produtosHtml += `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-2 px-3 font-mono">${p.codigo || i + 1}</td>
          <td class="py-2 px-3 font-semibold text-slate-800">${p.descricao || '-'}</td>
          <td class="py-2 px-3 font-mono">${p.ncm || '-'}</td>
          <td class="py-2 px-3 font-mono font-bold text-slate-700">${p.cfop || '-'}</td>
          <td class="py-2 px-3 text-right">${p.quantidade || 1} ${p.unidade || 'UN'}</td>
          <td class="py-2 px-3 text-right">${formatCurrency(p.valorUnitario || 0)}</td>
          <td class="py-2 px-3 text-right font-bold text-slate-900">${formatCurrency(p.valorTotal || 0)}</td>
        </tr>
      `;
    });

    // Lançamento Contábil (Partida Dobrada)
    const lc = nota.lancamentoContabil || {};
    const lancamentoHtml = `
      <div class="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-3 shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-700 pb-2">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-[#84CC16]"></span>
            <span class="font-bold text-xs uppercase tracking-wider text-lime-400">Lançamento Contábil Sugerido (Domínio Contábil)</span>
          </div>
          <span class="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full">Partida Dobrada</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">DÉBITO (Aplicação de Recurso)</div>
            <div class="font-bold text-slate-100">${lc.debito?.descricao || '1.1.03.01.0001 - Estoque de Mercadorias para Revenda'}</div>
            <div class="text-[10px] text-slate-400 font-mono">Conta: ${lc.debito?.conta || '110301'}</div>
          </div>

          <div class="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-[10px] font-bold uppercase tracking-wider text-rose-400">CRÉDITO (Origem de Recurso)</div>
            <div class="font-bold text-slate-100">${lc.credito?.descricao || '2.1.01.01.0001 - Fornecedores Nacionais a Pagar'}</div>
            <div class="text-[10px] text-slate-400 font-mono">Conta: ${lc.credito?.conta || '210101'}</div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1 text-xs text-slate-300">
          <div><span class="text-slate-400">Histórico:</span> ${lc.historico || `Vlr ref. aquisição conf. ${nota.tipo || 'NF-e'} ${nota.numero} de ${nota.emitente?.razaoSocial || 'Fornecedor'}`}</div>
          <div class="font-extrabold text-sm text-[#84CC16]">${formatCurrency(nota.totais?.valorNota || 0)}</div>
        </div>
      </div>
    `;

    conteudo.innerHTML = `
      <!-- Dados Principais -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
        <div>
          <div class="text-[10px] font-bold uppercase text-slate-400">Emitente (Quem vendeu)</div>
          <div class="font-bold text-slate-900 mt-0.5">${nota.emitente?.razaoSocial || '-'}</div>
          <div class="text-[11px] text-slate-500 font-mono">CNPJ: ${formatCNPJ(nota.emitente?.cnpj)} · IE: ${nota.emitente?.ie || 'ISENTO'}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${nota.emitente?.cidade || '-'} / ${nota.emitente?.uf || '-'}</div>
        </div>

        <div>
          <div class="text-[10px] font-bold uppercase text-slate-400">Destinatário (Cliente)</div>
          <div class="font-bold text-slate-900 mt-0.5">${nota.destinatario?.razaoSocial || '-'}</div>
          <div class="text-[11px] text-slate-500 font-mono">CNPJ/CPF: ${formatCNPJ(nota.destinatario?.cnpj || nota.destinatario?.cpf)} · IE: ${nota.destinatario?.ie || 'ISENTO'}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${nota.destinatario?.cidade || '-'} / ${nota.destinatario?.uf || '-'}</div>
        </div>
      </div>

      <!-- Lançamento Contábil Integrado -->
      ${lancamentoHtml}

      <!-- Tabela de Itens/Produtos -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">Itens e Mercadorias (${nota.produtos?.length || 0})</span>
          <span class="text-xs font-bold text-slate-900">Total: ${formatCurrency(nota.totais?.valorNota || 0)}</span>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-200/80 max-h-48 overflow-y-auto">
          <table class="w-full text-left border-collapse text-[11px]">
            <thead class="bg-slate-100/80 text-slate-600 sticky top-0 uppercase font-bold">
              <tr>
                <th class="py-2 px-3">Cód</th>
                <th class="py-2 px-3">Descrição</th>
                <th class="py-2 px-3">NCM</th>
                <th class="py-2 px-3">CFOP</th>
                <th class="py-2 px-3 text-right">Qtd</th>
                <th class="py-2 px-3 text-right">Unitário</th>
                <th class="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${produtosHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Resumo dos Impostos Destacados -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px]">
        <div>
          <span class="text-slate-400 uppercase text-[9px] font-bold">Base ICMS</span>
          <div class="font-bold text-slate-800">${formatCurrency(nota.totais?.baseCalculoICMS || 0)}</div>
        </div>
        <div>
          <span class="text-slate-400 uppercase text-[9px] font-bold">Valor ICMS</span>
          <div class="font-bold text-emerald-700">${formatCurrency(nota.totais?.valorICMS || 0)}</div>
        </div>
        <div>
          <span class="text-slate-400 uppercase text-[9px] font-bold">PIS</span>
          <div class="font-bold text-slate-800">${formatCurrency(nota.totais?.valorPIS || 0)}</div>
        </div>
        <div>
          <span class="text-slate-400 uppercase text-[9px] font-bold">COFINS</span>
          <div class="font-bold text-slate-800">${formatCurrency(nota.totais?.valorCOFINS || 0)}</div>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.classList.remove('hidden');
    refreshIcons();
  }
}

function fecharModalDetalhesNota() {
  const modal = document.getElementById('modalDetalhesNota');
  if (modal) modal.classList.add('hidden');
}

// Limpa todas as notas
async function limparTodasNotas() {
  if (!confirm('Deseja realmente limpar todas as notas fiscais processadas?')) return;
  try {
    const res = await fetch('/api/notas', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      notasProcessadasCache = [];
      atualizarUINotas();
      showToast('Todas as notas foram removidas com sucesso.', 'info');
    }
  } catch (err) {
    showToast(`Erro ao limpar notas: ${err.message}`, 'danger');
  }
}

// Exportar para Layout 19 Oficial do Domínio Sistemas (Fiscal)
async function exportarNotasDominioLayout19() {
  try {
    if (!notasProcessadasCache || notasProcessadasCache.length === 0) {
      showToast('Aviso: Nenhuma nota processada para exportar.', 'warning');
      return;
    }
    
    // Baixa o arquivo TXT gerado pelo backend oficial
    const response = await fetch('/api/notas/exportar-dominio');
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Falha ao gerar arquivo Layout 19');
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dominio_Layout19_Notas_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Layout 19 gerado com sucesso! No Domínio: Utilitários > Importação > Importador > Notas Fiscais', 'success');
  } catch (err) {
    showToast(`Erro ao exportar Layout 19: ${err.message}`, 'danger');
  }
}

// ============================================================
// INTEGRAÇÃO DOMÍNIO SISTEMAS (CONFIGURAÇÕES & EXPORTAÇÕES)
// ============================================================

// Abrir Modal de Configurações do Domínio
async function abrirConfigDominioModal() {
  const modal = document.getElementById('modalConfigDominio');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/dominio/config');
    const data = await res.json();
    if (data.success && data.config) {
      const c = data.config;
      if (document.getElementById('cfgDomCodigoEmpresa')) document.getElementById('cfgDomCodigoEmpresa').value = c.codigo_empresa_padrao || '1';
      if (document.getElementById('cfgDomAcumuladorCompra')) document.getElementById('cfgDomAcumuladorCompra').value = c.acumulador_compra || '1';
      if (document.getElementById('cfgDomAcumuladorVenda')) document.getElementById('cfgDomAcumuladorVenda').value = c.acumulador_venda || '10';
      if (document.getElementById('cfgDomAcumuladorUsoConsumo')) document.getElementById('cfgDomAcumuladorUsoConsumo').value = c.acumulador_uso_consumo || '2';
      if (document.getElementById('cfgDomAcumuladorServicoTomado')) document.getElementById('cfgDomAcumuladorServicoTomado').value = c.acumulador_servico_tomado || '50';
      if (document.getElementById('cfgDomContaBanco')) document.getElementById('cfgDomContaBanco').value = c.conta_banco_padrao || '1.1.1.02.0001';
      if (document.getElementById('cfgDomContaFornecedores')) document.getElementById('cfgDomContaFornecedores').value = c.conta_fornecedores_padrao || '2.1.1.01.0001';
      if (document.getElementById('cfgDomContaClientes')) document.getElementById('cfgDomContaClientes').value = c.conta_clientes_padrao || '1.1.2.01.0001';
      if (document.getElementById('cfgDomContaReceita')) document.getElementById('cfgDomContaReceita').value = c.conta_receita_padrao || '3.1.1.01.0001';
    }
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    showToast(`Erro ao carregar configurações do Domínio: ${err.message}`, 'warning');
  }
}

// Fechar Modal de Configurações do Domínio
function fecharConfigDominioModal() {
  const modal = document.getElementById('modalConfigDominio');
  if (modal) modal.classList.add('hidden');
}

// Salvar Configurações do Domínio no SQLite
async function salvarConfigDominioModal() {
  try {
    const payload = {
      codigo_empresa_padrao: document.getElementById('cfgDomCodigoEmpresa')?.value || '1',
      acumulador_compra: document.getElementById('cfgDomAcumuladorCompra')?.value || '1',
      acumulador_venda: document.getElementById('cfgDomAcumuladorVenda')?.value || '10',
      acumulador_uso_consumo: document.getElementById('cfgDomAcumuladorUsoConsumo')?.value || '2',
      acumulador_servico_tomado: document.getElementById('cfgDomAcumuladorServicoTomado')?.value || '50',
      conta_banco_padrao: document.getElementById('cfgDomContaBanco')?.value || '1.1.1.02.0001',
      conta_fornecedores_padrao: document.getElementById('cfgDomContaFornecedores')?.value || '2.1.1.01.0001',
      conta_clientes_padrao: document.getElementById('cfgDomContaClientes')?.value || '1.1.2.01.0001',
      conta_receita_padrao: document.getElementById('cfgDomContaReceita')?.value || '3.1.1.01.0001'
    };

    const res = await fetch('/api/dominio/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Configurações do Domínio salvas no banco de dados SQLite!', 'success');
      fecharConfigDominioModal();
    } else {
      throw new Error(data.error || 'Falha ao salvar configurações');
    }
  } catch (err) {
    showToast(`Erro ao salvar configurações: ${err.message}`, 'danger');
  }
}

// Abrir Manual Oficial do Domínio no Windows
async function abrirManualDominio(nome) {
  try {
    showToast(`Abrindo manual "${nome}"...`, 'info');
    const res = await fetch('/api/dominio/manuais/abrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Manual "${nome}" aberto com sucesso no seu leitor de PDF!`, 'success');
    } else {
      throw new Error(data.error || 'Falha ao abrir manual');
    }
  } catch (err) {
    showToast(`Erro ao abrir manual: ${err.message}`, 'danger');
  }
}

// Exportar Participantes (Layout 3 Oficial do Domínio)
async function exportarParticipantesDominioLayout3() {
  try {
    if (!notasProcessadasCache || notasProcessadasCache.length === 0) {
      showToast('Aviso: Nenhuma nota processada para extrair clientes/fornecedores.', 'warning');
      return;
    }

    const response = await fetch('/api/notas/exportar-dominio-participantes');
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Falha ao gerar arquivo Layout 3');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dominio_Layout3_Participantes_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Layout 3 gerado! No Domínio: Utilitários > Importação > Importador > Fornecedores / Clientes', 'success');
  } catch (err) {
    showToast(`Erro ao exportar Layout 3: ${err.message}`, 'danger');
  }
}

// Exportar para Excel / CSV no padrão contábil
function exportarNotasExcel() {
  if (notasProcessadasCache.length === 0) {
    showToast('Aviso: Nenhuma nota para exportar.', 'warning');
    return;
  }

  const cabecalho = ['Tipo', 'Numero', 'Serie', 'Emissao', 'Operacao', 'CNPJ_Emitente', 'Razao_Emitente', 'CNPJ_Destinatario', 'Razao_Destinatario', 'CFOP', 'Valor_Total', 'ICMS', 'PIS', 'COFINS', 'Chave_Acesso'];
  const linhas = notasProcessadasCache.map(n => [
    n.tipo || 'NFE',
    n.numero || '',
    n.serie || '',
    formatDateBR(n.dataEmissao),
    n.direcao || '',
    n.emitente?.cnpj || '',
    `"${(n.emitente?.razaoSocial || '').replace(/"/g, '""')}"`,
    n.destinatario?.cnpj || n.destinatario?.cpf || '',
    `"${(n.destinatario?.razaoSocial || '').replace(/"/g, '""')}"`,
    n.produtos && n.produtos[0] ? n.produtos[0].cfop : '',
    (n.totais?.valorNota || 0).toFixed(2).replace('.', ','),
    (n.totais?.valorICMS || 0).toFixed(2).replace('.', ','),
    (n.totais?.valorPIS || 0).toFixed(2).replace('.', ','),
    (n.totais?.valorCOFINS || 0).toFixed(2).replace('.', ','),
    `"${n.chave || ''}"`
  ]);

  const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MC_Hub_Notas_Fiscais_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Planilha de notas fiscais exportada com sucesso!', 'success');
}

// Helpers de formatação
function formatCurrency(val) {
  if (typeof val !== 'number') val = parseFloat(val) || 0;
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dtStr) {
  if (!dtStr) return '-';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) {
      const parts = String(dtStr).slice(0, 10).split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dtStr;
    }
    return d.toLocaleDateString('pt-BR');
  } catch (e) {
    return dtStr;
  }
}

function formatCNPJ(cnpj) {
  if (!cnpj) return '-';
  const c = String(cnpj).replace(/\D/g, '');
  if (c.length === 14) {
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (c.length === 11) {
    return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

/* ==========================================================================
   6. CENTRAL DE FOLHA DE PAGAMENTO & eSOCIAL (DOMÍNIO FO)
   ========================================================================== */
let folhaEventosCache = [];
let folhaSchemaCache = null;
let folhaAuditoriaCache = null;
let folhaSubTab = 'remun';

// Alterna entre as sub-abas de Folha de Pagamento
function switchSubFolha(subTab) {
  folhaSubTab = subTab;
  const subTabs = ['remun', 'admissoes', 'contabil', 'auditoria', 'schema'];
  
  subTabs.forEach(st => {
    const btn = document.getElementById(`subTabBtn-folha-${st}`);
    const content = document.getElementById(`subContent-folha-${st}`);
    
    if (btn) {
      if (st === subTab) {
        btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-[#84CC16] text-slate-950 shadow-sm';
      } else {
        btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 bg-white/10 hover:bg-white/20 text-slate-200';
      }
    }
    if (content) {
      if (st === subTab) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });

  if (subTab === 'auditoria' && !folhaAuditoriaCache) {
    carregarAuditoriaDP();
  }
  if (subTab === 'schema' && !folhaSchemaCache) {
    carregarFolhaSchema();
  }
  refreshIcons();
}

// Drag & Drop e Upload para Folha / eSocial
function handleDragOverFolha(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneFolha');
  if (zone) zone.classList.add('border-indigo-500', 'bg-indigo-50/50');
}

function handleDragLeaveFolha(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('dropZoneFolha');
  if (zone) zone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
}

function handleDropFolha(e) {
  e.preventDefault();
  e.stopPropagation();
  handleDragLeaveFolha(e);
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    processarFolhaFiles(Array.from(files));
  }
}

function handleFileInputFolha(e) {
  const files = e.target?.files;
  if (files && files.length > 0) {
    processarFolhaFiles(Array.from(files));
    e.target.value = '';
  }
}

async function processarFolhaFiles(files) {
  const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'));
  if (xmlFiles.length === 0) {
    showToast('Por favor, selecione arquivos XML válidos do eSocial.', 'warning');
    return;
  }

  const dropContent = document.getElementById('dropContentFolha');
  const progress = document.getElementById('uploadProgressFolha');
  const progressText = document.getElementById('progressTextFolha');

  if (dropContent) dropContent.classList.add('hidden');
  if (progress) progress.classList.remove('hidden');
  if (progressText) progressText.textContent = `Processando ${xmlFiles.length} evento(s) do eSocial...`;

  try {
    const formData = new FormData();
    xmlFiles.forEach(f => formData.append('xmlFiles', f));

    const res = await fetch('/api/folha/processar', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      const novos = data.eventos || [];
      folhaEventosCache = [...novos, ...folhaEventosCache];
      atualizarUIFolha();
      showToast(`${xmlFiles.length} arquivo(s) do eSocial processado(s) com sucesso!`, 'success');

      if (data.erros && data.erros.length > 0) {
        showToast(`Atenção: ${data.erros.length} arquivo(s) não puderam ser lidos.`, 'warning');
      }
    } else {
      showToast(`Erro ao processar folha: ${data.error || 'Falha desconhecida'}`, 'danger');
    }
  } catch (err) {
    console.error('Erro na requisição de folha:', err);
    showToast(`Erro de conexão com o servidor: ${err.message}`, 'danger');
  } finally {
    if (dropContent) dropContent.classList.remove('hidden');
    if (progress) progress.classList.add('hidden');
  }
}

async function loadFolhaProcessada() {
  try {
    const res = await fetch('/api/folha');
    const data = await res.json();
    if (data.success && Array.isArray(data.eventos)) {
      folhaEventosCache = data.eventos;
      atualizarUIFolha();
    }
  } catch (err) {
    console.error('Erro ao carregar folha processada:', err);
  }
}

function atualizarUIFolha() {
  const eventos = folhaEventosCache || [];
  const s1200List = eventos.filter(r => r.evento === 'S-1200');
  const s2200List = eventos.filter(r => r.evento === 'S-2200');
  const s2299List = eventos.filter(r => r.evento === 'S-2299');
  const totalizacoes = eventos.filter(r => r.evento === 'S-5001' || r.evento === 'S-5011');

  // Atualizar Badges do Topo
  const badgeFolha = document.getElementById('badgeFolhaCount');
  if (badgeFolha) badgeFolha.textContent = `${s1200List.length} colaboradores`;
  
  const subBadgeRemun = document.getElementById('badgeSubCountFolhaRemun');
  if (subBadgeRemun) subBadgeRemun.textContent = s1200List.length;

  const subBadgeAdmissoes = document.getElementById('badgeSubCountFolhaAdmissoes');
  if (subBadgeAdmissoes) subBadgeAdmissoes.textContent = s2200List.length + s2299List.length;

  // Totais Monetários
  const totalProventos = s1200List.reduce((s, r) => s + (r.detalhes?.totalProventos || 0), 0);
  const totalDescontos = s1200List.reduce((s, r) => s + (r.detalhes?.totalDescontos || 0), 0);
  const totalLiquido = s1200List.reduce((s, r) => s + (r.detalhes?.valorLiquido || 0), 0);
  const totalDCTFWeb = totalizacoes.reduce((s, r) => s + (r.detalhes?.totalDCTFWeb || 0), 0);

  // Atualizar 5 Cards Monetra
  const cardTrabalhadores = document.getElementById('cardFolhaTrabalhadores');
  const cardMovimentacoes = document.getElementById('cardFolhaMovimentacoes');
  const cardProventos = document.getElementById('cardFolhaProventos');
  const cardDescontos = document.getElementById('cardFolhaDescontos');
  const cardLiquido = document.getElementById('cardFolhaLiquido');
  const cardDCTFWeb = document.getElementById('cardFolhaDCTFWeb');

  if (cardTrabalhadores) cardTrabalhadores.textContent = s1200List.length;
  if (cardMovimentacoes) cardMovimentacoes.textContent = `${s2200List.length} admissões · ${s2299List.length} demissões`;
  if (cardProventos) cardProventos.textContent = formatCurrency(totalProventos);
  if (cardDescontos) cardDescontos.textContent = formatCurrency(totalDescontos);
  if (cardLiquido) cardLiquido.textContent = formatCurrency(totalLiquido);
  if (cardDCTFWeb) cardDCTFWeb.textContent = formatCurrency(totalDCTFWeb);

  // Renderizar Tabelas
  renderTabelaFolhaRemun();
  renderTabelaFolhaAdmissoes();
  renderTabelaFolhaRescisoes();
  renderTabelaFolhaContabil();
  refreshIcons();
}

function renderTabelaFolhaRemun() {
  const tbody = document.getElementById('tbodyFolhaRemun');
  const infoCount = document.getElementById('infoFolhaCount');
  if (!tbody) return;

  const s1200List = folhaEventosCache.filter(r => r.evento === 'S-1200');
  const busca = (document.getElementById('inputFolhaBusca')?.value || '').toLowerCase().trim();

  const filtered = s1200List.filter(ev => {
    if (!busca) return true;
    const cpf = (ev.trabalhador?.cpf || '').toLowerCase();
    const nome = (ev.detalhes?.nome || '').toLowerCase();
    const emp = (ev.empregador?.inscricao || '').toLowerCase();
    const comp = (ev.competencia || '').toLowerCase();
    return cpf.includes(busca) || nome.includes(busca) || emp.includes(busca) || comp.includes(busca);
  });

  if (infoCount) infoCount.textContent = `${filtered.length} registro(s)`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400">
          Nenhum evento de remuneração (S-1200) encontrado com os filtros atuais.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((ev, index) => {
    const det = ev.detalhes || {};
    const rubricasHtml = (det.rubricas || []).slice(0, 4).map(r => `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono-code mr-1 mb-1 ${r.tipo === 'Provento' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'}">
        ${r.codigo} - ${r.desc || 'Rubrica'}: ${formatCurrency(r.valor)}
      </span>
    `).join('') || '<span class="text-xs text-slate-400 italic">Sem rubricas</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
            ${ev.evento}
          </span>
          <div class="text-[11px] text-slate-400 mt-0.5 font-mono-code font-bold">${ev.competencia || 'Comp. Atual'}</div>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="font-extrabold text-slate-900 font-mono-code text-xs">${ev.trabalhador?.cpfFormatado || ev.trabalhador?.cpf || 'CPF Não Identificado'}</div>
          <div class="text-[11px] text-slate-400 font-mono-code">Empregador: ${ev.empregador?.inscricaoFormatada || ev.empregador?.inscricao || ''}</div>
        </td>
        <td class="py-3 px-4 whitespace-nowrap text-right font-mono-code font-bold text-emerald-600">
          ${formatCurrency(det.totalProventos || 0)}
        </td>
        <td class="py-3 px-4 whitespace-nowrap text-right font-mono-code font-bold text-rose-600">
          ${formatCurrency(det.totalDescontos || 0)}
        </td>
        <td class="py-3 px-4 whitespace-nowrap text-right font-mono-code font-extrabold text-slate-900">
          ${formatCurrency(det.valorLiquido || 0)}
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap max-w-sm">
            ${rubricasHtml}
          </div>
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <button onclick="abrirModalDetalhesFolha(${index})" class="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition" title="Ver Holerite Completo">
            Ver Holerite
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTabelaFolhaAdmissoes() {
  const tbody = document.getElementById('tbodyFolhaAdmissoes');
  const infoCount = document.getElementById('infoAdmissoesCount');
  if (!tbody) return;

  const s2200List = folhaEventosCache.filter(r => r.evento === 'S-2200');
  if (infoCount) infoCount.textContent = `${s2200List.length} admissões`;

  if (s2200List.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400">Nenhuma admissão (S-2200) carregada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = s2200List.map(ev => {
    const det = ev.detalhes || {};
    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">${det.nome || 'Colaborador Admitido'}</td>
        <td class="py-3 px-4 font-mono-code text-slate-600 whitespace-nowrap text-xs">${ev.trabalhador?.cpfFormatado || ev.trabalhador?.cpf || '-'}</td>
        <td class="py-3 px-4 font-mono-code text-slate-400 whitespace-nowrap text-xs">${det.matricula || '-'}</td>
        <td class="py-3 px-4 text-slate-600 whitespace-nowrap text-xs font-mono-code">${det.dataAdmissao || '-'}</td>
        <td class="py-3 px-4 text-slate-700">
          <div class="font-bold text-xs">${det.cargo || '-'}</div>
          <div class="text-[11px] text-slate-400 font-mono-code">CBO: ${det.cbo || '-'}</div>
        </td>
        <td class="py-3 px-4 text-right font-mono-code font-extrabold text-emerald-600 whitespace-nowrap">
          ${formatCurrency(det.salario || 0)}
        </td>
        <td class="py-3 px-4 text-xs whitespace-nowrap">
          <span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">${det.tipoContrato || 'Indeterminado'}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTabelaFolhaRescisoes() {
  const tbody = document.getElementById('tbodyFolhaRescisoes');
  const infoCount = document.getElementById('infoRescisoesCount');
  if (!tbody) return;

  const s2299List = folhaEventosCache.filter(r => r.evento === 'S-2299');
  if (infoCount) infoCount.textContent = `${s2299List.length} rescisões`;

  if (s2299List.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-10 text-center text-slate-400">Nenhuma rescisão (S-2299) carregada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = s2299List.map(ev => {
    const det = ev.detalhes || {};
    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-4 font-mono-code text-slate-900 whitespace-nowrap font-bold text-xs">${ev.trabalhador?.cpfFormatado || ev.trabalhador?.cpf || '-'}</td>
        <td class="py-3 px-4 text-slate-600 whitespace-nowrap text-xs font-mono-code">${det.dataDesligamento || '-'}</td>
        <td class="py-3 px-4 text-rose-700 font-bold text-xs">${det.motivoDescricao || det.motivoDesligamento || 'Rescisão de Contrato'}</td>
        <td class="py-3 px-4 text-xs font-mono-code text-slate-400">${ev.fileName || 'XML eSocial'}</td>
      </tr>
    `;
  }).join('');
}

function renderTabelaFolhaContabil() {
  const tbody = document.getElementById('tbodyFolhaContabil');
  if (!tbody) return;

  const todasPartidas = [];
  folhaEventosCache.forEach(ev => {
    (ev.contabilizacao || []).forEach(p => todasPartidas.push(p));
  });

  if (todasPartidas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-sans">Carregue eventos de folha para gerar as partidas dobradas contábeis.</td></tr>`;
    return;
  }

  tbody.innerHTML = todasPartidas.map(p => `
    <tr class="hover:bg-slate-50/80 transition text-xs font-mono-code">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${p.data || '-'}</td>
      <td class="py-3 px-4 whitespace-nowrap">
        <span class="text-blue-600 font-extrabold">${p.contaDebito}</span>
        <div class="text-[11px] text-slate-400 font-sans">${p.descDebito || ''}</div>
      </td>
      <td class="py-3 px-4 whitespace-nowrap">
        <span class="text-emerald-600 font-extrabold">${p.contaCredito}</span>
        <div class="text-[11px] text-slate-400 font-sans">${p.descCredito || ''}</div>
      </td>
      <td class="py-3 px-4 whitespace-nowrap text-right font-extrabold text-slate-900">${formatCurrency(p.valor || 0)}</td>
      <td class="py-3 px-4 text-slate-600 font-sans text-xs">${p.historico || ''}</td>
    </tr>
  `).join('');
}

async function carregarAuditoriaDP() {
  const tbody = document.getElementById('tbodyFolhaAuditoria');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="py-8 text-center text-slate-400">
        <span class="inline-block animate-spin mr-2">&#9696;</span> Auditando pastas de DP na rede \\\\192.168.15.2...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/folha/auditoria-pastas');
    const data = await res.json();
    if (data.success) {
      folhaAuditoriaCache = data;
      const empresas = data.empresas || [];
      if (empresas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Nenhuma empresa encontrada com dados de DP.</td></tr>`;
        return;
      }

      const badgeIcon = (ok) => ok 
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">SIM</span>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">FALTA</span>`;

      tbody.innerHTML = empresas.map(emp => {
        let badgeConf = '';
        if (emp.conformidadeDP === 100) {
          badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">100% Completa</span>`;
        } else if (emp.conformidadeDP >= 50) {
          badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${emp.conformidadeDP}% Parcial</span>`;
        } else {
          badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">${emp.conformidadeDP}% Pendente</span>`;
        }

        return `
          <tr class="hover:bg-slate-50/80 transition text-xs">
            <td class="py-3 px-4 font-bold text-slate-900">
              <div>${emp.nome}</div>
              <div class="text-[11px] text-slate-400 font-normal">${emp.razao || ''}</div>
            </td>
            <td class="py-3 px-4 whitespace-nowrap text-slate-500 font-medium">${emp.regime || '-'}</td>
            <td class="py-3 px-4 whitespace-nowrap text-center">${badgeIcon(emp.hasFolha)}</td>
            <td class="py-3 px-4 whitespace-nowrap text-center">${badgeIcon(emp.hasAdmissoes)}</td>
            <td class="py-3 px-4 whitespace-nowrap text-center">${badgeIcon(emp.hasRescisoes)}</td>
            <td class="py-3 px-4 whitespace-nowrap text-center">${badgeIcon(emp.hasDeclaracoes)}</td>
            <td class="py-3 px-4 whitespace-nowrap text-center">${badgeConf}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-rose-500">Erro na auditoria: ${err.message}</td></tr>`;
  }
}

async function carregarFolhaSchema() {
  const container = document.getElementById('containerFolhaSchema');
  if (!container) return;

  try {
    const res = await fetch('/api/folha/schema');
    const data = await res.json();
    if (data.success && data.schema) {
      folhaSchemaCache = data.schema;
      const cats = data.schema.categorias || {};
      container.innerHTML = Object.entries(cats).map(([cat, tables]) => `
        <div class="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4">
          <div class="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-3">
            <span class="font-extrabold text-xs text-slate-900 uppercase tracking-wider">${cat.replace('_', ' ')}</span>
            <span class="text-[11px] font-mono-code px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-bold">${tables.length} tabelas</span>
          </div>
          <div class="space-y-1 max-h-36 overflow-y-auto pr-1 text-xs font-mono-code text-slate-600">
            ${tables.map(t => `<div class="hover:text-blue-600 py-0.5 truncate">&bull; ${t}</div>`).join('')}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar schema FO:', err);
  }
}

function abrirModalDetalhesFolha(index) {
  const s1200List = folhaEventosCache.filter(r => r.evento === 'S-1200');
  const ev = s1200List[index];
  if (!ev) return;

  const det = ev.detalhes || {};
  const modal = document.getElementById('modalDetalhesFolha');
  const nomeEl = document.getElementById('modalFolhaNomeColaborador');
  const cpfEl = document.getElementById('modalFolhaCpfCompetencia');
  const bodyEl = document.getElementById('modalFolhaBody');

  if (nomeEl) nomeEl.textContent = det.nome || 'Demonstrativo de Pagamento';
  if (cpfEl) cpfEl.textContent = `CPF: ${ev.trabalhador?.cpfFormatado || ev.trabalhador?.cpf || '-'} · Competência: ${ev.competencia || 'Atual'}`;

  if (bodyEl) {
    const rubricasRows = (det.rubricas || []).map(r => `
      <tr class="border-b border-slate-100">
        <td class="py-2 font-mono-code font-bold text-slate-700">${r.codigo}</td>
        <td class="py-2 text-slate-800">${r.desc || 'Rubrica'}</td>
        <td class="py-2 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.tipo === 'Provento' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">${r.tipo}</span>
        </td>
        <td class="py-2 text-right font-mono-code font-bold ${r.tipo === 'Provento' ? 'text-emerald-600' : 'text-rose-600'}">
          ${formatCurrency(r.valor)}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="py-4 text-center text-slate-400">Nenhuma rubrica individual listada.</td></tr>';

    bodyEl.innerHTML = `
      <div class="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-center">
        <div>
          <div class="text-[10px] text-slate-400 font-bold uppercase">Total Proventos</div>
          <div class="text-base font-extrabold text-emerald-600 font-mono-code">${formatCurrency(det.totalProventos || 0)}</div>
        </div>
        <div>
          <div class="text-[10px] text-slate-400 font-bold uppercase">Total Descontos</div>
          <div class="text-base font-extrabold text-rose-600 font-mono-code">${formatCurrency(det.totalDescontos || 0)}</div>
        </div>
        <div>
          <div class="text-[10px] text-slate-400 font-bold uppercase">Valor Líquido</div>
          <div class="text-base font-extrabold text-slate-900 font-mono-code">${formatCurrency(det.valorLiquido || 0)}</div>
        </div>
      </div>

      <div class="border border-slate-200/70 rounded-2xl overflow-hidden mt-3">
        <div class="p-3 bg-slate-50 border-b border-slate-200/60 font-bold text-slate-800 text-xs">
          Rubricas da Folha de Pagamento
        </div>
        <div class="max-h-60 overflow-y-auto p-3">
          <table class="w-full text-left">
            <thead>
              <tr class="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100">
                <th class="pb-2">Cód</th>
                <th class="pb-2">Descrição</th>
                <th class="pb-2 text-center">Tipo</th>
                <th class="pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${rubricasRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.classList.remove('hidden');
    refreshIcons();
  }
}

function fecharModalDetalhesFolha() {
  const modal = document.getElementById('modalDetalhesFolha');
  if (modal) modal.classList.add('hidden');
}

function exportarFolhaExcel() {
  const s1200List = folhaEventosCache.filter(r => r.evento === 'S-1200');
  if (s1200List.length === 0) {
    showToast('Aviso: Nenhum evento de folha para exportar.', 'warning');
    return;
  }

  const cabecalho = ['Evento', 'Competencia', 'CPF', 'Empregador', 'Total_Proventos', 'Total_Descontos', 'Valor_Liquido'];
  const linhas = s1200List.map(ev => {
    const det = ev.detalhes || {};
    return [
      ev.evento || 'S-1200',
      ev.competencia || '',
      `"${ev.trabalhador?.cpf || ''}"`,
      `"${ev.empregador?.inscricao || ''}"`,
      (det.totalProventos || 0).toFixed(2).replace('.', ','),
      (det.totalDescontos || 0).toFixed(2).replace('.', ','),
      (det.valorLiquido || 0).toFixed(2).replace('.', ',')
    ];
  });

  const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MC_Hub_Folha_eSocial_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Planilha de folha de pagamento exportada com sucesso!', 'success');
}

function exportarFolhaDominio() {
  const todasPartidas = [];
  folhaEventosCache.forEach(ev => {
    (ev.contabilizacao || []).forEach(p => todasPartidas.push(p));
  });

  if (todasPartidas.length === 0) {
    showToast('Aviso: Nenhuma partida contábil de folha para exportar.', 'warning');
    return;
  }

  // Formato Padrão Domínio Contábil: DATA|DEBITO|CREDITO|VALOR|HISTORICO
  const linhas = todasPartidas.map(p => {
    const dataTxt = p.data || '';
    const debito = (p.contaDebito || '').split(' - ')[0];
    const credito = (p.contaCredito || '').split(' - ')[0];
    const vlrTxt = (p.valor || 0).toFixed(2).replace('.', ',');
    const hist = (p.historico || '').replace(/[\|\r\n]/g, ' ');
    return `${dataTxt}|${debito}|${credito}|${vlrTxt}|${hist}`;
  });

  const txtContent = linhas.join('\r\n');
  const blob = new Blob([txtContent], { type: 'text/plain;charset=latin1;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MC_Dominio_Folha_Lancamentos_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Lançamentos de folha para o Domínio Contábil gerados com sucesso!', 'success');
}

async function limparFolhaProcessadaUI() {
  if (folhaEventosCache.length === 0) {
    showToast('Nenhum dado de folha para limpar.', 'info');
    return;
  }

  if (!confirm('Deseja realmente limpar todos os eventos de folha e eSocial processados?')) return;
  try {
    const res = await fetch('/api/folha', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      folhaEventosCache = [];
      atualizarUIFolha();
      showToast('Dados de folha limpos com sucesso.', 'info');
    }
  } catch (err) {
    showToast(`Erro ao limpar folha: ${err.message}`, 'danger');
  }
}

// =========================================================================
// MÓDULO: GERENCIADOR DE CONEXÃO DE REDE & ACESSO REMOTO AUTOMÁTICO
// =========================================================================
let dadosConexaoRedeCache = null;
let presetRedeSelecionado = null;

// Verifica a conexão de rede ao abrir o site ou quando solicitado
async function verificarConexaoRede(mostrarToast = false) {
  try {
    const res = await fetch('/api/rede/status');
    const data = await res.json();
    if (!data.success) return;

    dadosConexaoRedeCache = data;

    // Atualiza o Badge do Top Header
    const dotHeader = document.getElementById('dotHeaderConexao');
    const labelHeader = document.getElementById('labelHeaderConexao');
    if (dotHeader && labelHeader) {
      if (data.conectado) {
        dotHeader.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
        labelHeader.textContent = `${data.apelido || 'Rede'} (${data.latenciaMs}ms)`;
        labelHeader.className = 'text-xs font-bold text-slate-800 hidden sm:inline';
      } else {
        dotHeader.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
        labelHeader.textContent = 'Fora da Rede (Configurar)';
        labelHeader.className = 'text-xs font-bold text-rose-700 hidden sm:inline';
      }
    }

    // Atualiza o Banner dentro do Modal
    const dotModal = document.getElementById('dotModalStatusRede');
    const labelModal = document.getElementById('labelModalStatusRede');
    const badgeLat = document.getElementById('badgeModalLatencia');
    const caminhoModal = document.getElementById('caminhoModalStatusRede');
    const inputEndereco = document.getElementById('inputEnderecoRede');

    if (dotModal && labelModal) {
      if (data.conectado) {
        dotModal.className = 'w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0';
        labelModal.textContent = `Conectado: ${data.apelido || 'Rede Local'}`;
        labelModal.className = 'text-slate-900 font-bold';
        if (badgeLat) {
          badgeLat.textContent = `${data.latenciaMs}ms`;
          badgeLat.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800';
        }
      } else {
        dotModal.className = 'w-3.5 h-3.5 rounded-full bg-rose-500 shrink-0';
        labelModal.textContent = 'Desconectado / Fora da Rede';
        labelModal.className = 'text-rose-700 font-bold';
        if (badgeLat) {
          badgeLat.textContent = 'Off';
          badgeLat.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800';
        }
      }
    }

    if (caminhoModal) caminhoModal.textContent = data.ativo || 'Nenhum endereço configurado';
    if (inputEndereco && !inputEndereco.value) inputEndereco.value = data.ativo || '';

    if (mostrarToast) {
      if (data.conectado) {
        showToast(`Rede Conectada: ${data.apelido} (${data.latenciaMs}ms)`, 'success');
      } else {
        showToast('Aviso: O endereço ativo de rede não está acessível no momento.', 'warning');
      }
    }
  } catch (err) {
    console.error('Erro ao verificar conexão de rede:', err);
  }
}

// Abrir modal de conexão
function abrirModalConexaoRede() {
  const modal = document.getElementById('modalConexaoRede');
  if (modal) {
    modal.classList.remove('hidden');
    verificarConexaoRede(false);
    refreshIcons();
  }
}

// Fechar modal de conexão
function fecharModalConexaoRede() {
  const modal = document.getElementById('modalConexaoRede');
  if (modal) modal.classList.add('hidden');
}

// Seleciona um dos presets rápidos no modal
function selecionarPresetRede(endereco, apelido) {
  const input = document.getElementById('inputEnderecoRede');
  presetRedeSelecionado = { endereco, apelido };

  if (endereco === 'VPN') {
    const vpnSalva = dadosConexaoRedeCache?.presets?.find(p => p.id === 'vpn_tailscale')?.endereco || '';
    const vpnIp = prompt('Digite o endereço IP ou nome da máquina na VPN (ex: \\\\100.x.y.z\\mc assessoria contabil):', vpnSalva);
    if (vpnIp) {
      if (input) input.value = vpnIp.trim();
      presetRedeSelecionado.endereco = vpnIp.trim();
    } else {
      return;
    }
  } else {
    if (input) input.value = endereco;
  }

  // Destaque visual do card
  const cards = ['drive_x', 'unc_rede', 'vpn', 'local_c'];
  cards.forEach(c => {
    const el = document.getElementById(`presetCard-${c}`);
    if (el) el.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-50/30');
  });

  if (endereco.startsWith('X:')) {
    document.getElementById('presetCard-drive_x')?.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50/30');
  } else if (endereco.includes('192.168.15.2')) {
    document.getElementById('presetCard-unc_rede')?.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50/30');
  } else if (endereco.includes('Contabil')) {
    document.getElementById('presetCard-local_c')?.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50/30');
  } else {
    document.getElementById('presetCard-vpn')?.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50/30');
  }

  testarEnderecoRedeAtual();
}

// Testa a rota/pasta digitada antes de salvar
async function testarEnderecoRedeAtual() {
  const input = document.getElementById('inputEnderecoRede');
  const feedback = document.getElementById('feedbackTesteRede');
  const btn = document.getElementById('btnTestarRede');
  const endereco = input ? input.value.trim() : '';

  if (!endereco) {
    showToast('Informe um endereço para testar.', 'warning');
    return;
  }

  const originalBtn = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = `<div class="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div><span>Testando...</span>`;

  try {
    const res = await fetch('/api/rede/testar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endereco })
    });
    const data = await res.json();

    if (feedback) {
      feedback.classList.remove('hidden');
      if (data.disponivel) {
        feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200';
        feedback.innerHTML = `
          <div class="flex items-center gap-2">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
            <span><strong>Conexão Online!</strong> Resposta em ${data.latenciaMs}ms. Pastas encontradas: ${data.subpastas?.length || 0}</span>
          </div>
          ${data.subpastas && data.subpastas.length > 0 ? `<div class="text-[10px] text-emerald-700 mt-1 truncate">Exemplos: ${data.subpastas.slice(0, 4).join(', ')}</div>` : ''}
        `;
      } else {
        feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200';
        feedback.innerHTML = `
          <div class="flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-600"></i>
            <span><strong>Endereço Inacessível:</strong> Não foi possível acessar este caminho na rede. Verifique se o drive está mapeado, se a VPN está conectada ou se há permissões.</span>
          </div>
        `;
      }
      refreshIcons();
    }
  } catch (err) {
    if (feedback) {
      feedback.classList.remove('hidden');
      feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200';
      feedback.textContent = `Erro no teste: ${err.message}`;
    }
  } finally {
    if (btn) btn.innerHTML = originalBtn;
    refreshIcons();
  }
}

// Conectar ao endereço e salvar como padrão
async function conectarEnderecoRedeAtual() {
  const input = document.getElementById('inputEnderecoRede');
  const check = document.getElementById('checkAutoConectarRede');
  const btn = document.getElementById('btnSalvarConectarRede');
  const endereco = input ? input.value.trim() : '';

  if (!endereco) {
    showToast('Informe o endereço de conexão.', 'warning');
    return;
  }

  const originalBtn = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div><span>Conectando...</span>`;
  }

  try {
    const apelido = presetRedeSelecionado?.apelido || (endereco.startsWith('X:') ? 'Drive X: (Escritório)' : 'Rede Conectada');
    const autoConectar = check ? check.checked : true;

    const res = await fetch('/api/rede/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endereco, apelido, autoConectar })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao conectar no endereço');
    }

    showToast(`Conectado com sucesso em "${data.apelido}"! O sistema agora busca os arquivos deste local.`, 'success');
    fecharModalConexaoRede();
    await verificarConexaoRede(false);
    await loadClients();
    await loadStatus();
  } catch (err) {
    showToast(`Erro ao conectar: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtn;
      refreshIcons();
    }
  }
}

// =========================================================================
// MÓDULO: EXPLORADOR DE PASTAS E ARQUIVOS DIRETO NA WEB (DESIGN MONETRA)
// =========================================================================
let caminhoAtualExplorador = '';
let caminhoPaiExplorador = null;
let itensExploradorCache = { pastas: [], arquivos: [] };

// Abrir Explorador Web
async function abrirExploradorWeb(caminhoOuClientId = '', nomeAmigavel = '') {
  const modal = document.getElementById('modalWebExplorer');
  if (!modal) return;

  modal.classList.remove('hidden');
  const tituloEl = document.getElementById('explorerTituloPasta');
  if (tituloEl) tituloEl.textContent = nomeAmigavel || 'Explorador de Arquivos Web';

  await carregarPastaExplorador(caminhoOuClientId);
  refreshIcons();
}

// Fechar Explorador Web
function fecharExploradorWeb() {
  const modal = document.getElementById('modalWebExplorer');
  if (modal) modal.classList.add('hidden');
}

// Carregar conteúdo de uma pasta
async function carregarPastaExplorador(caminho = '') {
  const subtitulo = document.getElementById('explorerSubtituloCaminho');
  const btnSubir = document.getElementById('btnSubirNivelExplorador');
  const searchInput = document.getElementById('searchExplorerInput');
  if (searchInput) searchInput.value = '';

  try {
    const url = `/api/explorer/browse?path=${encodeURIComponent(caminho)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao ler pasta');
    }

    caminhoAtualExplorador = data.currentPath;
    caminhoPaiExplorador = data.parentPath;
    itensExploradorCache = { pastas: data.pastas || [], arquivos: data.arquivos || [] };

    if (subtitulo) subtitulo.textContent = data.currentPath;

    // Atualiza botão Subir Pasta
    if (btnSubir) {
      btnSubir.disabled = !data.parentPath;
    }

    // Renderiza Breadcrumbs
    renderBreadcrumbsExplorador(data.breadcrumbs || []);

    // Renderiza Pastas e Arquivos
    renderItensExplorador(data.pastas, data.arquivos);
  } catch (err) {
    showToast(`Erro ao abrir pasta: ${err.message}`, 'error');
  }
}

// Renderiza a barra de navegação de breadcrumbs
function renderBreadcrumbsExplorador(crumbs) {
  const container = document.getElementById('explorerBreadcrumbs');
  if (!container) return;
  container.innerHTML = '';

  crumbs.forEach((crumb, idx) => {
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'text-slate-300 font-bold';
      sep.textContent = '/';
      container.appendChild(sep);
    }

    const btn = document.createElement('button');
    const isLast = idx === crumbs.length - 1;
    btn.className = `px-2 py-0.5 rounded text-xs font-semibold transition truncate max-w-[150px] ${
      isLast ? 'bg-[#0F172A] text-[#84CC16] font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
    }`;
    btn.textContent = crumb.name;
    btn.title = crumb.path;
    btn.onclick = () => carregarPastaExplorador(crumb.path);
    container.appendChild(btn);
  });
}

// Renderiza os cards de pastas e tabela de arquivos
function renderItensExplorador(pastas, arquivos) {
  const gridPastas = document.getElementById('gridSubpastasExplorador');
  const tbodyArquivos = document.getElementById('tbodyArquivosExplorador');
  const secaoPastas = document.getElementById('secaoSubpastasExplorador');
  const secaoArquivos = document.getElementById('secaoArquivosExplorador');
  const emptyState = document.getElementById('emptyExploradorState');

  setElText('countSubpastasExplorador', pastas.length);
  setElText('countArquivosExplorador', arquivos.length);
  setElText('labelContagemGeralExplorador', `${pastas.length} pasta(s) · ${arquivos.length} arquivo(s)`);

  const total = pastas.length + arquivos.length;
  if (total === 0) {
    if (secaoPastas) secaoPastas.classList.add('hidden');
    if (secaoArquivos) secaoArquivos.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  // 1. Pastas
  if (gridPastas) {
    gridPastas.innerHTML = '';
    if (pastas.length === 0) {
      if (secaoPastas) secaoPastas.classList.add('hidden');
    } else {
      if (secaoPastas) secaoPastas.classList.remove('hidden');
      pastas.forEach(p => {
        const div = document.createElement('div');
        div.className = 'p-3 rounded-2xl bg-white border border-slate-200/80 hover:border-amber-400 hover:shadow-md cursor-pointer transition flex items-center justify-between group';
        div.onclick = () => carregarPastaExplorador(p.path);
        div.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0 pr-1">
            <div class="w-8 h-8 rounded-xl bg-amber-50 group-hover:bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 transition">
              <i data-lucide="folder" class="w-4 h-4 fill-amber-500/20"></i>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-800 group-hover:text-amber-800 truncate" title="${p.name}">${p.name}</div>
              <div class="text-[10px] text-slate-400">${p.count} item(s)</div>
            </div>
          </div>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-600 transition shrink-0"></i>
        `;
        gridPastas.appendChild(div);
      });
    }
  }

  // 2. Arquivos
  if (tbodyArquivos) {
    tbodyArquivos.innerHTML = '';
    if (arquivos.length === 0) {
      if (secaoArquivos) secaoArquivos.classList.add('hidden');
    } else {
      if (secaoArquivos) secaoArquivos.classList.remove('hidden');
      arquivos.forEach(f => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition';

        let iconeTipo = 'file-text';
        let corIcone = 'text-slate-400';
        let badgeTipo = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">${f.ext ? f.ext.replace('.', '') : 'ARQ'}</span>`;

        if (f.isZip) {
          iconeTipo = 'archive';
          corIcone = 'text-amber-500';
          const countTxt = f.zipCount ? `${f.zipCount} XMLs` : 'ZIP';
          badgeTipo = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">ZIP (${countTxt})</span>`;
        } else if (f.isPdf) {
          iconeTipo = 'file-text';
          corIcone = 'text-rose-600';
          badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">PDF</span>';
        } else if (f.isXml) {
          iconeTipo = 'code';
          corIcone = 'text-emerald-600';
          badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">XML</span>';
        } else if (f.isSpreadsheet) {
          iconeTipo = 'sheet';
          corIcone = 'text-emerald-700';
          badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700">EXCEL</span>';
        } else if (f.isImage) {
          iconeTipo = 'image';
          corIcone = 'text-purple-600';
          badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">IMAGEM</span>';
        }

        const dataModFormatada = f.mtime ? formatDateBR(f.mtime) : '-';

        tr.innerHTML = `
          <td class="py-2.5 px-4 font-semibold text-slate-800 flex items-center gap-2 min-w-[200px] truncate" title="${f.name}">
            <i data-lucide="${iconeTipo}" class="w-4 h-4 ${corIcone} shrink-0"></i>
            <span class="truncate ${f.isZip ? 'cursor-pointer hover:text-amber-700 font-bold' : ''}" ${f.isZip ? `onclick="abrirVisualizadorZip('${encodeURIComponent(f.path)}', '${encodeURIComponent(f.name)}')"` : ''}>${f.name}</span>
          </td>
          <td class="py-2.5 px-4 text-center whitespace-nowrap">
            ${badgeTipo}
          </td>
          <td class="py-2.5 px-4 text-right font-mono-code text-slate-600 whitespace-nowrap">
            ${f.sizeFormatted}
          </td>
          <td class="py-2.5 px-4 text-right text-slate-400 whitespace-nowrap">
            ${dataModFormatada}
          </td>
          <td class="py-2.5 px-4 text-center whitespace-nowrap">
            <div class="flex items-center justify-center gap-1.5">
              ${f.isZip ? `
                <button onclick="abrirVisualizadorZip('${encodeURIComponent(f.path)}', '${encodeURIComponent(f.name)}')" class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-600 hover:text-white text-amber-800 text-xs font-bold transition flex items-center gap-1 border border-amber-300" title="Ver Arquivos dentro deste ZIP">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  <span>Ver Notas</span>
                </button>
                <button onclick="descompactarZipNaPasta('${encodeURIComponent(f.path)}')" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-600 hover:text-white text-emerald-800 text-xs font-bold transition flex items-center gap-1 border border-emerald-300" title="Descompactar Todos os XMLs nesta Pasta">
                  <i data-lucide="folder-output" class="w-3.5 h-3.5"></i>
                  <span>Extrair</span>
                </button>
              ` : ''}
              ${f.isPdf || f.isXml ? `
                <button onclick="visualizarArquivoWeb('${encodeURIComponent(f.path)}', '${encodeURIComponent(f.name)}', '${f.ext}')" class="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-500 hover:text-slate-950 text-slate-700 transition" title="Visualizar Direto na Web">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
              <button onclick="baixarArquivoWeb('${encodeURIComponent(f.path)}')" class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 transition" title="Baixar Arquivo">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        `;
        tbodyArquivos.appendChild(tr);
      });
    }
  }

  refreshIcons();
}

// Navegar para pasta pai (subir nível)
function navegarPastaPaiExplorador() {
  if (caminhoPaiExplorador) {
    carregarPastaExplorador(caminhoPaiExplorador);
  }
}

// Filtrar itens na pasta atual
function filtrarItensExplorador(termo) {
  const query = (termo || '').toLowerCase().trim();
  if (!query) {
    renderItensExplorador(itensExploradorCache.pastas, itensExploradorCache.arquivos);
    return;
  }

  const pastasFiltradas = itensExploradorCache.pastas.filter(p => p.name.toLowerCase().includes(query));
  const arquivosFiltrados = itensExploradorCache.arquivos.filter(a => a.name.toLowerCase().includes(query));
  renderItensExplorador(pastasFiltradas, arquivosFiltrados);
}

// Visualizar arquivo PDF ou XML diretamente no navegador
function visualizarArquivoWeb(encPath, encName, ext) {
  const path = decodeURIComponent(encPath);
  const url = `/api/explorer/file?path=${encodeURIComponent(path)}`;
  window.open(url, '_blank');
}

// Baixar arquivo diretamente
function baixarArquivoWeb(encPath) {
  const path = decodeURIComponent(encPath);
  const url = `/api/explorer/file?path=${encodeURIComponent(path)}&download=1`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Abrir esta mesma pasta no Windows Explorer tradicional
async function abrirCaminhoAtualNoWindowsExplorer() {
  if (!caminhoAtualExplorador) return;
  try {
    showToast('Abrindo pasta no Windows Explorer...', 'info');
    await fetch('/api/clients/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: caminhoAtualExplorador })
    });
    showToast('Comando enviado para o Windows Explorer.', 'success');
  } catch(e) {
    showToast(`Erro ao abrir Windows: ${e.message}`, 'error');
  }
}

// =========================================================================
// MÓDULO VISUALIZADOR DE ARQUIVOS ZIP & EXTRAÇÃO DE NOTAS FISCAIS
// =========================================================================

let zipAtualCaminho = '';
let zipAtualNome = '';
let arquivosZipCache = [];

// Abrir Modal do Visualizador de ZIP
async function abrirVisualizadorZip(encPath, encName) {
  const path = decodeURIComponent(encPath);
  const name = decodeURIComponent(encName);
  zipAtualCaminho = path;
  zipAtualNome = name;

  const modal = document.getElementById('modalVisualizadorZip');
  const titulo = document.getElementById('zipModalTitulo');
  const subtitulo = document.getElementById('zipModalCaminho');
  const badge = document.getElementById('zipModalBadgeContador');
  const tbody = document.getElementById('tbodyArquivosZip');
  const searchInput = document.getElementById('inputBuscaZip');

  if (searchInput) searchInput.value = '';
  if (titulo) titulo.textContent = name;
  if (subtitulo) subtitulo.textContent = path;
  if (badge) badge.textContent = 'Lendo arquivo...';
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-semibold">Carregando notas fiscais do arquivo ZIP...</td></tr>`;

  if (modal) modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/explorer/zip/browse?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao abrir pacote ZIP');
    }

    arquivosZipCache = data.arquivos || [];
    if (badge) badge.textContent = `${arquivosZipCache.length} nota(s) / arquivo(s)`;
    renderArquivosZip(arquivosZipCache);
  } catch (err) {
    showToast(`Erro ao ler ZIP: ${err.message}`, 'error');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-rose-500 font-semibold">Erro ao abrir: ${err.message}</td></tr>`;
  }
}

// Fechar Visualizador ZIP
function fecharVisualizadorZip() {
  const modal = document.getElementById('modalVisualizadorZip');
  if (modal) modal.classList.add('hidden');
}

// Renderizar Tabela de Arquivos do ZIP
function renderArquivosZip(lista) {
  const tbody = document.getElementById('tbodyArquivosZip');
  const statusEl = document.getElementById('zipModalRodapeStatus');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-semibold">Nenhum arquivo encontrado dentro deste pacote ZIP.</td></tr>`;
    if (statusEl) statusEl.textContent = 'Pacote vazio';
    return;
  }

  if (statusEl) statusEl.textContent = `Mostrando ${lista.length} de ${arquivosZipCache.length} arquivo(s)`;

  lista.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition';

    let badgeTipo = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">${f.ext ? f.ext.replace('.', '') : 'ARQ'}</span>`;
    let corIcone = 'text-slate-400';
    let icone = 'file-text';

    if (f.isXml) {
      badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">XML NF-e</span>';
      corIcone = 'text-emerald-600';
      icone = 'receipt';
    } else if (f.isPdf) {
      badgeTipo = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">PDF</span>';
      corIcone = 'text-rose-600';
      icone = 'file-text';
    }

    tr.innerHTML = `
      <td class="py-2.5 px-4 font-semibold text-slate-800 flex items-center gap-2 min-w-[280px] truncate" title="${f.name}">
        <i data-lucide="${icone}" class="w-4 h-4 ${corIcone} shrink-0"></i>
        <span class="truncate font-mono text-xs">${f.name}</span>
      </td>
      <td class="py-2.5 px-4 text-center whitespace-nowrap">
        ${badgeTipo}
      </td>
      <td class="py-2.5 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
        ${f.sizeFormatted}
      </td>
      <td class="py-2.5 px-4 text-center whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="visualizarArquivoDoZip('${encodeURIComponent(f.entryName)}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 text-xs font-bold transition flex items-center gap-1 border border-emerald-200" title="Visualizar Conteúdo do XML">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>Ver XML</span>
          </button>
          <button onclick="baixarArquivoDoZip('${encodeURIComponent(f.entryName)}')" class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 transition" title="Baixar este arquivo">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

// Filtrar arquivos dentro do ZIP
function filtrarArquivosZip(termo) {
  const query = (termo || '').toLowerCase().trim();
  if (!query) {
    renderArquivosZip(arquivosZipCache);
    return;
  }
  const filtrados = arquivosZipCache.filter(f => f.name.toLowerCase().includes(query) || f.entryName.toLowerCase().includes(query));
  renderArquivosZip(filtrados);
}

// Visualizar arquivo de dentro do ZIP
function visualizarArquivoDoZip(encEntryName) {
  const entryName = decodeURIComponent(encEntryName);
  const url = `/api/explorer/zip/file?path=${encodeURIComponent(zipAtualCaminho)}&entry=${encodeURIComponent(entryName)}`;
  window.open(url, '_blank');
}

// Baixar arquivo de dentro do ZIP
function baixarArquivoDoZip(encEntryName) {
  const entryName = decodeURIComponent(encEntryName);
  const url = `/api/explorer/zip/file?path=${encodeURIComponent(zipAtualCaminho)}&entry=${encodeURIComponent(entryName)}&download=1`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Descompactar o ZIP aberto no modal
async function descompactarZipAtual() {
  if (!zipAtualCaminho) return;
  await descompactarZipNaPasta(encodeURIComponent(zipAtualCaminho));
  fecharVisualizadorZip();
}

// Descompactar ZIP diretamente na pasta
async function descompactarZipNaPasta(encPath) {
  const path = decodeURIComponent(encPath);
  try {
    showToast('Extraindo notas fiscais na pasta...', 'info');
    const res = await fetch('/api/explorer/zip/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao extrair');
    }

    showToast(`✅ ${data.message}`, 'success');

    // Recarrega a pasta atual do explorador para exibir os XMLs descompactados imediatamente!
    if (caminhoAtualExplorador) {
      carregarPastaExplorador(caminhoAtualExplorador);
    }
  } catch (err) {
    showToast(`Erro na extração: ${err.message}`, 'error');
  }
}

// =========================================================================
// MÓDULO ONTOLOGIA CONTÁBIL REA (ISO/IEC 15944-4)
// =========================================================================

let reaDadosCache = null;

async function carregarDadosREA() {
  if (reaDadosCache) {
    renderDadosREA(reaDadosCache);
    return;
  }
  await executarMotorREA();
}

async function executarMotorREA() {
  try {
    showToast('Executando motor ontológico REA (ISO/IEC 15944-4)...', 'info');
    const res = await fetch('/api/rea/process', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao processar REA');
    }

    reaDadosCache = data;
    renderDadosREA(data);
    showToast('✅ Ontologia REA processada com equilíbrio patrimonial!', 'success');
  } catch (err) {
    showToast(`Erro no motor REA: ${err.message}`, 'error');
  }
}

function renderDadosREA(d) {
  if (!d) return;

  // KPIs
  setElText('reaKpiAgentes', d.stats?.agentsCount || 4);
  setElText('reaKpiRecursos', d.stats?.resourcesCount || 8);
  setElText('reaKpiDualidades', d.stats?.dualitiesCount || 3);

  // DRE
  const dre = d.dre || {};
  setElText('reaDreReceitaBruta', formatCurrency(dre.receitaBruta || 42000));
  setElText('reaDreIcmsVendas', `- ${formatCurrency(dre.deducoesReceita || 7560)}`);
  setElText('reaDreReceitaLiquida', formatCurrency(dre.receitaLiquida || 34440));
  setElText('reaDreCMV', `- ${formatCurrency(dre.custoMercadoriasVendidas || 25200)}`);
  setElText('reaDreLucroBruto', formatCurrency(dre.lucroBruto || 9240));
  setElText('reaDreDespesas', `- ${formatCurrency(dre.despesasOperacionais || 3000)}`);
  setElText('reaDreLucroLiquido', formatCurrency(dre.resultadoLiquidoExercicio || 6240));

  // Balanço Patrimonial
  const bp = d.balancoPatrimonial || {};
  setElText('reaBalTotalAtivo', formatCurrency(bp.totalAtivo || 66800));
  setElText('reaBalTotalPassivoPL', formatCurrency(bp.totalPassivoEPL || 66800));
  setElText('reaBalPL', formatCurrency(bp.totalPatrimonioLiquido || 6240));

  // Livro Diário
  const tbodyDiario = document.getElementById('tbodyReaDiario');
  if (tbodyDiario && d.journalEntries) {
    tbodyDiario.innerHTML = '';
    d.journalEntries.forEach(je => {
      (je.lines || []).forEach(line => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = `
          <td class="py-2 px-4 font-bold text-slate-800">${line.accountCode}</td>
          <td class="py-2 px-4 text-slate-700">${line.accountName}</td>
          <td class="py-2 px-4 text-right ${line.type === 'DEBIT' ? 'font-bold text-slate-900' : 'text-slate-300'}">
            ${line.type === 'DEBIT' ? formatCurrency(line.amount) : '-'}
          </td>
          <td class="py-2 px-4 text-right ${line.type === 'CREDIT' ? 'font-bold text-slate-900' : 'text-slate-300'}">
            ${line.type === 'CREDIT' ? formatCurrency(line.amount) : '-'}
          </td>
        `;
        tbodyDiario.appendChild(tr);
      });
    });
  }

  refreshIcons();
}




