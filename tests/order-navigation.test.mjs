import test from 'node:test';
import assert from 'node:assert/strict';
import {orderToRestore} from '../src/order-navigation.mjs';
import {createStore} from '../src/store.mjs';
const orders=[{id:'new-other',sessionId:'journey-b'},{id:'saved-current',sessionId:'journey-a'},{id:'old-current',sessionId:'journey-a'}];
test('returning from the sales desk restores the current journey order, even from a form URL',()=>{
 assert.equal(orderToRestore(orders,{journeyId:'journey-a'}),'saved-current');
 assert.equal(orderToRestore(orders,{journeyId:'journey-a',view:'form'}),'saved-current');
 assert.equal(orderToRestore(orders,{journeyId:'journey-a',view:'checkout'}),'saved-current');
});
test('explicit saved order wins, while an unsaved journey never loads another journey order',()=>{
 assert.equal(orderToRestore(orders,{orderId:'old-current',journeyId:'journey-b'}),'old-current');
 assert.equal(orderToRestore(orders,{orderId:'not-owned',journeyId:'journey-a'}),null);
 assert.equal(orderToRestore(orders,{journeyId:'new-unsaved'}),null);
 assert.equal(orderToRestore(orders,{view:'form'}),null);
 assert.equal(orderToRestore(orders,{}),'new-other');
 assert.equal(orderToRestore([],{}),null);
});
test('order summaries retain journey links and remain browser-owner scoped',()=>{
 const store=createStore(':memory:');
 try{
  const owner=store.session(),other=store.session();
  const p={businessName:'Synthetic test business'},q={sessionId:'journey-a',installDays:5};
  const first=store.createOrder(owner.hash,'key-a',p,{},q,{status:'passed'});
  const legacy=store.createOrder(owner.hash,'key-legacy',p,{}, {installDays:5},{status:'passed'});
  const summary=store.orders(owner.hash);
  assert.equal(summary.find(o=>o.id===first.id).sessionId,'journey-a');
  assert.equal(summary.find(o=>o.id===legacy.id).sessionId,null);
  assert.deepEqual(store.orders(other.hash),[]);
  assert.equal(store.getOrder(other.hash,first.id),null);
  assert.equal(orderToRestore(summary,{journeyId:'journey-a'}),first.id);
 }finally{store.close();}
});
