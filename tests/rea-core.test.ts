import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  AgentRepository, 
  createEnterpriseAgent, 
  createSupplierAgent, 
  createCustomerAgent, 
  createTaxAuthorityAgent 
} from '../packages/core-rea/src/agents';
import { 
  ResourceRepository, 
  createPhysicalGoodsResource, 
  createTaxCreditClaimResource, 
  createFinancialClaimResource, 
  createMoneyCashResource 
} from '../packages/core-rea/src/resources';
import { 
  createGoodsAcquisitionEvent, 
  createFinancialClaimPayableEvent, 
  createCashDisbursementEvent 
} from '../packages/core-rea/src/events';
import { 
  DualityManager, 
  buildAcquisitionDuality 
} from '../packages/core-rea/src/duality';
import { REAEventStore } from '../packages/core-rea/src/event-store';
import { StockFlowDirection, AgentRole } from '../packages/core-rea/src/types';

describe('REA Core Ontology (ISO/IEC 15944-4)', () => {
  test('AgentRepository registers and indexes agents correctly', () => {
    const repo = new AgentRepository();
    const enterprise = createEnterpriseAgent({
      code: '0000001',
      name: 'Empresa Teste Ltda',
      document: '12.345.678/0001-90',
      state: 'PA'
    });
    const supplier = createSupplierAgent({
      code: '0000002',
      name: 'Distribuidora Norte SA',
      document: '98.765.432/0001-10',
      state: 'SP'
    });

    repo.register(enterprise);
    repo.register(supplier);

    assert.strictEqual(repo.getAll().length, 2);
    assert.strictEqual(repo.getByDocument('12345678000190')?.role, AgentRole.ENTERPRISE);
    assert.strictEqual(repo.getByCode('0000002')?.name, 'Distribuidora Norte SA');
  });

  test('ResourceRepository manages resources and valuations', () => {
    const repo = new ResourceRepository();
    const goods = createPhysicalGoodsResource({
      name: 'Smartphone Pro 128GB',
      sku: 'PROD-001',
      initialQuantity: 10,
      initialValuation: 20000.00
    });
    const cash = createMoneyCashResource();

    repo.register(goods);
    repo.register(cash);

    assert.strictEqual(repo.getById(goods.id)?.balance, 10);
    assert.strictEqual(repo.getById(goods.id)?.valuation, 20000.00);
    assert.strictEqual(repo.getById(cash.id)?.unitOfMeasure, 'BRL');
  });

  test('DualityManager validates balanced Acquisition Duality', () => {
    const dualityMgr = new DualityManager();
    const date = new Date('2026-03-01T10:00:00Z');

    const goodsEvt = createGoodsAcquisitionEvent({
      timestamp: date,
      supplierAgentId: 'sup-1',
      enterpriseAgentId: 'ent-1',
      goodsResourceId: 'res-goods-1',
      quantity: 5,
      unitValue: 1000,
      totalValue: 5000
    });

    const payableEvt = createFinancialClaimPayableEvent({
      timestamp: date,
      enterpriseAgentId: 'ent-1',
      supplierAgentId: 'sup-1',
      claimResourceId: 'res-claim-1',
      amount: 5000
    });

    const duality = buildAcquisitionDuality({
      timestamp: date,
      businessKey: 'NF-1001',
      description: 'Compra de 5 unidades de produto',
      goodsEvent: goodsEvt,
      payableClaimEvent: payableEvt
    });

    const registered = dualityMgr.registerDuality(duality);
    assert.strictEqual(registered.incrementEvents.length, 1);
    assert.strictEqual(registered.decrementEvents.length, 1);
    assert.strictEqual(dualityMgr.getByBusinessKey('NF-1001')?.description, 'Compra de 5 unidades de produto');
  });

  test('REAEventStore persists and retrieves ordered events', () => {
    const store = new REAEventStore();
    const d1 = new Date('2026-03-01T08:00:00Z');
    const d2 = new Date('2026-03-02T14:00:00Z');

    const evt1 = createGoodsAcquisitionEvent({
      timestamp: d1,
      supplierAgentId: 'sup-1',
      enterpriseAgentId: 'ent-1',
      goodsResourceId: 'res-1',
      quantity: 1,
      unitValue: 100,
      totalValue: 100
    });

    const evt2 = createCashDisbursementEvent({
      timestamp: d2,
      enterpriseAgentId: 'ent-1',
      beneficiaryAgentId: 'sup-1',
      cashResourceId: 'res-cash',
      amount: 100
    });

    store.appendEvent(evt2);
    store.appendEvent(evt1);

    const all = store.getAllEvents();
    assert.strictEqual(all.length, 2);
    // Should be sorted by timestamp
    assert.strictEqual(all[0].id, evt1.id);
    assert.strictEqual(all[1].id, evt2.id);
  });
});
