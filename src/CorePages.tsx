import { useEffect, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { errorText, useCore } from './core'
import type { Memo } from './core'
import type { Repeat, Settings, Task } from './model'
import { dateKey, today } from './model'
import TouchText from './TouchText'
import AccountPanel from './AccountPanel'

export const noRepeat:Repeat={frequency:'none',interval:1,until:null}
const unsavedEditors=new Set<symbol>()
export const hasUnsaved=()=>unsavedEditors.size>0
export function useUnsaved(dirty:boolean){useEffect(()=>{const token=Symbol();if(dirty)unsavedEditors.add(token);const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>{unsavedEditors.delete(token);window.removeEventListener('beforeunload',warn)}},[dirty])}
export function Panel({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  return <Dialog.Root open onOpenChange={v=>{if(!v)close()}}><Dialog.Portal container={document.querySelector('.app-shell')}><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="floating-window" aria-describedby={undefined}><div className="window-heading"><Dialog.Title>{title}</Dialog.Title><button className="icon-button" aria-label="閉じる" onClick={close}><X/></button></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
export function RepeatFields({value,onChange,disabled=false}:{value:Repeat;onChange:(r:Repeat)=>void;disabled?:boolean}){
  return <fieldset className="repeat-fields" disabled={disabled}><legend>繰り返し</legend><div className="date-time-grid"><label className="field-label">間隔<select value={value.frequency} onChange={e=>onChange({...value,frequency:e.target.value as Repeat['frequency']})}>{[['none','繰り返さない'],['daily','毎日'],['weekly','毎週'],['monthly','毎月'],['yearly','毎年']].map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label>{value.frequency!=='none'&&<><label className="field-label">何回おき<input type="number" min={1} max={99} value={value.interval} onChange={e=>onChange({...value,interval:Number(e.target.value)})}/></label><label className="field-label">終了日（任意）<input type="date" value={value.until||''} onChange={e=>onChange({...value,until:e.target.value||null})}/></label></>}</div>{value.frequency==='monthly'&&<p className="muted">同じ日付がない月はスキップします。</p>}</fieldset>
}
export function Visibility(){return <p className="muted">公開範囲：家族共通</p>}
export function MemberSelect({value,onChange}:{value:string;onChange:(s:string)=>void}){
  const {state}=useCore();const names=[...new Set(['家族',...state.members.filter(m=>m.active).map(m=>m.name),value])]
  return <label className="field-label">担当<select value={value} onChange={e=>onChange(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></label>
}

export function TasksPage(){
  const core=useCore(),[edit,setEdit]=useState<Task|null>(null)
  return <section className="core-page"><div className="page-heading"><h1>家族タスク</h1><button className="button primary" onClick={()=>setEdit({id:'',title:'',member:'家族',done:false,due:null,priority:'normal',visibility:'family',recurrence:{...noRepeat}})}><Plus/>タスクを追加</button></div><div className="core-list">{core.state.tasks.map(t=><button key={t.id} className={`surface resource-row ${t.done?'completed':''}`} onClick={()=>setEdit(t)}><span className="task-checkbox">{t.done&&<Check size={18}/>}</span><span><strong>{t.title}</strong><small>{t.member} · {t.due||'期限なし'} · {{low:'低',normal:'通常',high:'高'}[t.priority||'normal']}{t.recurrence?.frequency!=='none'?' · 繰り返し':''}{t.visibility==='private'?' · 自分だけ':''}</small></span><span>編集</span></button>)}{!core.state.tasks.length&&<div className="surface empty-resource">まだタスクはありません。家族でやることを追加しましょう。</div>}</div><section className="surface completion-history"><h2>完了履歴</h2>{core.state.completions.length?core.state.completions.slice(0,20).map(c=><p key={c.id}><strong>{c.title}</strong><span>{new Date(c.completedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}{c.due?` · 期限 ${c.due}`:''}</span></p>):<p>完了したタスクがここに表示されます。</p>}</section>{edit&&<TaskPanel initial={edit} close={()=>setEdit(null)}/>}</section>
}
function TaskPanel({initial,close}:{initial:Task;close:()=>void}){
  const core=useCore(),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[deleting,setDeleting]=useState(false)
  const dirty=JSON.stringify(value)!==JSON.stringify(initial);useUnsaved(dirty)
  const change=(patch:Partial<Task>)=>setValue(v=>({...v,...patch}))
  async function submit(remove=false){setBusy(true);setError('');try{if(remove)await core.remove('tasks',initial.id,initial.version!);else await core.save('tasks',value,!initial.id);close()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
  return <Panel title={initial.id?'タスクを編集':'新しいタスク'} close={()=>{if(!busy){if(dirty)setDiscard(true);else close()}}}><form className="event-form" onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy} className="core-fields"><TouchText label="タスク名" required maxLength={160} value={value.title} onChange={title=>change({title})}/><MemberSelect value={value.member} onChange={member=>change({member})}/><div className="date-time-grid"><label className="field-label">期限<input type="date" value={value.due||''} onChange={e=>change({due:e.target.value||null})}/></label><label className="field-label">優先度<select value={value.priority} onChange={e=>change({priority:e.target.value as Task['priority']})}><option value="low">低</option><option value="normal">通常</option><option value="high">高</option></select></label></div><Visibility/><RepeatFields value={value.recurrence||noRepeat} onChange={recurrence=>change({recurrence})}/><label className="toggle-row"><span>完了</span><input type="checkbox" checked={value.done} onChange={e=>change({done:e.target.checked})}/></label>{value.recurrence?.frequency!=='none'&&<p className="muted">完了すると履歴に残し、次の期限へ進みます。終了日を超えたら完了状態になります。</p>}{error&&<p className="form-error" role="alert">{error}</p>}{discard&&<div className="confirmation"><p>未保存の変更を破棄しますか？</p><button type="button" className="button danger" onClick={close}>破棄して閉じる</button><button type="button" className="button subtle" onClick={()=>setDiscard(false)}>編集を続ける</button></div>}{deleting&&<div className="confirmation"><p>このタスクを削除しますか？完了履歴は残ります。</p><button type="button" className="button danger" onClick={()=>void submit(true)}>削除する</button><button type="button" className="button subtle" onClick={()=>setDeleting(false)}>戻る</button></div>}<div className="form-actions">{initial.id&&<button type="button" className="button danger-subtle" onClick={()=>setDeleting(true)}><Trash2 size={18}/>削除</button>}<button className="button primary">{busy?'保存中…':'タスクを保存'}</button></div></fieldset></form></Panel>
}
export function BoardPage(){
  const core=useCore(),[edit,setEdit]=useState<Memo|null>(null)
  const ordered=[...core.state.memos].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt))
  return <section className="core-page"><div className="page-heading"><h1>家族の掲示板</h1><button className="button primary" onClick={()=>setEdit({id:'',version:0,title:'',text:'',pinned:false,visibility:'family',createdBy:null,updatedAt:''})}><Plus/>メモを追加</button></div><div className="memo-grid">{ordered.map(m=><button key={m.id} className="surface memo-card" onClick={()=>setEdit(m)}>{m.pinned&&<small>ピン留め</small>}<h2>{m.title||'家族へのメモ'}</h2><p>{m.text}</p><small>{core.state.members.find(u=>u.id===m.createdBy)?.name||'家族'} · {new Date(m.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}{m.visibility==='private'?' · 自分だけ':''}</small></button>)}{!ordered.length&&<div className="surface empty-resource">家族に伝えたいことを残しましょう。</div>}</div>{edit&&<MemoPanel initial={edit} close={()=>setEdit(null)}/>}</section>
}
export function MemoPanel({initial,close}:{initial:Memo;close:()=>void}){
  const core=useCore(),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[deleting,setDeleting]=useState(false)
  const dirty=JSON.stringify(value)!==JSON.stringify(initial);useUnsaved(dirty)
  const change=(patch:Partial<Memo>)=>setValue(v=>({...v,...patch}))
  async function submit(remove=false){setBusy(true);setError('');try{if(remove)await core.remove('memos',initial.id,initial.version);else await core.save('memos',value,!initial.id);close()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
  return <Panel title={initial.id?'メモを編集':'家族へのメモ'} close={()=>{if(!busy){if(dirty)setDiscard(true);else close()}}}><form className="event-form" onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy} className="core-fields"><TouchText label="見出し" maxLength={100} value={value.title} onChange={title=>change({title})}/><TouchText label="メモの内容" required multiline maxLength={2000} value={value.text} onChange={text=>change({text})}/><Visibility/><label className="toggle-row"><span>ピン留め</span><input type="checkbox" checked={value.pinned} onChange={e=>change({pinned:e.target.checked})}/></label>{error&&<p className="form-error" role="alert">{error}</p>}{discard&&<div className="confirmation"><p>未保存の変更を破棄しますか？</p><button type="button" className="button danger" onClick={close}>破棄して閉じる</button><button type="button" className="button subtle" onClick={()=>setDiscard(false)}>編集を続ける</button></div>}{deleting&&<div className="confirmation"><p>このメモを削除しますか？</p><button type="button" className="button danger" onClick={()=>void submit(true)}>削除する</button><button type="button" className="button subtle" onClick={()=>setDeleting(false)}>戻る</button></div>}<div className="form-actions">{initial.id&&<button type="button" className="button danger-subtle" onClick={()=>setDeleting(true)}><Trash2 size={18}/>削除</button>}<button className="button primary">{busy?'保存中…':'メモを保存'}</button></div></fieldset></form></Panel>
}

export function SettingsDraft({render}:{render:(settings:Settings,onChange:(s:Settings)=>void)=>ReactNode}){
  const core=useCore(),[version,setVersion]=useState(core.preferenceVersions.settings),[draft,setDraft]=useState(core.settings),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
  const dirty=JSON.stringify(draft)!==JSON.stringify(core.settings);useUnsaved(dirty)
  return <><div className="settings-save surface"><span>{dirty?'外観に未保存の変更があります':saved?'外観を保存しました':'外観設定'}</span><button className="button primary" disabled={!dirty||busy} onClick={async()=>{setBusy(true);setError('');try{setVersion(await core.savePreferences('settings',draft,version));setSaved(true)}catch(e){setError(errorText(e))}finally{setBusy(false)}}}>{busy?'保存中…':'外観を保存'}</button>{dirty&&<button className="button subtle" onClick={()=>{setDraft(core.settings);setVersion(core.preferenceVersions.settings)}}>変更を戻す</button>}{error&&<p className="form-error" role="alert">{error}</p>}</div>{render(draft,s=>{setDraft(s);setSaved(false)})}<AccountPanel/></>
}

export function newMemo():Memo{return{id:'',version:0,title:'',text:'',pinned:false,visibility:'family',createdBy:null,updatedAt:''}}
export const defaultTaskDate=()=>dateKey(today())
