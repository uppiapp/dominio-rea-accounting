/**
 * folha-app.js
 * Gerenciador da Central de Folha & eSocial (MC Hub Contábil)
 * Padrão Visual Monetra / MC Contábil
 */

document.addEventListener('DOMContentLoaded', () => {
    // Estado global da aplicação
    let state = {
        eventos: [],
        auditoriaDP: null,
        schemaFO: null,
        currentTab: 'folha'
    };

    // Elementos DOM
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnExportarExcel = document.getElementById('btnExportarExcel');
    const btnAtualizarAuditoria = document.getElementById('btnAtualizarAuditoria');
    
    // KPIs
    const kpiTrabalhadores = document.getElementById('kpiTrabalhadores');
    const kpiProventos = document.getElementById('kpiProventos');
    const kpiDescontos = document.getElementById('kpiDescontos');
    const kpiLiquido = document.getElementById('kpiLiquido');
    const kpiDCTFWeb = document.getElementById('kpiDCTFWeb');
    const kpiAdmissoesCount = document.getElementById('kpiAdmissoesCount');
    const kpiDemissoesCount = document.getElementById('kpiDemissoesCount');

    // Badges de Abas
    const countFolha = document.getElementById('countFolha');
    const countAdmissoes = document.getElementById('countAdmissoes');
    const countRescisoes = document.getElementById('countRescisoes');
    const infoFolhaCount = document.getElementById('infoFolhaCount');

    // Tabelas
    const tbodyFolha = document.getElementById('tbodyFolha');
    const tbodyAdmissoes = document.getElementById('tbodyAdmissoes');
    const tbodyRescisoes = document.getElementById('tbodyRescisoes');
    const tbodyContabil = document.getElementById('tbodyContabil');
    const tbodyAuditoriaDP = document.getElementById('tbodyAuditoriaDP');
    const containerSchema = document.getElementById('containerSchema');

    // Inicialização
    initTabs();
    initUpload();
    carregarEventosSalvos();
    carregarSchema();
    carregarAuditoriaDP();
    atualizarIcones();

    function atualizarIcones() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // ==========================================
    // NAVEGAÇÃO ENTRE ABAS ESTILO MONETRA
    // ==========================================
    function initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                state.currentTab = targetTab;

                // Alternar classe .active das pílulas Monetra
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Esconder todos os conteúdos e exibir o alvo
                document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
                const activePane = document.getElementById(`tabContent-${targetTab}`);
                if (activePane) activePane.classList.remove('hidden');

                // Recarrega auditoria se necessário
                if (targetTab === 'auditoria' && !state.auditoriaDP) {
                    carregarAuditoriaDP();
                }

                atualizarIcones();
            });
        });
    }

    // ==========================================
    // UPLOAD E PROCESSAMENTO DE ARQUIVOS
    // ==========================================
    function initUpload() {
        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        });

        fileInput.addEventListener('change', () => {
            handleFiles(fileInput.files);
        });

        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        if (btnLimpar) {
            btnLimpar.addEventListener('click', async () => {
                if (confirm('Deseja realmente limpar todos os eventos de folha processados?')) {
                    try {
                        await fetch('/api/folha', { method: 'DELETE' });
                        state.eventos = [];
                        atualizarInterface();
                    } catch (err) {
                        alert('Erro ao limpar dados: ' + err.message);
                    }
                }
            });
        }

        if (btnAtualizarAuditoria) {
            btnAtualizarAuditoria.addEventListener('click', () => {
                carregarAuditoriaDP();
            });
        }

        if (btnExportarExcel) {
            btnExportarExcel.addEventListener('click', () => {
                exportarCSV();
            });
        }
    }

    async function handleFiles(files) {
        if (!files || files.length === 0) return;

        const xmlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'));
        if (xmlFiles.length === 0) {
            alert('Por favor, selecione arquivos com extensão .xml (eSocial).');
            return;
        }

        const formData = new FormData();
        xmlFiles.forEach(f => formData.append('xmlFiles', f));

        // Feedback visual elegante estilo Monetra
        dropZone.classList.add('opacity-60', 'pointer-events-none');
        const oldHtml = dropZone.innerHTML;
        dropZone.innerHTML = `
            <div class="py-6 text-center">
                <div class="w-12 h-12 mx-auto rounded-2xl bg-lime-100 text-lime-700 flex items-center justify-center mb-3 animate-spin">
                    <i data-lucide="refresh-cw" class="w-6 h-6 text-[#65A30D]"></i>
                </div>
                <div class="text-sm font-extrabold text-slate-900">Processando ${xmlFiles.length} evento(s) do eSocial...</div>
                <div class="text-xs text-slate-500 mt-1">Extraindo remunerações, empregados e lançamentos contábeis</div>
            </div>
        `;
        atualizarIcones();

        try {
            const resp = await fetch('/api/folha/processar', {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();

            if (data.success) {
                const novos = data.eventos || [];
                state.eventos = [...novos, ...state.eventos];
                atualizarInterface();
            } else {
                alert('Erro ao processar: ' + (data.error || 'Falha desconhecida'));
            }
        } catch (err) {
            alert('Erro de conexão com o servidor: ' + err.message);
        } finally {
            dropZone.classList.remove('opacity-60', 'pointer-events-none');
            dropZone.innerHTML = oldHtml;
            fileInput.value = '';
            atualizarIcones();
        }
    }

    // ==========================================
    // CARGA DE DADOS DA API
    // ==========================================
    async function carregarEventosSalvos() {
        try {
            const resp = await fetch('/api/folha');
            const data = await resp.json();
            if (data.success && Array.isArray(data.eventos)) {
                state.eventos = data.eventos;
                atualizarInterface();
            }
        } catch (e) {
            console.error('Erro ao carregar eventos:', e);
        }
    }

    async function carregarSchema() {
        try {
            const resp = await fetch('/api/folha/schema');
            const data = await resp.json();
            if (data.success && data.schema) {
                state.schemaFO = data.schema;
                renderSchema(data.schema);
            }
        } catch (e) {
            console.error('Erro ao carregar schema FO:', e);
        }
    }

    async function carregarAuditoriaDP() {
        if (!tbodyAuditoriaDP) return;
        tbodyAuditoriaDP.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-slate-400">
                    <span class="inline-block animate-spin mr-2">&#9696;</span> Auditando pastas de Departamento Pessoal em \\\\192.168.15.2\\mc assessoria contabil...
                </td>
            </tr>
        `;

        try {
            const resp = await fetch('/api/folha/auditoria-pastas');
            const data = await resp.json();
            if (data.success) {
                state.auditoriaDP = data;
                renderAuditoriaDP(data.empresas || []);
            }
        } catch (e) {
            tbodyAuditoriaDP.innerHTML = `
                <tr><td colspan="7" class="px-6 py-6 text-center text-rose-500">Erro ao carregar auditoria: ${e.message}</td></tr>
            `;
        }
    }

    // ==========================================
    // ATUALIZAÇÃO DA INTERFACE E RENDERIZAÇÃO
    // ==========================================
    function atualizarInterface() {
        const eventos = state.eventos || [];
        
        const s1200List = eventos.filter(r => r.evento === 'S-1200');
        const s2200List = eventos.filter(r => r.evento === 'S-2200');
        const s2299List = eventos.filter(r => r.evento === 'S-2299');
        const totalizacoes = eventos.filter(r => r.evento === 'S-5001' || r.evento === 'S-5011');

        // Atualizar Contadores de Abas
        if (countFolha) countFolha.textContent = s1200List.length;
        if (countAdmissoes) countAdmissoes.textContent = s2200List.length;
        if (countRescisoes) countRescisoes.textContent = s2299List.length;
        if (infoFolhaCount) infoFolhaCount.textContent = `${s1200List.length} registro(s)`;

        // Calcular Totais
        const totalProventos = s1200List.reduce((s, r) => s + (r.detalhes?.totalProventos || 0), 0);
        const totalDescontos = s1200List.reduce((s, r) => s + (r.detalhes?.totalDescontos || 0), 0);
        const totalLiquido = s1200List.reduce((s, r) => s + (r.detalhes?.valorLiquido || 0), 0);
        const totalDCTFWeb = totalizacoes.reduce((s, r) => s + (r.detalhes?.totalDCTFWeb || 0), 0);

        // Atualizar KPIs
        if (kpiTrabalhadores) kpiTrabalhadores.textContent = s1200List.length;
        if (kpiProventos) kpiProventos.textContent = formatMoeda(totalProventos);
        if (kpiDescontos) kpiDescontos.textContent = formatMoeda(totalDescontos);
        if (kpiLiquido) kpiLiquido.textContent = formatMoeda(totalLiquido);
        if (kpiDCTFWeb) kpiDCTFWeb.textContent = formatMoeda(totalDCTFWeb);
        if (kpiAdmissoesCount) kpiAdmissoesCount.textContent = `${s2200List.length} admissões`;
        if (kpiDemissoesCount) kpiDemissoesCount.textContent = `${s2299List.length} demissões`;

        // Renderizar Tabelas
        renderTabelaFolha(s1200List);
        renderTabelaAdmissoes(s2200List);
        renderTabelaRescisoes(s2299List);
        renderTabelaContabil(s1200List);
        atualizarIcones();
    }

    function renderTabelaFolha(lista) {
        if (!tbodyFolha) return;
        if (lista.length === 0) {
            tbodyFolha.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400">Nenhum evento de remuneração (S-1200) carregado ainda. Arraste arquivos XML acima.</td></tr>`;
            return;
        }

        tbodyFolha.innerHTML = lista.map(ev => {
            const det = ev.detalhes || {};
            const rubricasHtml = (det.rubricas || []).map(r => `
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono-code mr-1 mb-1 ${r.tipo === 'Provento' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'}">
                    ${r.codigo} - ${r.desc}: ${r.valorFormatado}
                </span>
            `).join('') || '<span class="text-xs text-slate-400">Sem rubricas</span>';

            return `
                <tr class="hover:bg-slate-50/70 transition">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                            ${ev.evento}
                        </span>
                        <div class="text-[11px] text-slate-400 mt-0.5 font-mono-code font-bold">${ev.competencia || 'Comp. Atual'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="font-extrabold text-slate-900 font-mono-code text-xs">${ev.trabalhador?.cpfFormatado || 'CPF Não Identificado'}</div>
                        <div class="text-[11px] text-slate-400 font-mono-code">Empregador: ${ev.empregador?.inscricaoFormatada || ''}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right font-mono-code font-bold text-emerald-600">
                        ${det.totalProventosFormatado || 'R$ 0,00'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right font-mono-code font-bold text-rose-600">
                        ${det.totalDescontosFormatado || 'R$ 0,00'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right font-mono-code font-extrabold text-slate-900">
                        ${det.valorLiquidoFormatado || 'R$ 0,00'}
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex flex-wrap max-w-lg">
                            ${rubricasHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderTabelaAdmissoes(lista) {
        if (!tbodyAdmissoes) return;
        if (lista.length === 0) {
            tbodyAdmissoes.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-400">Nenhuma admissão (S-2200) carregada ainda.</td></tr>`;
            return;
        }

        tbodyAdmissoes.innerHTML = lista.map(ev => {
            const det = ev.detalhes || {};
            return `
                <tr class="hover:bg-slate-50/70 transition">
                    <td class="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                        ${det.nome || 'Não informado'}
                    </td>
                    <td class="px-6 py-4 font-mono-code text-slate-600 whitespace-nowrap text-xs">
                        ${ev.trabalhador?.cpfFormatado || ''}
                    </td>
                    <td class="px-6 py-4 font-mono-code text-slate-400 whitespace-nowrap text-xs">
                        ${det.matricula || '-'}
                    </td>
                    <td class="px-6 py-4 text-slate-600 whitespace-nowrap text-xs font-mono-code">
                        ${det.dataAdmissao || '-'}
                    </td>
                    <td class="px-6 py-4 text-slate-700">
                        <div class="font-bold text-xs">${det.cargo || '-'}</div>
                        <div class="text-[11px] text-slate-400 font-mono-code">CBO: ${det.cbo || '-'}</div>
                    </td>
                    <td class="px-6 py-4 text-right font-mono-code font-extrabold text-emerald-600 whitespace-nowrap">
                        ${det.salarioFormatado || 'R$ 0,00'}
                    </td>
                    <td class="px-6 py-4 text-xs whitespace-nowrap">
                        <span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">${det.tipoContrato || 'Indeterminado'}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderTabelaRescisoes(lista) {
        if (!tbodyRescisoes) return;
        if (lista.length === 0) {
            tbodyRescisoes.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400">Nenhuma rescisão (S-2299) carregada ainda.</td></tr>`;
            return;
        }

        tbodyRescisoes.innerHTML = lista.map(ev => {
            const det = ev.detalhes || {};
            return `
                <tr class="hover:bg-slate-50/70 transition">
                    <td class="px-6 py-4 font-mono-code text-slate-900 whitespace-nowrap font-bold text-xs">
                        ${ev.trabalhador?.cpfFormatado || ''}
                    </td>
                    <td class="px-6 py-4 text-slate-600 whitespace-nowrap text-xs font-mono-code">
                        ${det.dataDesligamento || '-'}
                    </td>
                    <td class="px-6 py-4 text-rose-700 font-bold text-xs">
                        ${det.motivoDescricao || '-'}
                    </td>
                    <td class="px-6 py-4 text-xs font-mono-code text-slate-400">
                        ${ev.fileName || '-'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderTabelaContabil(lista) {
        if (!tbodyContabil) return;
        const todasPartidas = [];
        lista.forEach(ev => {
            (ev.contabilizacao || []).forEach(p => todasPartidas.push(p));
        });

        if (todasPartidas.length === 0) {
            tbodyContabil.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 font-sans">Carregue eventos de folha para gerar as partidas dobradas contábeis.</td></tr>`;
            return;
        }

        tbodyContabil.innerHTML = todasPartidas.map(p => `
            <tr class="hover:bg-slate-50/70 transition text-xs font-mono-code">
                <td class="px-6 py-3 whitespace-nowrap text-slate-600">${p.data}</td>
                <td class="px-6 py-3 whitespace-nowrap">
                    <span class="text-blue-600 font-extrabold">${p.contaDebito}</span>
                    <div class="text-[11px] text-slate-400 font-sans">${p.descDebito}</div>
                </td>
                <td class="px-6 py-3 whitespace-nowrap">
                    <span class="text-emerald-600 font-extrabold">${p.contaCredito}</span>
                    <div class="text-[11px] text-slate-400 font-sans">${p.descCredito}</div>
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-right font-extrabold text-slate-900">${p.valorFormatado}</td>
                <td class="px-6 py-3 text-slate-600 font-sans text-xs">${p.historico}</td>
            </tr>
        `).join('');
    }

    function renderAuditoriaDP(empresas) {
        if (!tbodyAuditoriaDP) return;
        if (empresas.length === 0) {
            tbodyAuditoriaDP.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400">Nenhuma empresa encontrada com status ativo.</td></tr>`;
            return;
        }

        tbodyAuditoriaDP.innerHTML = empresas.map(emp => {
            const badgeIcon = (ok) => ok 
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">SIM</span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">FALTA</span>`;

            let badgeConf = '';
            if (emp.conformidadeDP === 100) {
                badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">100% Completa</span>`;
            } else if (emp.conformidadeDP >= 50) {
                badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${emp.conformidadeDP}% Parcial</span>`;
            } else {
                badgeConf = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">${emp.conformidadeDP}% Pendente</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/70 transition text-xs">
                    <td class="px-6 py-3 font-bold text-slate-900">
                        <div>${emp.nome}</div>
                        <div class="text-[11px] text-slate-400 font-normal">${emp.razao}</div>
                    </td>
                    <td class="px-6 py-3 whitespace-nowrap text-slate-500 font-medium">
                        ${emp.regime}
                    </td>
                    <td class="px-6 py-3 whitespace-nowrap text-center">${badgeIcon(emp.hasFolha)}</td>
                    <td class="px-6 py-3 whitespace-nowrap text-center">${badgeIcon(emp.hasAdmissoes)}</td>
                    <td class="px-6 py-3 whitespace-nowrap text-center">${badgeIcon(emp.hasRescisoes)}</td>
                    <td class="px-6 py-3 whitespace-nowrap text-center">${badgeIcon(emp.hasDeclaracoes)}</td>
                    <td class="px-6 py-3 whitespace-nowrap text-center">${badgeConf}</td>
                </tr>
            `;
        }).join('');
    }

    function renderSchema(schema) {
        if (!containerSchema) return;
        const cats = schema.categorias || {};
        const html = Object.entries(cats).map(([cat, tables]) => `
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

        containerSchema.innerHTML = html;
    }

    function formatMoeda(val) {
        return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function exportarCSV() {
        const s1200List = state.eventos.filter(r => r.evento === 'S-1200');
        if (s1200List.length === 0) {
            alert('Não há eventos de folha para exportar.');
            return;
        }

        let csv = 'Evento;Competencia;CPF;Empregador;Total_Proventos;Total_Descontos;Valor_Liquido\n';
        s1200List.forEach(ev => {
            const det = ev.detalhes || {};
            csv += `${ev.evento};${ev.competencia};${ev.trabalhador?.cpf || ''};${ev.empregador?.inscricao || ''};${det.totalProventos || 0};${det.totalDescontos || 0};${det.valorLiquido || 0}\n`;
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `folha_esocial_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
});
