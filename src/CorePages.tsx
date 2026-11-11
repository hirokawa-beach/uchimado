import {cssNames} from './cssNames'
import boardPageStyles from './BoardPage.module.css'
import settingsPageStyles from './SettingsPage.module.css'
import tasksPageStyles from './TasksPage.module.css'
import { useEffect, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { errorText, useCore } from './core'
import type { Memo } from './core'
import type { Repeat, Settings, Task } from './model'
import { dateKey, today } from './model'
import TouchText, {keepKeyboardInteraction} from './TouchText'
import {TouchChoice,ConfirmDialog,memberLabel} from './TouchControls'
import AccountPanel from './AccountPanel'

const localStyles = {...boardPageStyles, ...settingsPageStyles, ...tasksPageStyles}

export const noRepeat:Repeat={frequency:'none',interval:1,until:null}
const unsavedEditors=new Set<symbol>()
export const hasUnsaved=()=>unsavedEditors.size>0
export function useUnsaved(dirty:boolean){useEffect(()=>{const token=Symbol();if(dirty)unsavedEditors.add(token);const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>{unsavedEditors.delete(token);window.removeEventListener('beforeunload',warn)}},[dirty])}
export function Panel({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  return <Dialog.Root open onOpenChange={v=>{if(!v)close()}}><Dialog.Portal container={document.querySelector('[data-app-shell]')}><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="floating-window" aria-describedby={undefined} onPointerDownOutside={keepKeyboardInteraction}><div className="window-heading"><Dialog.Title>{title}</Dialog.Title><button className="icon-button" aria-label="閉じる" onClick={close}><X/></button></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
export function RepeatFields({value,onChange,disabled=false}:{value:Repeat;onChange:(r:Repeat)=>void;disabled?:boolean}){
  return <fieldset className="repeat-fields" disabled={disabled}><legend>繰り返し</legend><TouchChoice label="間隔" value={value.frequency} options={[["none","繰り返さない"],["daily","毎日"],["weekly","毎週"],["monthly","毎月"],["yearly","毎年"]]} onChange={frequency=>onChange({...value,frequency:frequency as Repeat['frequency']})}/>{value.frequency!=='none'&&<div className="date-time-grid"><TouchChoice compact label="何回おき" value={String(value.interval)} options={Array.from({length:99},(_,i)=>[String(i+1),String(i+1)] as const)} onChange={v=>onChange({...value,interval:Number(v)})}/><label className="field-label">終了日（任意）<input type="date" value={value.until||''} onChange={e=>onChange({...value,until:e.target.value||null})}/></label></div>}{value.frequency==='monthly'&&<p className="muted">同じ日付がない月はスキップします。</p>}</fieldset>
}
export function Visibility(){return <p className="muted">公開範囲：共有</p>}
export function MemberSelect({value,onChange}:{value:string;onChange:(s:string)=>void}){
  const {state}=useCore();const names=[...new Set(['家族',...state.members.filter(m=>m.active).map(m=>m.name),value])]
  return <TouchChoice label="担当" value={value} onChange={onChange} options={names.map(n=>[n,memberLabel(n)])}/>
}

export function AuthorSelect({value,onChange}:{value:string;onChange:(id:string)=>void}){
  const {state}=useCore()
  return <TouchChoice label="作成者（任意）" value={value} onChange={onChange} options={[["","個人名なし"],...state.members.filter(m=>m.active).map(m=>[m.id,m.name] as const)]}/>
}

export function TasksPage(){
  const core=useCore(),[edit,setEdit]=useState<Task|null>(null),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('')
  async function toggle(t:Task){if(busy)return;setBusy(t.id);setError('');try{await core.save('tasks',{...t,done:!t.done})}catch(e){setError(errorText(e))}finally{setBusy(null)}}
  return <section className="core-page"><div className="page-heading"><h1>タスク</h1><button className="button primary" onClick={()=>setEdit({id:'',title:'',member:'家族',done:false,due:null,priority:'normal',visibility:'family',recurrence:{...noRepeat}})}><Plus/>タスクを追加</button></div>{error&&<p className={cssNames(localStyles, "form-error tasks-error")} role="alert">{error}</p>}<div className={cssNames(localStyles, "core-list")}>{core.state.tasks.map(t=><article key={t.id} className={cssNames(localStyles, `surface resource-row task-resource ${t.done?'completed':''}`)}><button className="task-toggle" aria-label={`${t.title}を${t.done?'未完了に戻す':'完了にする'}`} aria-pressed={t.done} disabled={!!busy} onClick={()=>void toggle(t)}><span className="task-checkbox">{t.done&&<Check size={20}/>}</span></button><div className={cssNames(localStyles, "task-details")}><strong>{t.title}</strong><small>{memberLabel(t.member)} · {t.due||'期限なし'} · {{low:'低',normal:'通常',high:'高'}[t.priority||'normal']}{t.recurrence?.frequency&&t.recurrence.frequency!=='none'?' · 繰り返し':''}</small></div><button className="button subtle" aria-label={`${t.title}を編集`} disabled={!!busy} onClick={()=>setEdit(t)}>編集</button></article>)}{!core.state.tasks.length&&<div className="surface empty-resource">まだタスクはありません。やることを追加しましょう。</div>}</div><section className={cssNames(localStyles, "surface completion-history")}><h2>完了履歴</h2>{core.state.completions.length?core.state.completions.slice(0,20).map(c=><p key={c.id}><strong>{c.title}</strong><span>{new Date(c.completedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}{c.due?` · 期限 ${c.due}`:''}</span></p>):<p>完了したタスクがここに表示されます。</p>}</section>{edit&&<TaskPanel initial={edit} close={()=>setEdit(null)}/>}</section>
}
function TaskPanel({initial,close}:{initial:Task;close:()=>void}){
  const core=useCore(),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[deleting,setDeleting]=useState(false)
  const dirty=JSON.stringify(value)!==JSON.stringify(initial);useUnsaved(dirty)
  const change=(patch:Partial<Task>)=>setValue(v=>({...v,...patch}))
  async function submit(remove=false){setBusy(true);setError('');try{if(remove)await core.remove('tasks',initial.id,initial.version!);else await core.save('tasks',value,!initial.id);close()}catch(e){setError(errorText(e));setDeleting(false)}finally{setBusy(false)}}
  return <Panel title={initial.id?'タスクを編集':'新しいタスク'} close={()=>{if(!busy){if(dirty)setDiscard(true);else close()}}}><form className="event-form" onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy} className="core-fields"><TouchText label="タスク名" required maxLength={160} value={value.title} onChange={title=>change({title})}/><MemberSelect value={value.member} onChange={member=>change({member})}/><div className="date-time-grid"><label className="field-label">期限<input type="date" value={value.due||''} onChange={e=>change({due:e.target.value||null})}/></label><TouchChoice label="優先度" value={value.priority||'normal'} onChange={priority=>change({priority:priority as Task['priority']})} options={[["low","低"],["normal","通常"],["high","高"]]}/></div>{!initial.id&&<AuthorSelect value={value.authorId||''} onChange={authorId=>change({authorId})}/>}<Visibility/><RepeatFields value={value.recurrence||noRepeat} onChange={recurrence=>change({recurrence})}/><label className="toggle-row"><span>完了</span><input type="checkbox" checked={value.done} onChange={e=>change({done:e.target.checked})}/></label>{value.recurrence?.frequency!=='none'&&<p className="muted">完了すると履歴に残し、次の期限へ進みます。終了日を超えたら完了状態になります。</p>}{error&&<p className="form-error" role="alert">{error}</p>}<ConfirmDialog open={discard} onConfirm={close} onCancel={()=>setDiscard(false)}/><ConfirmDialog open={deleting} title="削除しますか？" description="この操作は取り消せません。タスクの完了履歴は残ります。" confirm="削除する" cancel="戻る" busy={busy} onConfirm={()=>void submit(true)} onCancel={()=>setDeleting(false)}/><div className="form-actions">{initial.id&&<button type="button" className="button danger-subtle" onClick={()=>setDeleting(true)}><Trash2 size={18}/>削除</button>}<button className="button primary">{busy?'保存中…':'タスクを保存'}</button></div></fieldset></form></Panel>
}
export function BoardPage(){
  const core=useCore(),[edit,setEdit]=useState<Memo|null>(null)
  const ordered=[...core.state.memos].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt))
  return <section className="core-page"><div className="page-heading"><h1>掲示板</h1><button className="button primary" onClick={()=>setEdit(newMemo())}><Plus/>メモを追加</button></div><div className={cssNames(localStyles, "memo-grid")}>{ordered.map(m=><article key={m.id} className={cssNames(localStyles, "surface memo-card memo-resource")}>{m.pinned&&<small>ピン留め</small>}<h2>{m.title||'メモ'}</h2><p>{m.text}</p><div className={cssNames(localStyles, "memo-card-footer")}><small>{core.state.members.find(u=>u.id===m.createdBy)?.name||'共有'} · {new Date(m.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</small><button className="button subtle" aria-label={`${m.title||'メモ'}を編集`} onClick={()=>setEdit(m)}>編集</button></div></article>)}{!ordered.length&&<div className="surface empty-resource">伝えたいことや、覚えておきたいことを残しましょう。</div>}</div>{edit&&<MemoPanel initial={edit} close={()=>setEdit(null)}/>}</section>
}
export function MemoPanel({initial,close}:{initial:Memo;close:()=>void}){
  const core=useCore(),[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[deleting,setDeleting]=useState(false)
  const dirty=JSON.stringify(value)!==JSON.stringify(initial);useUnsaved(dirty)
  const change=(patch:Partial<Memo>)=>setValue(v=>({...v,...patch}))
  async function submit(remove=false){setBusy(true);setError('');try{if(remove)await core.remove('memos',initial.id,initial.version);else await core.save('memos',value,!initial.id);close()}catch(e){setError(errorText(e));setDeleting(false)}finally{setBusy(false)}}
  return <Panel title={initial.id?'メモを編集':'新しいメモ'} close={()=>{if(!busy){if(dirty)setDiscard(true);else close()}}}><form className="event-form" onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy} className="core-fields"><TouchText label="見出し" maxLength={100} value={value.title} onChange={title=>change({title})}/><TouchText label="メモの内容" required multiline maxLength={2000} value={value.text} onChange={text=>change({text})}/>{!initial.id&&<AuthorSelect value={value.authorId||''} onChange={authorId=>change({authorId})}/>}<Visibility/><label className="toggle-row"><span>ピン留め</span><input type="checkbox" checked={value.pinned} onChange={e=>change({pinned:e.target.checked})}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<ConfirmDialog open={discard} onConfirm={close} onCancel={()=>setDiscard(false)}/><ConfirmDialog open={deleting} title="削除しますか？" description="この操作は取り消せません。" confirm="削除する" cancel="戻る" busy={busy} onConfirm={()=>void submit(true)} onCancel={()=>setDeleting(false)}/><div className="form-actions">{initial.id&&<button type="button" className="button danger-subtle" onClick={()=>setDeleting(true)}><Trash2 size={18}/>削除</button>}<button className="button primary">{busy?'保存中…':'メモを保存'}</button></div></fieldset></form></Panel>
}

export function SettingsDraft({render,onPreview}:{render:(settings:Settings,onChange:(s:Settings)=>void)=>ReactNode;onPreview:(settings:Settings|null)=>void}){
  const core=useCore(),[version,setVersion]=useState(core.preferenceVersions.settings),[draft,setDraft]=useState(core.settings),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[discard,setDiscard]=useState(false)
  const dirty=JSON.stringify(draft)!==JSON.stringify(core.settings);useUnsaved(dirty)
  useEffect(()=>{onPreview(draft);return()=>onPreview(null)},[draft,onPreview])
  return <><header className={cssNames(localStyles, "settings-toolbar")}><div><h1>設定</h1><p>ホームの見た目・配置は、管理者の解除なしで変更できます。</p></div><div className={cssNames(localStyles, "settings-save")}><span>{dirty?'外観に未保存の変更があります':saved?'外観を保存しました':'外観設定'}</span><button className="button primary" disabled={!dirty||busy} onClick={async()=>{setBusy(true);setError('');try{setVersion(await core.savePreferences('settings',draft,version));setSaved(true)}catch(e){setError(errorText(e))}finally{setBusy(false)}}}>{busy?'保存中…':'外観を保存'}</button>{dirty&&<button className="button subtle" onClick={()=>setDiscard(true)}>変更を戻す</button>}{error&&<p className="form-error" role="alert">{error}</p>}</div></header>{render(draft,s=>{setDraft(s);setSaved(false)})}<AccountPanel/><ConfirmDialog open={discard} confirm="変更を戻す" onCancel={()=>setDiscard(false)} onConfirm={()=>{setDraft(core.settings);setVersion(core.preferenceVersions.settings);setDiscard(false)}}/></>
}

export function newMemo():Memo{return{id:'',version:0,title:'',text:'',pinned:false,visibility:'family',createdBy:null,updatedAt:''}}
export const defaultTaskDate=()=>dateKey(today())
