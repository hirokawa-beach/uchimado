import {cssNames} from './cssNames'
import coreProviderStyles from './CoreProvider.module.css'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CalendarEvent, Settings, Task, Widget } from './model'
import { forecastWidgets, initialSettings } from './model'
import { positionedWidgets } from './widgetLayout'
import {api,errorText} from './api'
import AdminAccess from './AdminAccess'
const localStyles = {...coreProviderStyles}

export {api,errorText,ApiError} from './api'

export type Identity = {id:string|null; name:string; role:'admin'|'family'; familyId:string;adminExpiresAt:number|null}
export type Memo = {id:string; version:number; title:string; text:string; pinned:boolean; visibility:'family'|'private'; authorId?:string;createdBy:string|null; updatedAt:string}
export type Completion = {id:string;title:string;due:string|null;completedBy:string|null;completedAt:string}
type Snapshot = {events:CalendarEvent[];tasks:Task[];memos:Memo[];members:{id:string;name:string;active:boolean;version:number}[];familyName:string;completions:Completion[];user:Identity}
type Preference<T> = T & {id:string;version:number}
type Preferences = {layout:Preference<{widgets:Widget[]}>|null;settings:Preference<Settings>|null}
type Session = {setupRequired:boolean;canSetup:boolean;familyName:string;user:Identity}
type Core = {session:Session;requestAdmin:(change?:boolean)=>void;lockAdmin:()=>Promise<void>;state:Snapshot;settings:Settings;widgets:Widget[];connection:string;refresh:()=>Promise<void>;save:(kind:'events'|'tasks'|'memos',value:Record<string,unknown>,fresh?:boolean)=>Promise<void>;remove:(kind:string,id:string,version:number)=>Promise<void>;saveOccurrence:(event:CalendarEvent,cancelled?:boolean)=>Promise<void>;preferenceVersions:{layout:number|null;settings:number|null};savePreferences:(kind:'layout'|'settings',data:unknown,version?:number|null)=>Promise<number>;reauth:()=>Promise<void>}
const Context=createContext<Core|null>(null)
export function useCore(){const core=useContext(Context);if(!core)throw new Error('Missing uchimado session');return core}

export default function CoreProvider({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null)
  const [state,setState]=useState<Snapshot|null>(null)
  const [preferences,setPreferences]=useState<Preferences>({layout:null,settings:null})
  const [connection,setConnection]=useState('接続中'),[error,setError]=useState(''),[adminOpen,setAdminOpen]=useState(false),[adminChange,setAdminChange]=useState(false)
  const device=useRef(window.innerWidth<=700?'mobile':'wall').current
  const generation=useRef(0)
  const refresh=useCallback(async()=>{
    const tick=++generation.current
    const [snapshot,prefs,info]=await Promise.all([api<Snapshot>('/state'),api<Preferences>(`/preferences/${device}`),api<Session>('/session')])
    if(tick!==generation.current)return
    setState({...snapshot,user:info.user});setSession(info);setPreferences(prefs);setError('')
  },[device])
  useEffect(()=>{
    let stopped=false,timer:number|undefined,socket:WebSocket|undefined,attempt=0
    const failure=(e:unknown)=>{if(!stopped){setError(errorText(e));setConnection('同期を再試行中')}}
    const connect=()=>{
      if(stopped)return
      socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/ws`)
      socket.onopen=()=>{attempt=0;setConnection('同期済み');void refresh().catch(failure)}
      socket.onmessage=e=>{try{if(JSON.parse(e.data).type==='changed')void refresh().catch(failure)}catch{/* Reconcile on the next heartbeat/visibility check. */}}
      socket.onerror=()=>{if(!stopped)setConnection('再接続中')}
      socket.onclose=()=>{if(!stopped){setConnection('再接続中');timer=window.setTimeout(connect,Math.min(15000,1000*2**attempt++))}}
    }
    void refresh().catch(failure);connect()
    const reconcile=()=>{if(document.visibilityState==='visible')void refresh().catch(failure)}
    document.addEventListener('visibilitychange',reconcile)
    const interval=window.setInterval(reconcile,30000)
    return()=>{stopped=true;window.clearTimeout(timer);window.clearInterval(interval);socket?.close();document.removeEventListener('visibilitychange',reconcile)}
  },[refresh])
  useEffect(()=>{
    const expires=session?.user.adminExpiresAt
    if(!expires)return
    const timer=window.setTimeout(()=>void refresh().catch(e=>setError(errorText(e))),Math.max(0,expires*1000-Date.now()+50))
    return()=>window.clearTimeout(timer)
  },[session?.user.adminExpiresAt,refresh])
  async function save(kind:'events'|'tasks'|'memos',value:Record<string,unknown>,fresh=false){
    const {id,version,authorId,createdBy:_a,updatedAt:_b,calendarId:_c,exceptions:_d,occurrenceDate:_e,seriesDate:_f,seriesEndDate:_g,...data}=value
    if(kind!=='memos')data.memberId=state?.members.find(m=>m.name===data.member)?.id??null
    await api(`/records/${kind}${fresh?'':`/${id}`}`,fresh?'POST':'PUT',{version:fresh?null:version,data,...(fresh?{profile_id:authorId||null}:{})})
    await refresh()
  }
  async function remove(kind:string,id:string,version:number){await api(`/records/${kind}/${id}?version=${version}`,'DELETE');await refresh()}
  async function saveOccurrence(event:CalendarEvent,cancelled=false){
    const {id,version,createdBy:_a,updatedAt:_b,calendarId:_c,exceptions:_d,occurrenceDate,seriesDate:_f,seriesEndDate:_g,...data}=event
    await api(`/events/${id}/occurrences/${occurrenceDate||event.date}`,'PUT',{version,data:{...data,memberId:state?.members.find(m=>m.name===data.member)?.id??null,recurrence:{frequency:'none',interval:1,until:null}},cancelled});await refresh()
  }
  async function savePreferences(kind:'layout'|'settings',data:unknown,expected?:number|null){
    const current=preferences[kind]
    const result=await api<{version:number}>(`/preferences/${device}/${kind}`,'PUT',{version:expected===undefined?current?.version??null:expected,data});await refresh();return result.version
  }
  async function lockAdmin(){await api('/admin/lock','POST');await refresh()}
  if(!state||!session)return <div className={cssNames(localStyles, "auth-shell")}><div className={cssNames(localStyles, "surface auth-panel")}><h1>uchimado</h1><p role="status">{error||'暮らしの情報を読み込んでいます…'}</p>{error&&<button className="button primary" onClick={()=>void refresh().catch(e=>setError(errorText(e)))}>再接続</button>}</div></div>
  const settings=preferences.settings?Object.fromEntries(Object.entries(preferences.settings).filter(([key])=>!['id','version','createdBy','updatedAt'].includes(key))) as Settings:initialSettings
  return <Context.Provider value={{session,state,settings,widgets:preferences.layout?.widgets??positionedWidgets(forecastWidgets),connection,refresh,save,remove,saveOccurrence,savePreferences,reauth:refresh,requestAdmin:(change=false)=>{setAdminChange(change===true);setAdminOpen(true)},lockAdmin,preferenceVersions:{layout:preferences.layout?.version??null,settings:preferences.settings?.version??null}}}>
    {error&&<div className={cssNames(localStyles, "connection-error")} role="alert">{error}<button onClick={()=>void refresh().catch(e=>setError(errorText(e)))}>再取得</button></div>}{children}
    {adminOpen&&<AdminAccess session={session} change={adminChange} onDone={refresh} onClose={()=>setAdminOpen(false)}/>}
  </Context.Provider>
}
