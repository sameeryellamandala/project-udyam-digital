// Summaries come from the owner-scoped orders API; never choose an order
// belonging to a different journey merely because it was created recently.
export function orderToRestore(orders,{orderId=null,journeyId=null,view=null}={}){
 if(orderId)return orders.find(o=>o.id===orderId)?.id||null;
 if(journeyId)return orders.find(o=>o.sessionId===journeyId)?.id||null;
 if(view==='form')return null;
 return orders[0]?.id||null;
}
