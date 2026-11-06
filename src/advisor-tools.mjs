import {eligibility, quote, recommendForNeeds} from './catalogue.mjs';

const publicProduct=product=>({
  id:product.id,name:product.name,description:product.description,category:product.category,unit:product.unit,
  monthlyMin:product.price,monthlyMax:product.maxPrice,oneTimeSetup:product.setup,contractMonths:product.contractMonths,
  typicalInstallDays:product.installDays,minEmployees:product.minEmployees,minSites:product.minSites,
  cityTiers:product.tiers,requiresGst:product.requiresGst,requiresOneOf:[...product.requiresOneOf]
});

/** Deterministic advisor tools. LLM output never supplies prices or eligibility decisions. */
export function createAdvisorTools(business,data){
  const getProduct=id=>data.products.find(product=>product.id===id)||null;
  return Object.freeze({
    get_product_catalogue:()=>data.products.map(publicProduct),
    get_product_details:id=>{const product=getProduct(id);return product?publicProduct(product):null;},
    search_products:query=>{
      const terms=String(query||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if(!terms.length)return [];
      return data.products.map(product=>{
        const text=`${product.name} ${product.description} ${product.category} ${product.id}`.toLowerCase();
        const score=terms.reduce((total,term)=>total+(text.includes(term)?1:0),0);
        return {product,score};
      }).filter(result=>result.score>0).sort((a,b)=>b.score-a.score||a.product.id.localeCompare(b.product.id)).map(result=>publicProduct(result.product));
    },
    check_product_eligibility:(id,checkedBusiness=business,locationId)=>{
      const product=getProduct(id);if(!product)return {productId:id,eligible:false,reasons:['product_not_in_catalogue']};
      const reasons=eligibility(product,checkedBusiness,data,locationId);
      return {productId:id,eligible:reasons.length===0,reasons};
    },
    check_product_dependencies:productIds=>{
      const selected=(Array.isArray(productIds)?productIds:[]).map(item=>typeof item==='string'?{productId:item}:item);
      return selected.flatMap(item=>{
        const id=item.productId;
        const product=getProduct(id);if(!product)return [{productId:id,satisfied:false,reason:'product_not_in_catalogue'}];
        const required=[...product.requiresOneOf];
        return required.length&&!selected.some(candidate=>required.includes(candidate.productId)&&(!item.locationId||candidate.locationId===item.locationId))
          ?[{productId:id,satisfied:false,requiresOneOf:required}]:[];
      });
    },
    recommend_products:(checkedBusiness=business,quantities={})=>recommendForNeeds(checkedBusiness,data,quantities),
    calculate_package_price:items=>quote(business,items,data),
    compare_budget:(pricedQuote,budget=business.budget)=>({
      budget,minimum:pricedQuote.monthly,maximum:pricedQuote.monthlyMax,
      minimumFits:pricedQuote.monthly<=budget,maximumFits:pricedQuote.monthlyMax<=budget,
      minimumOverBy:Math.max(0,pricedQuote.monthly-budget),maximumOverBy:Math.max(0,pricedQuote.monthlyMax-budget),
      setup:pricedQuote.setup
    }),
    check_location_availability:city=>({
      city:typeof city==='string'?city.trim().slice(0,100):null,
      verified:false,status:'provider_confirmation_required',
      reason:'The supplied catalogue contains city-tier eligibility only; it has no street-level network coverage or live availability data.'
    })
  });
}
