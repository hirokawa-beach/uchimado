export type AppId = 'home' | 'calendar' | 'weather' | 'tasks' | 'board' | 'transit' | 'photos' | 'family' | 'assistant' | 'settings'
import { occurrenceOn } from './recurrence'
export type Member = string
export const members: Member[] = ['家族', 'はると', 'あや', 'ゆい']
export const memberClass: Record<Member, string> = { 家族: 'green', はると: 'blue', あや: 'rose', ゆい: 'amber' }
export type Repeat = {frequency:'none'|'daily'|'weekly'|'monthly'|'yearly';interval:number;until:string|null}
export type CalendarEvent = { id: string; version?:number; title: string; date: string; endDate: string; start: string; end: string; allDay: boolean; member: Member; memberId?:string|null; location: string; note: string; color?:string;visibility?:'family'|'private';timezone?:string;recurrence?:Repeat;exceptions?:Record<string,CalendarEvent|null>;occurrenceDate?:string;seriesDate?:string;seriesEndDate?:string;authorId?:string;createdBy?:string|null;updatedAt?:string;calendarId?:string }
export type Task = { id: string; version?:number; title: string; member: Member; memberId?:string|null; done: boolean; due?:string|null;priority?:'low'|'normal'|'high';visibility?:'family'|'private';recurrence?:Repeat;authorId?:string;createdBy?:string|null;updatedAt?:string }
export const widgetDefinitions = {
  clock: { title: 'いまの時間', app: 'calendar', columns: 4, wideColumns: 6 },
  schedule: { title: '今日の予定', app: 'calendar', columns: 4, wideColumns: 6 },
  weather: { title: '天気', app: 'weather', columns: 4, wideColumns: 6 },
  forecast: { title: '天気予報', app: 'weather', columns: 8, wideColumns: 12 },
  tasks: { title: 'タスク', app: 'tasks', columns: 4, wideColumns: 6 },
  memo: { title: 'メモ', app: 'board', columns: 5, wideColumns: 6 },
  transit: { title: '交通情報', app: 'transit', columns: 3, wideColumns: 6 },
} as const satisfies Record<string, {title:string;app:AppId;columns:number;wideColumns:number}>
export type WidgetId = keyof typeof widgetDefinitions
export type Widget = { id: WidgetId; size: 'standard' | 'wide' | 'tall'; x?: number; y?: number }
export type Settings = { theme: 'light' | 'dark'; background: 'lake' | 'forest' | 'coast' | 'custom'; customBackground: string; blur: number; widgetOpacity: number; reduceMotion: boolean; performance: boolean }
// Calendar arithmetic uses local Date objects containing Japan's wall-clock fields.
// This keeps the display and sample dates in JST even on browsers configured for UTC.
export function today() { const p = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()); return new Date(p.replace(' ','T')) }
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` }
export function parseDate(s: string) { return new Date(`${s}T12:00:00`) }
export function addDays(d: Date, n: number) { const v = new Date(d); v.setDate(v.getDate()+n); return v }
export function startWeek(d: Date) { return addDays(d, -d.getDay()) }
export const jaDate = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ja-JP', opts).format(d)
export function eventsFor(events: CalendarEvent[], day: string) { return events.flatMap(e=>occurrenceOn(e,day)).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start)) }
export function seedEvents(): CalendarEvent[] {
  const day = (n: number) => dateKey(addDays(today(), n))
  return [
    {id:'sample-1',title:'みんなで朝ごはん',date:day(0),endDate:day(0),start:'08:00',end:'09:00',allDay:false,member:'家族',location:'おうち',note:'週末はゆっくり、パンケーキ。'},
    {id:'sample-2',title:'ゆいのピアノ教室',date:day(0),endDate:day(0),start:'14:00',end:'15:00',allDay:false,member:'ゆい',location:'駅前音楽教室',note:'楽譜を忘れずに。'},
    {id:'sample-3',title:'週末の買い出し',date:day(0),endDate:day(0),start:'16:30',end:'17:30',allDay:false,member:'あや',location:'いつものスーパー',note:'牛乳、たまご、明日の朝ごはん。'},
    {id:'sample-4',title:'公園でピクニック',date:day(1),endDate:day(1),start:'11:00',end:'13:00',allDay:false,member:'家族',location:'中央公園',note:'お弁当とレジャーシートを持っていこう。'},
    {id:'sample-5',title:'資源ごみの日',date:day(3),endDate:day(3),start:'08:00',end:'09:00',allDay:true,member:'はると',location:'',note:''},
    {id:'sample-6',title:'学校の個人面談',date:day(5),endDate:day(5),start:'15:00',end:'15:30',allDay:false,member:'あや',location:'小学校',note:''},
    {id:'sample-7',title:'家族のお出かけ',date:day(8),endDate:day(8),start:'10:00',end:'17:00',allDay:false,member:'家族',location:'',note:''},
  ]
}
export const initialWidgets: Widget[] = ['clock','schedule','weather','tasks','memo','transit'].map(id=>({id:id as WidgetId,size:'standard'}))
export const forecastWidgets: Widget[] = ['clock','forecast','tasks','memo','transit'].map(id=>({id:id as WidgetId,size:'standard'}))
export const initialSettings: Settings = {theme:'light',background:'lake',customBackground:'',blur:6,widgetOpacity:94,reduceMotion:false,performance:false}
export const initialTasks: Task[] = [{id:'t1',title:'観葉植物に水やり',member:'はると',done:false},{id:'t2',title:'牛乳とたまごを買う',member:'あや',done:false},{id:'t3',title:'明日の持ちものを準備',member:'ゆい',done:false}]

// Versioned, validated local data: corrupt / older values fall back safely.
export function readStored<T>(key: string, fallback: T, valid: (x: unknown)=>boolean): T {
  try { const raw = localStorage.getItem(`homeboard.v1.${key}`); if (!raw) return fallback; const x: unknown = JSON.parse(raw); return valid(x) ? x as T : fallback } catch { return fallback }
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x==='object'
export const validEvents = (x: unknown) => Array.isArray(x) && x.every(e=>record(e) && ['id','title','date','endDate','start','end','location','note'].every(k=>typeof e[k]==='string') && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.endDate)) && members.includes(e.member as Member) && typeof e.allDay==='boolean')
export const validTasks = (x: unknown) => Array.isArray(x) && x.every(t=>record(t)&&typeof t.id==='string'&&typeof t.title==='string'&&typeof t.done==='boolean'&&members.includes(t.member as Member))
export const validWidgets = (x: unknown) => Array.isArray(x) && x.length<=Object.keys(widgetDefinitions).length && x.every(w=>record(w)&&Object.hasOwn(widgetDefinitions,String(w.id))&&['standard','wide','tall'].includes(String(w.size))&&(w.x===undefined||(Number.isInteger(w.x)&&Number(w.x)>=1&&Number(w.x)<=12))&&(w.y===undefined||(Number.isInteger(w.y)&&Number(w.y)>=1&&Number(w.y)<=20))) && new Set(x.map(w=>w.id)).size===x.length
export const validSettings = (x: unknown) => record(x) && (x.homeLayout===undefined || ['standard','forecast'].includes(String(x.homeLayout))) && ['light','dark'].includes(String(x.theme)) && ['lake','forest','coast','custom'].includes(String(x.background)) && typeof x.customBackground==='string' && (x.customBackground===''||/^data:image\/(jpeg|png|webp);base64,/.test(x.customBackground)) && typeof x.blur==='number' && x.blur>=0 && x.blur<=20 && (x.widgetOpacity===undefined || (typeof x.widgetOpacity==='number' && x.widgetOpacity>=40 && x.widgetOpacity<=100)) && typeof x.reduceMotion==='boolean' && typeof x.performance==='boolean'
