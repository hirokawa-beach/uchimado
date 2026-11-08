// Use UTC arithmetic for calendar-only dates, independent of the browser timezone.
type Repeat = {frequency:string;interval:number;until:string|null}
type Repeating = {date:string;endDate:string;recurrence?:Repeat;exceptions?:Record<string,unknown>;occurrenceDate?:string;seriesDate?:string;seriesEndDate?:string}
const millis=(d:string)=>Date.parse(`${d}T00:00:00Z`)
const key=(d:number)=>new Date(d).toISOString().slice(0,10)
const DAY=86400000
export function matches(start:string,day:string,repeat:Repeat):boolean {
  if(day<start||repeat.until&&day>repeat.until)return false
  const delta=Math.round((millis(day)-millis(start))/DAY),interval=repeat.interval||1
  if(repeat.frequency==='daily')return delta%interval===0
  if(repeat.frequency==='weekly')return delta%(interval*7)===0
  const a=new Date(millis(start)),b=new Date(millis(day))
  if(repeat.frequency==='monthly')return a.getUTCDate()===b.getUTCDate()&&((b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth())%interval===0
  if(repeat.frequency==='yearly')return a.getUTCMonth()===b.getUTCMonth()&&a.getUTCDate()===b.getUTCDate()&&(b.getUTCFullYear()-a.getUTCFullYear())%interval===0
  return start===day
}
export function occurrenceOn<T extends Repeating>(event:T,day:string):T[] {
  const repeat=event.recurrence
  if(!repeat||repeat.frequency==='none')return event.date<=day&&event.endDate>=day?[event]:[]
  const duration=Math.round((millis(event.endDate)-millis(event.date))/DAY)
  const result:T[]=[]
  for(let offset=0;offset<=duration;offset++){
    const start=key(millis(day)-offset*DAY)
    if(matches(event.date,start,repeat)&&!Object.hasOwn(event.exceptions||{},start))result.push({...event,date:start,endDate:key(millis(start)+duration*DAY),occurrenceDate:start,seriesDate:event.date,seriesEndDate:event.endDate})
  }
  for(const [original,override] of Object.entries(event.exceptions||{})){
    const value=override as T|null
    if(value&&value.date<=day&&value.endDate>=day)result.push({...event,...value,occurrenceDate:original,seriesDate:event.date,seriesEndDate:event.endDate,recurrence:repeat})
  }
  return result
}
