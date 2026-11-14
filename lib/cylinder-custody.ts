// A10: Cylinder physical custody is not a refrigerant-kg stock ledger.
// All dates and supplier rental terms are explicit; none are inferred.
export type CylinderStatus='in_custody'|'return_pending'|'returned'|'unaccounted'
export type CylinderLocation='warehouse'|'van'|'customer_site'|'supplier'|'unknown'
export type CylinderOwner='supplier'|'company'|'customer'
export type CylinderInput={
  id?:string;version?:number;
  cylinder_serial:string;gas_label:string;nominal_capacity_kg:string;
  ownership:CylinderOwner; supplier_id:string;
  received_on:string;rent_free_until:string;return_due_on:string;
  rental_review_on:string;rental_terms_reference:string;
  cylinder_test_due_on:string;last_leak_check_on:string;
  status:CylinderStatus;location_kind:CylinderLocation;
  warehouse_id:string;van_id:string;site_reference:string;
  notes:string;audit_reference:string
}
const allowedOwners=['supplier','company','customer']
const allowedStatus=['in_custody','return_pending','returned','unaccounted']
const allowedLocation=['warehouse','van','customer_site','supplier','unknown']
const trim=(s:unknown)=>typeof s==='string'?s.trim():''
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00.000Z').toISOString().slice(0,10)===s
const validId=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export function validateCylinderInput(value:CylinderInput){
 if(!value||typeof value!=='object')return {error:'Enter cylinder details.'} as const
 const serial=trim(value.cylinder_serial),gas=trim(value.gas_label),reference=trim(value.audit_reference)
 const notes=trim(value.notes),site=trim(value.site_reference),terms=trim(value.rental_terms_reference)
 const supplier=trim(value.supplier_id),van=trim(value.van_id),warehouse=trim(value.warehouse_id)
 if(serial.length<2||serial.length>120)return {error:'Cylinder serial must contain 2–120 characters.'} as const
 if(gas.length<2||gas.length>100)return {error:'Identify the gas or refrigerant type.'} as const
 if(reference.length<3||reference.length>120)return {error:'An audit reference is required (3–120 characters).'} as const
 if(notes.length>2000||site.length>250||terms.length>250)return {error:'A note or reference is too long.'} as const
 if(!allowedOwners.includes(value.ownership))return {error:'Select cylinder ownership.'} as const
 if(!allowedStatus.includes(value.status)||!allowedLocation.includes(value.location_kind))
  return {error:'Select a valid cylinder status and location.'} as const
 if(!validDate(value.received_on))return {error:'Enter the actual cylinder receipt date.'} as const
 const dates=['rent_free_until','return_due_on','rental_review_on','cylinder_test_due_on','last_leak_check_on'] as const
 for(const key of dates){
   const date=trim(value[key])
   if(date&&!validDate(date))return {error:'Check the cylinder date fields.'} as const
 }
 if(supplier&&!validId(supplier))return {error:'Choose a valid registered supplier.'} as const
 if(value.ownership==='supplier'&&!supplier)return {error:'Supplier-owned cylinder requires a supplier.'} as const
 if([value.rent_free_until,value.return_due_on,value.rental_review_on].some(Boolean)&&
   (!supplier||terms.length<3))return {error:'Supplier hire dates require a supplier and contract reference.'} as const
 for(const key of ['rent_free_until','return_due_on','rental_review_on'] as const){
   if(value[key]&&value[key]<value.received_on)return {error:'Supplier dates cannot precede the receipt date.'} as const
 }
 if((warehouse&&!validId(warehouse))||(van&&!validId(van)))return {error:'Choose a valid van or warehouse.'} as const
 const loc=value.location_kind
 if(loc==='warehouse'&&(!warehouse||van||site))return {error:'Select only a receiving warehouse.'} as const
 if(loc==='van'&&(!van||warehouse||site))return {error:'Select only a source van.'} as const
 if(loc==='customer_site'&&(site.length<3||warehouse||van))return {error:'Record the customer/site location.'} as const
 if(['unknown','supplier'].includes(loc)&&(warehouse||van||site))return {error:'Clear the old location before changing custody.'} as const
 if(value.status==='returned'&&(loc!=='supplier'||!supplier))return {error:'Returned cylinders must have a supplier destination.'} as const
 if(value.status==='unaccounted'&&loc!=='unknown')return {error:'Unaccounted cylinder must have unknown location.'} as const
 if(['in_custody','return_pending'].includes(value.status)&&['supplier'].includes(loc))
  return {error:'A cylinder held by its supplier must be marked returned.'} as const
 if(value.nominal_capacity_kg!==''&&value.nominal_capacity_kg!==null){
   const num=Number(value.nominal_capacity_kg)
   if(!/^\d+(?:\.\d{1,2})?$/.test(value.nominal_capacity_kg)||!Number.isFinite(num)||num<=0||num>10000)
    return {error:'Capacity must be a positive kg value with at most two decimals.'} as const
 }
 if(value.id&&(!validId(value.id)||!Number.isInteger(value.version)||Number(value.version)<1))
  return {error:'Invalid or out-of-date custody record. Refresh and retry.'} as const
 return {data:{
  cylinder_serial:serial,gas_label:gas,
  nominal_capacity_kg:value.nominal_capacity_kg===''?null:Number(value.nominal_capacity_kg),
  ownership:value.ownership,supplier_id:supplier||null,received_on:value.received_on,
  rent_free_until:value.rent_free_until||null,return_due_on:value.return_due_on||null,
  rental_review_on:value.rental_review_on||null,rental_terms_reference:terms||null,
  cylinder_test_due_on:value.cylinder_test_due_on||null,last_leak_check_on:value.last_leak_check_on||null,
  status:value.status,location_kind:value.location_kind,
  warehouse_id:warehouse||null,van_id:van||null,site_reference:site||null,
  notes:notes||null,audit_reference:reference,
 }} as const
}

export function cylinderDueLabels(row:{
 status:string;rent_free_until?:string|null;return_due_on?:string|null;
 rental_review_on?:string|null;cylinder_test_due_on?:string|null
},perthDay:string){
 if(row.status==='returned')return []
 const dates=[
  [row.rent_free_until,'Rent-free period expired','Rent-free period ends'],
  [row.return_due_on,'Supplier return due','Supplier return upcoming'],
  [row.rental_review_on,'Rental/forced-sale terms review due','Rental terms review upcoming'],
  [row.cylinder_test_due_on,'Cylinder test due','Cylinder test date upcoming'],
 ] as const
 return dates.filter(([date])=>Boolean(date)).map(([date,late,early])=>({
  text:date!&&date<=perthDay?late:early,
  date:date!,
  due:date!<=perthDay,
 }))
}
