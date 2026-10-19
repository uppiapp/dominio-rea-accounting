/**
 * MC Hub Contábil - NF-e Processor App
 * Frontend Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadProgress = document.getElementById('upload-progress');
    const dropContent = document.getElementById('drop-content');
    
    const dashboardCards = document.getElementById('dashboard-cards');
    const tableContainer = document.getElementById('table-container');
    const notasTbody = document.getElementById('notas-tbody');
    const searchInput = document.getElementById('search-input');
    const emptyState = document.getElementById('empty-state');
    
    const btnClear = document.getElementById('btn-clear');
    const btnExport = document.getElementById('btn-export');
    
    // Modal Elements
    const modal = document.getElementById('detail-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const overlayModal = modal.querySelector('.modal-overlay');

    // --- State ---
    let processadas = [];
    let resumoGlobal = {
        total: 0,
        valorTotal: 0,
        totalICMS: 0,
        totalPIS: 0,
        totalCOFINS: 0,
        entradas: 0,
        saidas: 0
    };

    // --- Formatters ---
    const formatCurrency = (value) => {
        if (!value && value !== 0) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        try {
            // Se for string ISO
            if (dateString.includes('T')) {
                const d = new Date(dateString);
                return new Intl.DateTimeFormat('pt-BR').format(d);
            }
            // Retorno as is ou tenta converter YYYY-MM-DD
            const parts = dateString.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dateString;
        } catch(e) {
            return dateString;
        }
    };

    const formatCNPJ = (cnpj) => {
        if (!cnpj) return '-';
        const str = String(cnpj).replace(/\D/g, '');
        if (str.length === 14) {
            return str.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
        }
        if (str.length === 11) {
            return str.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        }
        return cnpj;
    };

    // --- Init ---
    loadFromLocalStorage();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    // --- Drag & Drop Handlers ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-active');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    // --- File Processing ---
    async function handleFiles(files) {
        const xmlFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.xml'));
        
        if (xmlFiles.length === 0) {
            showToast('Nenhum arquivo XML válido selecionado.', 'warning');
            return;
        }

        // UI State: Uploading
        dropContent.classList.add('hidden');
        uploadProgress.classList.remove('hidden');
        uploadProgress.classList.add('flex');
        document.getElementById('progress-text').textContent = `Enviando ${xmlFiles.length} arquivo(s)...`;

        const formData = new FormData();
        xmlFiles.forEach(file => {
            formData.append('xmlFiles', file);
        });

        try {
            // Chamada ao backend
            const response = await fetch('/api/notas/processar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Atualiza state
                if (data.notas && data.notas.length > 0) {
                    processadas = [...data.notas, ...processadas]; // Novos primeiro
                    
                    // Atualiza resumo
                    if (data.resumo) {
                        resumoGlobal.total += data.resumo.total || 0;
                        resumoGlobal.valorTotal += data.resumo.valorTotal || 0;
                        resumoGlobal.totalICMS += data.resumo.totalICMS || 0;
                        resumoGlobal.totalPIS += data.resumo.totalPIS || 0;
                        resumoGlobal.totalCOFINS += data.resumo.totalCOFINS || 0;
                        resumoGlobal.entradas += data.resumo.entradas || 0;
                        resumoGlobal.saidas += data.resumo.saidas || 0;
                    }

                    saveToLocalStorage();
                    renderDashboard();
                    renderTable();
                    showToast(`${data.notas.length} notas processadas com sucesso!`, 'success');
                } else {
                    showToast('Arquivos processados, mas nenhuma nota válida encontrada.', 'warning');
                }
            } else {
                showToast(`Erro ao processar: ${data.message || 'Erro desconhecido'}`, 'error');
            }
        } catch (error) {
            console.error("Erro na requisição:", error);
            
            // Tratamento caso o backend não exista ainda para o mock
            showToast('Simulando processamento... (Backend não respondeu)', 'info');
            simulateProcessing(xmlFiles);
            
        } finally {
            // Restore UI
            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                uploadProgress.classList.remove('flex');
                dropContent.classList.remove('hidden');
                fileInput.value = ''; // Reset input
            }, 500);
        }
    }

    // Função de simulação para quando o backend real não estiver pronto
    function simulateProcessing(files) {
        const mockNotas = [];
        let r_valorTotal = 0, r_icms = 0, r_pis = 0, r_cofins = 0, r_entradas = 0, r_saidas = 0;

        files.forEach((f, index) => {
            const isEntrada = Math.random() > 0.5;
            const valor = Math.random() * 5000 + 100;
            const icms = valor * 0.18;
            const pis = valor * 0.0165;
            const cofins = valor * 0.076;

            r_valorTotal += valor;
            r_icms += icms;
            r_pis += pis;
            r_cofins += cofins;
            if(isEntrada) r_entradas++; else r_saidas++;

            const tipo = f.name.toLowerCase().includes('cte') ? 'CTe' : (f.name.toLowerCase().includes('nfse') ? 'NFSe' : 'NFe');

            mockNotas.push({
                id: Date.now() + index,
                chave: `352109000000000000005500100000${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
                numero: Math.floor(Math.random() * 100000).toString(),
                tipo: tipo,
                dataEmissao: new Date().toISOString(),
                naturezaOperacao: isEntrada ? 'Compra para Comercialização' : 'Venda de Mercadorias',
                emitente: {
                    nome: isEntrada ? `Fornecedor ${index+1} LTDA` : 'MC Assessoria Cliente',
                    cnpj: '11222333000199'
                },
                destinatario: {
                    nome: isEntrada ? 'MC Assessoria Cliente' : `Cliente Destino ${index+1} SA`,
                    cnpj: '44555666000188'
                },
                valores: {
                    total: valor,
                    baseIcms: valor * 0.8,
                    icms: icms,
                    pis: pis,
                    cofins: cofins
                },
                produtos: [
                    { nome: 'Produto de Teste A', ncm: '85171231', cfop: isEntrada ? '1102' : '5102', qtd: 2, vUnit: valor * 0.3, vTotal: valor * 0.6 },
                    { nome: 'Serviço/Produto B', ncm: '00000000', cfop: isEntrada ? '1933' : '5933', qtd: 1, vUnit: valor * 0.4, vTotal: valor * 0.4 }
                ],
                tipoOperacao: isEntrada ? 'E' : 'S'
            });
        });

        processadas = [...mockNotas, ...processadas];
        resumoGlobal.total += mockNotas.length;
        resumoGlobal.valorTotal += r_valorTotal;
        resumoGlobal.totalICMS += r_icms;
        resumoGlobal.totalPIS += r_pis;
        resumoGlobal.totalCOFINS += r_cofins;
        resumoGlobal.entradas += r_entradas;
        resumoGlobal.saidas += r_saidas;

        saveToLocalStorage();
        renderDashboard();
        renderTable();
    }


    // --- Rendering ---
    function renderDashboard() {
        if (processadas.length === 0) {
            dashboardCards.classList.add('hidden');
            tableContainer.classList.add('hidden');
            btnExport.disabled = true;
            return;
        }

        dashboardCards.classList.remove('hidden');
        tableContainer.classList.remove('hidden');
        btnExport.disabled = false;

        document.getElementById('card-total-notas').textContent = resumoGlobal.total;
        document.getElementById('card-valor-total').textContent = formatCurrency(resumoGlobal.valorTotal);
        document.getElementById('card-total-icms').textContent = formatCurrency(resumoGlobal.totalICMS);
        document.getElementById('card-total-piscofins').textContent = formatCurrency(resumoGlobal.totalPIS + resumoGlobal.totalCOFINS);
        document.getElementById('card-entradas').textContent = resumoGlobal.entradas;
        document.getElementById('card-saidas').textContent = resumoGlobal.saidas;
    }

    function renderTable(filterText = '') {
        notasTbody.innerHTML = '';
        
        const filtered = processadas.filter(nota => {
            if(!filterText) return true;
            const term = filterText.toLowerCase();
            return (
                (nota.numero && nota.numero.toLowerCase().includes(term)) ||
                (nota.emitente && nota.emitente.nome && nota.emitente.nome.toLowerCase().includes(term)) ||
                (nota.destinatario && nota.destinatario.nome && nota.destinatario.nome.toLowerCase().includes(term)) ||
                (nota.chave && nota.chave.toLowerCase().includes(term))
            );
        });

        if (filtered.length === 0) {
            notasTbody.parentElement.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        notasTbody.parentElement.classList.remove('hidden');
        emptyState.classList.add('hidden');

        filtered.forEach(nota => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-smooth cursor-pointer';
            tr.onclick = () => openModal(nota);

            // Badge color based on type (Monetra Style)
            let badgeClass = 'bg-blue-100 text-blue-800';
            let tipoTxt = nota.tipo || 'NFe';
            if (tipoTxt.toUpperCase() === 'NFSE') badgeClass = 'bg-purple-100 text-purple-800';
            if (tipoTxt.toUpperCase() === 'CTE') badgeClass = 'bg-amber-100 text-amber-800';

            const valorFormatado = nota.valores ? formatCurrency(nota.valores.total) : 'R$ 0,00';
            const emitNome = nota.emitente ? nota.emitente.nome : '-';
            const destNome = nota.destinatario ? nota.destinatario.nome : '-';
            const dataEmis = formatDate(nota.dataEmissao);

            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-0.5 inline-flex text-[11px] leading-5 font-bold rounded-full ${badgeClass}">
                            ${tipoTxt}
                        </span>
                        <span class="text-xs font-bold text-slate-900 font-mono-code">#${nota.numero || '-'}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-mono-code">
                    ${dataEmis}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-medium">
                    <div class="truncate max-w-[170px]" title="${emitNome}">${emitNome}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-medium">
                    <div class="truncate max-w-[170px]" title="${destNome}">${destNome}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-emerald-600 text-right font-mono-code">
                    ${valorFormatado}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                        Processada
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-xs">
                    <button class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    </button>
                </td>
            `;
            notasTbody.appendChild(tr);
        });

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // --- Modal Logic ---
    function openModal(nota) {
        // Setup header
        const badge = document.getElementById('modal-tipo-badge');
        let tipoTxt = nota.tipo || 'NFe';
        badge.textContent = tipoTxt;
        if (tipoTxt.toUpperCase() === 'NFSE') badge.className = 'px-2.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400';
        else if (tipoTxt.toUpperCase() === 'CTE') badge.className = 'px-2.5 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400';
        else badge.className = 'px-2.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400';

        document.getElementById('modal-title').textContent = `Nota Fiscal Nº ${nota.numero || '-'}`;
        document.getElementById('modal-chave').textContent = (nota.chave || '').replace(/(\d{4})/g, '$1 ').trim();

        // Emitente/Dest
        document.getElementById('modal-emit-nome').textContent = nota.emitente?.nome || '-';
        document.getElementById('modal-emit-cnpj').textContent = formatCNPJ(nota.emitente?.cnpj);
        document.getElementById('modal-dest-nome').textContent = nota.destinatario?.nome || '-';
        document.getElementById('modal-dest-cnpj').textContent = formatCNPJ(nota.destinatario?.cnpj);

        // Info gerais
        document.getElementById('modal-valor-total').textContent = nota.valores ? formatCurrency(nota.valores.total) : 'R$ 0,00';
        document.getElementById('modal-data').textContent = formatDate(nota.dataEmissao);
        document.getElementById('modal-natureza').textContent = nota.naturezaOperacao || '-';

        // Impostos
        const val = nota.valores || {};
        document.getElementById('modal-bc-icms').textContent = formatCurrency(val.baseIcms || 0);
        document.getElementById('modal-v-icms').textContent = formatCurrency(val.icms || 0);
        document.getElementById('modal-v-pis').textContent = formatCurrency(val.pis || 0);
        document.getElementById('modal-v-cofins').textContent = formatCurrency(val.cofins || 0);

        // Lançamentos
        const lancTbody = document.getElementById('modal-lancamentos');
        lancTbody.innerHTML = '';
        
        // Gera lançamento sugerido (simplificado para demonstração)
        const isEntrada = nota.tipoOperacao === 'E';
        const valorTotal = val.total || 0;
        
        const lancamentos = isEntrada ? [
            { tipo: 'D', conta: 'Estoque / Despesa', hist: `Vlr. ref. NFe ${nota.numero}`, valor: valorTotal },
            { tipo: 'C', conta: 'Fornecedores a Pagar', hist: `Vlr. ref. NFe ${nota.numero}`, valor: valorTotal }
        ] : [
            { tipo: 'D', conta: 'Clientes / Contas a Receber', hist: `Vlr. ref. NFe ${nota.numero}`, valor: valorTotal },
            { tipo: 'C', conta: 'Receita de Vendas', hist: `Vlr. ref. NFe ${nota.numero}`, valor: valorTotal }
        ];

        lancamentos.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-2.5 whitespace-nowrap text-xs font-extrabold ${l.tipo === 'D' ? 'text-blue-600' : 'text-emerald-600'}">${l.tipo}</td>
                <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-800 font-bold">${l.conta}</td>
                <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 font-sans">${l.hist}</td>
                <td class="px-4 py-2.5 whitespace-nowrap text-xs font-extrabold text-right text-slate-900">${formatCurrency(l.valor)}</td>
            `;
            lancTbody.appendChild(tr);
        });

        // Produtos
        const prodTbody = document.getElementById('modal-produtos');
        prodTbody.innerHTML = '';
        if(nota.produtos && nota.produtos.length > 0) {
            nota.produtos.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="px-4 py-2.5 text-xs text-slate-800 font-medium"><div class="truncate max-w-[220px]" title="${p.nome}">${p.nome}</div></td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 font-mono-code">${p.ncm || '-'}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 font-mono-code">${p.cfop || '-'}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-700 font-mono-code text-right">${p.qtd || 1}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-700 font-mono-code text-right">${formatCurrency(p.vUnit)}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-emerald-600 font-extrabold font-mono-code text-right">${formatCurrency(p.vTotal)}</td>
                `;
                prodTbody.appendChild(tr);
            });
        } else {
            prodTbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-xs text-slate-400">Nenhum item detalhado</td></tr>`;
        }

        // Show modal
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    btnCloseModal.addEventListener('click', closeModal);
    overlayModal.addEventListener('click', closeModal);

    // --- Actions ---
    btnClear.addEventListener('click', () => {
        if(confirm('Tem certeza que deseja limpar todas as notas processadas?')) {
            processadas = [];
            resumoGlobal = { total: 0, valorTotal: 0, totalICMS: 0, totalPIS: 0, totalCOFINS: 0, entradas: 0, saidas: 0 };
            saveToLocalStorage();
            renderDashboard();
            renderTable();
            showToast('Dados limpos com sucesso.', 'info');
        }
    });

    searchInput.addEventListener('input', (e) => {
        renderTable(e.target.value);
    });

    btnExport.addEventListener('click', () => {
        // Exportação simplificada para CSV no client-side como fallback, 
        // ou direcionar para a API.
        try {
            if(processadas.length === 0) return;
            
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Tipo,Numero,Data,Emitente_CNPJ,Emitente_Nome,Destinatario_CNPJ,Destinatario_Nome,Valor_Total,ICMS,PIS,COFINS,Chave\n";
            
            processadas.forEach(n => {
                const row = [
                    n.tipo,
                    n.numero,
                    formatDate(n.dataEmissao),
                    n.emitente?.cnpj,
                    `"${n.emitente?.nome || ''}"`,
                    n.destinatario?.cnpj,
                    `"${n.destinatario?.nome || ''}"`,
                    n.valores?.total,
                    n.valores?.icms,
                    n.valores?.pis,
                    n.valores?.cofins,
                    n.chave
                ].join(",");
                csvContent += row + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `notas_exportadas_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Exportação concluída', 'success');
        } catch(e) {
            showToast('Erro ao exportar', 'error');
        }
    });

    // --- Persistência Local ---
    function saveToLocalStorage() {
        try {
            localStorage.setItem('mchub_notas', JSON.stringify(processadas));
            localStorage.setItem('mchub_resumo', JSON.stringify(resumoGlobal));
        } catch(e) {
            console.error('Local Storage quota exceeded');
        }
    }

    function loadFromLocalStorage() {
        const savedNotas = localStorage.getItem('mchub_notas');
        const savedResumo = localStorage.getItem('mchub_resumo');
        
        if (savedNotas && savedResumo) {
            try {
                processadas = JSON.parse(savedNotas);
                resumoGlobal = JSON.parse(savedResumo);
                renderDashboard();
                renderTable();
            } catch(e) {
                console.error("Erro ao carregar do localStorage", e);
            }
        }
    }

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        
        let bgColor = 'bg-gray-800';
        let iconHtml = '';
        let borderColor = 'border-blue-500';

        if (type === 'success') {
            borderColor = 'border-emerald-500';
            iconHtml = `<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        } else if (type === 'error') {
            borderColor = 'border-red-500';
            iconHtml = `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        } else if (type === 'warning') {
            borderColor = 'border-amber-500';
            iconHtml = `<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        } else {
            iconHtml = `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        }

        toast.className = `flex items-center gap-3 p-4 rounded-lg shadow-lg ${bgColor} border-l-4 ${borderColor} text-white transform transition-all duration-300 translate-y-10 opacity-0`;
        
        toast.innerHTML = `
            ${iconHtml}
            <span class="text-sm font-medium">${message}</span>
            <button class="ml-auto text-gray-400 hover:text-white" onclick="this.parentElement.remove()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        }, 5000);
    }
});
