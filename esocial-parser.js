/**
 * esocial-parser.js
 * Motor de Análise e Extração de Eventos do eSocial & Módulo de Folha do Domínio Sistemas
 * Suporte a eventos S-1200, S-1210, S-2200, S-2299, S-1299, S-5001, S-5011
 */

const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => {
    // Garantir que itens repetitivos sejam sempre arrays
    const arrayTags = ['item', 'rubrica', 'dmDev', 'ideEstabLot', 'remunPerApur', 'itensRemun', 'infoPgto', 'tpDeslig'];
    return arrayTags.includes(name);
  }
});

// Helper para formatar CPF e CNPJ
function formatDoc(doc) {
  if (!doc) return '';
  const clean = String(doc).replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return doc;
}

// Helper para formatar moeda
function formatMoney(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Identifica o tipo do evento do eSocial e parseia seus dados
 */
function parseEsocialXML(xmlContent, fileName = '') {
  try {
    const parsed = xmlParser.parse(xmlContent);
    const esocialRoot = parsed.eSocial || parsed['esocial:eSocial'] || parsed;
    
    // Identificar a tag do evento
    const possibleEvents = [
      { tag: 'evtRemun', code: 'S-1200', name: 'Remuneração de Trabalhador' },
      { tag: 'evtPgtos', code: 'S-1210', name: 'Pagamento de Rendimentos' },
      { tag: 'evtAdmissao', code: 'S-2200', name: 'Cadastramento Inicial / Admissão' },
      { tag: 'evtDeslig', code: 'S-2299', name: 'Desligamento / Rescisão' },
      { tag: 'evtFechaEvPer', code: 'S-1299', name: 'Fechamento de Eventos Periódicos' },
      { tag: 'evtBasesTrab', code: 'S-5001', name: 'Bases e Tributos da Folha (Individual)' },
      { tag: 'evtCS', code: 'S-5011', name: 'Informações das Contribuições Sociais (Totalizador)' },
      { tag: 'evtBasesFGTS', code: 'S-5003', name: 'Bases de Cálculo do FGTS' }
    ];

    let eventTag = null;
    let eventInfo = null;

    for (const ev of possibleEvents) {
      if (esocialRoot[ev.tag]) {
        eventTag = ev.tag;
        eventInfo = ev;
        break;
      }
    }

    if (!eventTag) {
      // Tentar encontrar qualquer tag interna que comece com evt
      const keys = Object.keys(esocialRoot);
      const matchEvt = keys.find(k => k.startsWith('evt'));
      if (matchEvt) {
        eventTag = matchEvt;
        eventInfo = { tag: matchEvt, code: matchEvt.toUpperCase(), name: 'Evento eSocial ' + matchEvt };
      } else {
        return {
          success: false,
          error: 'Formato XML do eSocial não reconhecido',
          fileName
        };
      }
    }

    const evtData = esocialRoot[eventTag];
    const ideEmpregador = evtData.ideEmpregador || {};
    const ideEvento = evtData.ideEvento || {};
    const ideTrabalhador = evtData.ideTrabalhador || {};

    const baseResult = {
      success: true,
      fileName,
      evento: eventInfo.code,
      eventoNome: eventInfo.name,
      competencia: ideEvento.perApur || ideEvento.dtApur || '',
      empregador: {
        tipo: ideEmpregador.tpInsc === 1 ? 'CNPJ' : 'CPF',
        inscricao: ideEmpregador.nrInsc,
        inscricaoFormatada: formatDoc(ideEmpregador.nrInsc)
      },
      trabalhador: {
        cpf: ideTrabalhador.cpfTrab || '',
        cpfFormatado: formatDoc(ideTrabalhador.cpfTrab || ''),
        nis: ideTrabalhador.nisTrab || ''
      },
      detalhes: {},
      contabilizacao: []
    };

    // Processamento específico por tipo de evento
    switch (eventInfo.code) {
      case 'S-1200':
        processS1200(evtData, baseResult);
        break;
      case 'S-1210':
        processS1210(evtData, baseResult);
        break;
      case 'S-2200':
        processS2200(evtData, baseResult);
        break;
      case 'S-2299':
        processS2299(evtData, baseResult);
        break;
      case 'S-5001':
      case 'S-5011':
        processTotalizadores(evtData, baseResult);
        break;
      default:
        baseResult.detalhes = { raw: 'Evento ' + eventInfo.code + ' processado com sucesso.' };
    }

    return baseResult;
  } catch (err) {
    return {
      success: false,
      error: 'Falha ao processar XML: ' + err.message,
      fileName
    };
  }
}

/**
 * Processa S-1200: Remuneração Mensal de Trabalhador
 */
function processS1200(evtData, result) {
  let totalProventos = 0;
  let totalDescontos = 0;
  const rubricas = [];

  const dmDevList = evtData.dmDev || [];
  const listToIterate = Array.isArray(dmDevList) ? dmDevList : [dmDevList];

  listToIterate.forEach(dm => {
    if (!dm) return;
    const infoPerApur = dm.infoPerApur || dm;
    const ideEstabLotList = infoPerApur.ideEstabLot || [];
    const estabs = Array.isArray(ideEstabLotList) ? ideEstabLotList : [ideEstabLotList];

    estabs.forEach(estab => {
      if (!estab) return;
      const remuns = estab.remunPerApur || [];
      const remunsList = Array.isArray(remuns) ? remuns : [remuns];

      remunsList.forEach(r => {
        if (!r) return;
        const itens = r.itensRemun || [];
        const itensList = Array.isArray(itens) ? itens : [itens];

        itensList.forEach(item => {
          if (!item) return;
          const cod = String(item.codRubr || '');
          const valor = parseFloat(item.vrRubr) || 0;
          const tp = parseInt(item.tpRubr) || (cod.startsWith('8') || cod.startsWith('9') ? 2 : 1);

          // 1=Vencimento/Provento, 2=Desconto, 3=Informativa, 4=Informativa Dedutora
          let tipoDesc = 'Provento';
          if (tp === 2) {
            tipoDesc = 'Desconto';
            totalDescontos += valor;
          } else if (tp === 1) {
            totalProventos += valor;
          } else {
            tipoDesc = 'Informativa';
          }

          rubricas.push({
            codigo: cod,
            tipo: tipoDesc,
            valor,
            valorFormatado: formatMoney(valor),
            desc: identificarDescricaoRubrica(cod)
          });
        });
      });
    });
  });

  const valorLiquido = Math.max(0, totalProventos - totalDescontos);

  result.detalhes = {
    totalProventos,
    totalProventosFormatado: formatMoney(totalProventos),
    totalDescontos,
    totalDescontosFormatado: formatMoney(totalDescontos),
    valorLiquido,
    valorLiquidoFormatado: formatMoney(valorLiquido),
    qtdRubricas: rubricas.length,
    rubricas
  };

  // Gerar Partidas Dobradas Contábeis (Padrão Domínio CT)
  const comp = result.competencia || 'COMPETÊNCIA ATUAL';
  result.contabilizacao = [
    {
      data: comp,
      contaDebito: '3.1.1.01.0001',
      descDebito: 'Ordenados e Salários (Despesa)',
      contaCredito: '2.1.2.01.0001',
      descCredito: 'Salários a Pagar (Passivo)',
      valor: totalProventos,
      valorFormatado: formatMoney(totalProventos),
      historico: `Vlr. ref. folha de pagamento competência ${comp}`
    },
    {
      data: comp,
      contaDebito: '2.1.2.01.0001',
      descDebito: 'Salários a Pagar (Passivo)',
      contaCredito: '2.1.2.01.0003',
      descCredito: 'INSS a Recolher (Passivo)',
      valor: totalDescontos,
      valorFormatado: formatMoney(totalDescontos),
      historico: `Vlr. ref. retenção de descontos folha de pagamento ${comp}`
    }
  ];
}

/**
 * Processa S-1210: Pagamentos de Rendimentos do Trabalho
 */
function processS1210(evtData, result) {
  let totalLiquidoPago = 0;
  let totalIRRFRetido = 0;
  const pagamentos = [];

  const infoPgtoList = evtData.infoPgto || [];
  const list = Array.isArray(infoPgtoList) ? infoPgtoList : [infoPgtoList];

  list.forEach(p => {
    if (!p) return;
    const vlr = parseFloat(p.vrLiq) || 0;
    const dt = p.dtPgto || '';
    totalLiquidoPago += vlr;

    pagamentos.push({
      dataPagamento: dt,
      valorLiquido: vlr,
      valorFormatado: formatMoney(vlr),
      tpPgto: p.tpPgto || 'Folha Mensal'
    });
  });

  result.detalhes = {
    totalLiquidoPago,
    totalLiquidoPagoFormatado: formatMoney(totalLiquidoPago),
    pagamentos
  };
}

/**
 * Processa S-2200: Cadastramento Inicial e Admissão
 */
function processS2200(evtData, result) {
  const trab = evtData.trabalhador || {};
  const dadosTrab = trab.dadosTrabalhador || trab;
  const vinculo = evtData.vinculo || {};
  const infoRegimeTrab = vinculo.infoRegimeTrab || {};
  const infoCeletista = infoRegimeTrab.infoCeletista || {};
  const cargo = infoCeletista.cargo || vinculo.cargo || {};
  const remun = infoCeletista.remuneracao || vinculo.remuneracao || {};

  const nome = dadosTrab.nmTrab || 'Não informado';
  const dataNascimento = dadosTrab.dtNascto || '';
  const sexo = dadosTrab.sexo || '';
  const matricula = vinculo.matricula || '';
  const dtAdm = vinculo.dtAdm || '';
  const cargoNome = cargo.nmCargo || cargo.codCargo || 'Cargo Geral';
  const cbo = cargo.cbCargo || '';
  const salario = parseFloat(remun.vrSalFx) || 0;

  result.trabalhador.nome = nome;
  result.trabalhador.matricula = matricula;

  result.detalhes = {
    nome,
    dataNascimento,
    sexo,
    matricula,
    dataAdmissao: dtAdm,
    cargo: cargoNome,
    cbo,
    salario,
    salarioFormatado: formatMoney(salario),
    tipoContrato: infoCeletista.tpContr === 1 ? 'Prazo Indeterminado' : 'Prazo Determinado'
  };
}

/**
 * Processa S-2299: Desligamento / Rescisão
 */
function processS2299(evtData, result) {
  const infoDeslig = evtData.infoDeslig || {};
  const dtDeslig = infoDeslig.dtDeslig || '';
  const mtvDeslig = infoDeslig.mtvDeslig || '';

  // Códigos eSocial de motivo de rescisão
  const motivos = {
    '01': 'Demissão sem justa causa pelo empregador',
    '02': 'Demissão com justa causa pelo empregador',
    '03': 'Pedido de demissão pelo empregado',
    '04': 'Rescisão por término do contrato de trabalho',
    '05': 'Rescisão por acordo entre as partes (Art. 484-A CLT)',
    '09': 'Falecimento do empregado'
  };

  result.detalhes = {
    dataDesligamento: dtDeslig,
    codigoMotivo: mtvDeslig,
    motivoDescricao: motivos[mtvDeslig] || `Motivo eSocial Código ${mtvDeslig}`
  };
}

/**
 * Processa S-5001 / S-5011: Totalizadores DCTFWeb & FGTS Digital
 */
function processTotalizadores(evtData, result) {
  const infoCS = evtData.infoCS || evtData.infoTotal || {};
  const bases = evtData.infoBaseCS || {};

  const vrCpSeg = parseFloat(infoCS.vrCpSeg || bases.vrCpSeg) || 0;
  const vrPatronal = parseFloat(infoCS.vrPatronal) || 0;
  const vrRAT = parseFloat(infoCS.vrRAT) || 0;
  const vrTerceiros = parseFloat(infoCS.vrTerceiros || infoCS.vrOutrasEnt) || 0;
  const totalDCTFWeb = vrCpSeg + vrPatronal + vrRAT + vrTerceiros;

  result.detalhes = {
    vrCpSeg,
    vrCpSegFormatado: formatMoney(vrCpSeg),
    vrPatronal,
    vrPatronalFormatado: formatMoney(vrPatronal),
    vrRAT,
    vrRATFormatado: formatMoney(vrRAT),
    vrTerceiros,
    vrTerceirosFormatado: formatMoney(vrTerceiros),
    totalDCTFWeb,
    totalDCTFWebFormatado: formatMoney(totalDCTFWeb)
  };
}

/**
 * Dicionário das Rubricas Mais Comuns no Domínio Sistemas
 */
function identificarDescricaoRubrica(codigo) {
  const mapa = {
    '1': 'Salário Base',
    '2': 'Horas Extras 50%',
    '3': 'Horas Extras 100%',
    '4': 'DSR sobre Horas Extras',
    '5': 'Adicional Noturno',
    '6': 'Adicional de Insalubridade',
    '7': 'Adicional de Periculosidade',
    '10': 'Pró-Labore',
    '20': 'Gratificação de Função',
    '50': 'Salário Família',
    '51': 'Salário Maternidade',
    '80': 'Desconto INSS Folha',
    '81': 'Desconto IRRF Folha',
    '82': 'Desconto Vale Transporte',
    '83': 'Desconto Vale Alimentação/Refeição',
    '85': 'Desconto Adiantamento Salarial',
    '88': 'Desconto Faltas e Atrasos',
    '90': 'Desconto Pensão Alimentícia',
    '101': '13º Salário 1ª Parcela',
    '102': '13º Salário 2ª Parcela',
    '998': 'Base de Cálculo FGTS (Informativa)',
    '999': 'Base de Cálculo INSS (Informativa)'
  };
  return mapa[codigo] || `Rubrica ${codigo}`;
}

module.exports = {
  parseEsocialXML,
  identificarDescricaoRubrica
};
