# Domínio REA Accounting Engine (Open Source)

> **Motor Contábil Aberto baseado em Recursos, Eventos e Agentes (ISO/IEC 15944-4) com Interoperabilidade Nativa para o Domínio Sistemas.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v24.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Standards](https://img.shields.io/badge/Standard-ISO%2FIEC%2015944--4%20REA-orange.svg)](https://www.iso.org/standard/57537.html)

---

## 🎯 Visão Geral do Projeto

Os sistemas de ERP e contabilidade tradicionais no Brasil (como o **Domínio Sistemas da Thomson Reuters**) foram historicamente construídos em arquiteturas fechadas, dependentes de bancos legados (como Sybase SQL Anywhere) e de registro direto de partidas dobradas (débito/crédito), perdendo o contexto operacional das transações econômicas.

Este projeto implementa uma **solução 100% de código aberto (Open Source)** baseada na ontologia formal **REA (Resource-Event-Agent)** — padronizada internacionalmente pela **ISO/IEC 15944-4** e criada pelo Prof. William E. McCarthy — adaptada às particularidades fiscais brasileiras (ICMS, PIS, COFINS, ISS, CFOPs, Acumuladores e SPED) e fornecendo **interoperabilidade bidirecional com os layouts oficiais do Domínio Sistemas**.

---

## 🏛️ Princípios Arquiteturais: Ontologia REA (ISO/IEC 15944-4)

Diferente da escrituração contábil tradicional que parte de contas abstratas, o REA modela a realidade econômica primária de forma imutável (Event-Sourcing):

1. **Recursos Econômicos (`EconomicResource`)**:
   - Bens físicos (`PhysicalGoods`), Mercadorias para Revenda, Materiais de Consumo.
   - Créditos Fiscais (`TaxCreditClaim` - ICMS, PIS, COFINS a recuperar).
   - Obrigações Fiscais (`TaxLiabilityClaim` - ICMS, ISS a recolher).
   - Direitos e Obrigações Financeiras (`FinancialClaim` - Fornecedores a Pagar / Clientes a Receber).
   - Moeda / Caixa e Bancos (`MoneyCash`).
   - Mão-de-Obra / Serviços (`LaborResource`).

2. **Eventos Econômicos (`EconomicEvent`)**:
   - `GoodsAcquisitionEvent`: Aquisição de insumos/mercadorias (inflow).
   - `GoodsSaleEvent`: Entrega e consumo de mercadorias vendidas ao custo (outflow CMV).
   - `TaxCreditAccrualEvent`: Apropriação de crédito tributário na entrada.
   - `TaxLiabilityAccrualEvent`: Constituição de obrigação tributária no faturamento.
   - `CashDisbursementEvent` / `CashReceiptEvent`: Fluxos de tesouraria.

3. **Agentes Econômicos (`EconomicAgent`)**:
   - Entidade Contábil / Empresa declarante (`ENTERPRISE`).
   - Fornecedores (`SUPPLIER`) e Clientes (`CUSTOMER`).
   - Fisco / Autoridades Tributárias Federal, Estadual e Municipal (`TAX_AUTHORITY`).
   - Colaboradores / Empregados (`EMPLOYEE`).

4. **Dualidade Econômica (`EconomicDuality`)**:
   - O princípio do "Give and Take": todo incremento de valor patrimonial tem como contrapartida uma obrigação ou entrega equivalente.

5. **Projeção Contábil Derivada (Partidas Dobradas em Tempo Real)**:
   - Os livros contábeis (**Livro Diário**, **Livro Razão**, **Balancete de Verificação**, **DRE** e **Balanço Patrimonial**) não são armazenados como dados estáticos, mas **projetados em tempo real** a partir dos eventos econômicos primitivos, garantindo que `Σ Débitos === Σ Créditos` e `Ativo === Passivo + PL` sem risco de discrepância.

---

## 🔌 Interoperabilidade com o Domínio Sistemas

O módulo `interop-dominio` implementa leitura e gravação exata nos padrões fixos posicionais do Domínio Sistemas:

- **Layout 19 (Notas Fiscais de Entrada e Saída)**:
  - Registro `01`: Cabeçalho da Empresa, período e versão.
  - Registro `02`: Detalhe de Notas Fiscais de Entrada (com Acumulador, CFOP, Base e ICMS).
  - Registro `03`: Detalhe de Notas Fiscais de Saída.
  - Registro `99`: Finalizador de Lote.
  - Compatível com: *Utilitários > Importação > Importador > Notas*.
- **Layout 3 (Participantes / Clientes e Fornecedores)**:
  - Registro `11`: Cadastro posicional de Fornecedores (224 colunas).
  - Registro `22`: Cadastro posicional de Clientes (224 colunas).
  - Compatível com: *Utilitários > Importação > Importador > Fornecedores / Clientes*.
- **Motor de Acumuladores (`efacumulador`)**:
  - Acumulador `1`: Compra para Revenda (CFOP 1102/2102) -> Gera crédito de ICMS, estoque líquido e contas a pagar.
  - Acumulador `2`: Compra para Uso/Consumo (CFOP 1556/2556) -> Despesa operacional sem apropriação de crédito.
  - Acumulador `10`: Venda de Mercadorias (CFOP 5102/6102) -> Faturamento bruto, débito de ICMS e baixa de CMV.
  - Acumulador `50`: Prestação de Serviços -> Faturamento de serviços e retenção de tributos.

---

## 📁 Estrutura de Pacotes

```text
dominio-rea-accounting/
├── packages/
│   ├── core-rea/                 # Ontologia Formal REA (ISO/IEC 15944-4)
│   │   └── src/
│   │       ├── types.ts          # Tipos e interfaces REA
│   │       ├── agents.ts         # Agentes Econômicos
│   │       ├── resources.ts      # Recursos Econômicos e Estoques
│   │       ├── events.ts         # Eventos Econômicos Primitivos
│   │       ├── duality.ts        # Regras de Dualidade e Validação Stock-Flow
│   │       └── event-store.ts    # Repositório de Eventos Imutáveis
│   │
│   ├── interop-dominio/          # Integração e Layouts Domínio Sistemas
│   │   └── src/
│   │       ├── layouts/
│   │       │   ├── layout19.ts   # Parser e Gerador Layout 19 (Notas Fiscais)
│   │       │   └── layout3.ts    # Parser e Gerador Layout 3 (Fornecedores/Clientes)
│   │       ├── acumulador/
│   │       │   └── acumulador-engine.ts # Mapeamento efacumulador -> REA
│   │       ├── importer.ts       # Ingestão de arquivos TXT em entidades REA
│   │       └── exporter.ts       # Exportação de eventos REA para TXT Domínio
│   │
│   ├── projection-accounting/    # Projeção de Partidas Dobradas e Relatórios
│   │   └── src/
│   │       ├── chart-of-accounts.ts # Plano de Contas Referencial CFC / Domínio
│   │       ├── projector.ts      # Projeção REA -> Lançamentos Débito/Crédito
│   │       ├── ledger.ts         # Livro Diário, Razão (T-Accounts) e Balancete
│   │       └── financial-statements.ts # DRE e Balanço Patrimonial
│   │
│   └── demo/                     # Demonstração Executável End-to-End
│       └── src/
│           └── run-demo.ts       # Pipeline completo de importação, projeção e exportação
│
├── tests/                        # Bateria de Testes Automatizados
│   ├── rea-core.test.ts
│   ├── dominio-interop.test.ts
│   └── projection-accounting.test.ts
│
├── package.json
├── tsconfig.json
├── LICENSE                       # Licença Aberta MIT
└── README.md
```

---

## 🚀 Como Executar

### Pré-requisitos
- **Node.js**: versão 20 ou superior (testado com Node.js v24.12.0)
- **npm**: versão 10 ou superior

### Instalação
```bash
git clone https://github.com/dominio-rea/dominio-rea-accounting.git
cd dominio
npm install
```

### Compilar TypeScript
```bash
npm run build
```

### Executar os Testes Automatizados
```bash
npm run test:ts
```

### Executar a Demonstração Completa
```bash
npm run demo
```

---

## 📊 Exemplo de Saída da Demonstração

```text
========================================================================
🚀 PROJETO OPEN-SOURCE: MOTOR CONTÁBIL REA & INTEROP DOMÍNIO SISTEMAS
   Ontologia ISO/IEC 15944-4 (Resource-Event-Agent) aplicada ao Brasil
========================================================================

📦 1. SIMULANDO ARQUIVOS OFICIAIS DOMÍNIO SISTEMAS...
   Layout 3 gerado: 2 linhas
   Layout 19 gerado: 5 linhas

🔄 2. INGESTÃO & CONVERSÃO EM EVENTOS PRIMITIVOS E DUALIDADES REA...
   Empresa REA: Mega Varejista do Pará Ltda (18.493.821/0001-40)
   Agentes Econômicos Registrados: 4
   Recursos Econômicos Gerenciados: 5
   Dualidades Econômicas Derivadas: 3
   Eventos Primitivos no Event Store: 7

📜 3. PROJEÇÃO EM TEMPO REAL: LIVRO DIÁRIO (PARTIDAS DOBRADAS)...
   [Lançamento 1] Chave: 15260304825944000190550010000100451004928172 | Equilibrado: ✅ SIM
      1.1.4.01   Estoques de Mercadorias para Revenda   | D: R$   20500.00 |              
      1.1.3.01   ICMS a Recuperar                       | D: R$    4500.00 |              
      2.1.1.01   Fornecedores Nacionais a Pagar         |              | C: R$   25000.00
   [Lançamento 2] Chave: 15260304825944000190550010000100801992817281 | Equilibrado: ✅ SIM
      5.1.1.01   Despesas com Material de Consumo       | D: R$    3000.00 |              
      2.1.1.01   Fornecedores Nacionais a Pagar         |              | C: R$    3000.00
   [Lançamento 3] Chave: 15260318493821000140550010000050011982736451 | Equilibrado: ✅ SIM
      1.1.2.01   Clientes / Duplicatas a Receber        | D: R$   42000.00 |              
      3.1.1.01   Receita Bruta com Venda de Mercadorias |              | C: R$   42000.00
      4.1.1.01   Custo das Mercadorias Vendidas (CMV)   | D: R$   25200.00 |              
      1.1.4.01   Estoques de Mercadorias para Revenda   |              | C: R$   25200.00
      3.2.1.01   (-) ICMS sobre Vendas                  | D: R$    7560.00 |              
      2.1.2.01   ICMS a Recolher                        |              | C: R$    7560.00

⚖️  4. BALANCETE DE VERIFICAÇÃO (TRIAL BALANCE)...
   -----------------------------------------------------------------------------------------
   Conta       Descrição                              Débito Mov.   Crédito Mov.  Saldo Final
   -----------------------------------------------------------------------------------------
   1.1.2.01    Clientes / Duplicatas a Receber      |    42000.00 |        0.00 | D    42000.00
   1.1.3.01    ICMS a Recuperar                     |     4500.00 |        0.00 | D     4500.00
   1.1.4.01    Estoques de Mercadorias para Revenda |    20500.00 |    25200.00 | C     4700.00
   2.1.1.01    Fornecedores Nacionais a Pagar       |        0.00 |    28000.00 | C    28000.00
   2.1.2.01    ICMS a Recolher                      |        0.00 |     7560.00 | C     7560.00
   3.1.1.01    Receita Bruta com Venda de Mercadori |        0.00 |    42000.00 | C    42000.00
   3.2.1.01    (-) ICMS sobre Vendas                |     7560.00 |        0.00 | D     7560.00
   4.1.1.01    Custo das Mercadorias Vendidas (CMV) |    25200.00 |        0.00 | D    25200.00
   5.1.1.01    Despesas com Material de Consumo     |     3000.00 |        0.00 | D     3000.00
   -----------------------------------------------------------------------------------------
   TOTAL GERAL:                                    R$  102760.00 | R$  102760.00 | Equilíbrio: ✅ PERFEITO

📊 5. DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)...
   (+) Receita Bruta com Vendas:                R$     42000.00
   (-) Tributos sobre Vendas (ICMS):            R$      7560.00
   (=) Receita Líquida Operacional:             R$     34440.00
   (-) Custo das Mercadorias Vendidas (CMV):    R$     25200.00
   (=) Lucro Bruto Operacional:                 R$      9240.00
   (-) Despesas Operacionais (Uso/Consumo):     R$      3000.00
   (=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO):  R$      6240.00

🏛️  6. BALANÇO PATRIMONIAL...
   TOTAL DO ATIVO (Bens + Direitos):            R$     41800.00
   TOTAL DO PASSIVO (Obrigações c/ Terceiros):  R$     35560.00
   PATRIMÔNIO LÍQUIDO (Lucro Apurado na DRE):   R$      6240.00
   TOTAL PASSIVO + PATRIMÔNIO LÍQUIDO:          R$     41800.00
   EQUAÇÃO FUNDAMENTAL (Ativo = Passivo + PL):  ✅ ATENDIDA INTEGRALMENTE
```

---

## 🖥️ Aplicativo Desktop & Hub de Automação Local

Como a contabilidade no Brasil requer leitura direta de pastas compartilhadas na rede (`\\192.168.15.2\...`), varredura de gigabytes de XMLs fiscais e certificados digitais locais, o sistema foi desenvolvido como uma **aplicação desktop híbrida**:

### 🚀 Como Executar no seu Computador

1. **Atalho na Área de Trabalho:** Dê dois cliques em `MC Contabil Hub.lnk` na sua Área de Trabalho.
2. **Ou via Arquivo em Lote:** Execute `Iniciar MC Contabil.bat` na raiz da pasta.
3. **Ou via Linha de Comando:**
   ```bash
   npm install
   npm start
   ```

### ⚡ Recursos do Hub Integrado

| Módulo | Descrição Operacional |
| :--- | :--- |
| **Ontologia REA (ISO/IEC)** | Motor primitivo Resource-Event-Agent com DRE, Balanço e Livro Diário em tempo real |
| **Explorador & Inspetor ZIP** | Navegação em pastas de rede e inspeção imediata de lotes de NF-e compactados em `.zip` |
| **Central Fiscal (NF-e/NFC-e/CT-e)** | Parser completo de XMLs, apuração de Simples Nacional, espelho CFOP e exportação de **Layout 19** |
| **Central Contábil & Extratos** | Conciliação bancária automática com suporte a OFX e PDF de **10 bancos brasileiros** |
| **Central de Pessoal & eSocial** | Ingestão de eventos S-1200/1210/2200/5001 com geração de partidas contábeis para folha |
| **Auditoria VISA & Legal** | Checklist de 12 itens do dossiê da Vigilância Sanitária e controle de certidões e bombeiros |

---

## 📜 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para mais detalhes.
