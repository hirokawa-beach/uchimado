import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, Clock3, CloudSun, Droplets, House, Image, Keyboard, LayoutGrid, MapPin, Maximize2, Minimize2, Mic, Moon, PanelTop, Pencil, Plus, RotateCcw, Settings2, SlidersHorizontal, StickyNote, Sun, TrainFront, Trash2, Users, Wind, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { dateKey, eventsFor, initialSettings, jaDate, memberClass, today, widgetDefinitions } from './model'
import type { AppId, CalendarEvent, Member, Settings, Task } from './model'
import CalendarPage from './CalendarPage'
import ForecastWidget from './ForecastWidget'
import WidgetEditor, { widgetIcons } from './WidgetEditor'
import { layoutRows, layoutWidgets, positionedWidgets } from './widgetLayout'

import {editText,TouchKeyboard} from './TouchKeyboard'
import { errorText, useCore } from './core'
import { BoardPage, hasUnsaved, MemberSelect, MemoPanel, newMemo, noRepeat, RepeatFields, SettingsDraft, TasksPage, useUnsaved, Visibility } from './CorePages'

const apps: {id:AppId; title:string; icon:LucideIcon; color:string}[] = [
  {id:'home',title:'ホーム',icon:House,color:'green'},
  {id:'calendar',title:'カレンダー',icon:CalendarDays,color:'blue'},
  {id:'tasks',title:'家族タスク',icon:CheckCheck,color:'green'},
  {id:'board',title:'掲示板',icon:StickyNote,color:'amber'},
  {id:'weather',title:'天気',icon:CloudSun,color:'amber'},
  {id:'transit',title:'交通情報',icon:TrainFront,color:'blue'},
  {id:'photos',title:'写真',icon:Image,color:'rose'},
  {id:'family',title:'家族の現在地',icon:Users,color:'rose'},
  {id:'assistant',title:'音声アシスタント',icon:Mic,color:'green'},
  {id:'settings',title:'設定',icon:Settings2,color:'neutral'},
]
function IconButton({label,icon:Icon,onClick,className='',...props}:{label:string;icon:LucideIcon;onClick?:()=>void;className?:string;disabled?:boolean}) { return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} onClick={onClick} {...props}><Icon size={21}/></button> }
function MemberBadge({member}:{member:Member}) { return <span className={`member-badge ${memberClass[member]}`}><span className="member-dot"/>{member}</span> }
const transitStates = { normal: {symbol:'○',label:'平常'}, delayed: {symbol:'△',label:'遅延'}, suspended: {symbol:'×',label:'運休'} } as const
function TransitStatus({status}:{status:keyof typeof transitStates}) { const state=transitStates[status]; return <span className={`transit-status status-${status}`} role="img" aria-label={`運行状況：${state.label}`}><b aria-hidden="true">{state.symbol}</b></span> }
function Modal({open,onClose,title,description,children,wide=false}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;wide?:boolean}) {
  return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose()}}><Dialog.Portal container={document.querySelector('.app-shell')}><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={`floating-window ${wide?'wide-window':''}`} aria-describedby={description?'dialog-description':undefined}><div className="window-heading"><div><Dialog.Title>{title}</Dialog.Title>{description&&<Dialog.Description id="dialog-description">{description}</Dialog.Description>}</div><Dialog.Close asChild><IconButton label="閉じる" icon={X}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}

function App() {
  const [route,setRoute] = useState<AppId>(()=>routeFromHash())
  const core=useCore()
  const {events,tasks}=core.state
  const settings=core.settings,widgets=core.widgets
  const latestMemo=[...core.state.memos].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]
  const memo=latestMemo?.text||''
  const [saving,setSaving]=useState(false)
  const [layoutError,setLayoutError]=useState('')
  const [layoutVersion,setLayoutVersion]=useState(core.preferenceVersions.layout)
  const [editing,setEditing] = useState(()=>window.location.hash==='#customize')
  const [launcher,setLauncher] = useState(false)
  const [editor,setEditor] = useState<{event:CalendarEvent;fresh:boolean}|null>(null)
  const [memoOpen,setMemoOpen] = useState(false)
  const [toast,setToast] = useState('')
  const [now,setNow] = useState(today)
  const [fullscreen,setFullscreen] = useState(!!document.fullscreenElement)
  const currentHash=useRef(window.location.hash)
  const approvedHash=useRef<string|null>(null)
  const [pendingNavigation,setPendingNavigation]=useState<{route:AppId;customize:boolean}|null>(null)
  useEffect(()=>{const id=setInterval(()=>setNow(today()),10000);return()=>clearInterval(id)},[])
  useEffect(()=>{const update=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[])
  useEffect(()=>{const onHash=()=>{if(window.location.hash==='#main-content')return;const approved=approvedHash.current===window.location.hash;approvedHash.current=null;if(!approved&&hasUnsaved()){const target={route:routeFromHash(),customize:window.location.hash==='#customize'};history.replaceState(null,'',currentHash.current||'#home');setPendingNavigation(target);return}currentHash.current=window.location.hash;setRoute(routeFromHash());setEditing(window.location.hash==='#customize')};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[])
  useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(id)}},[toast])
  function navigate(id:AppId,discard=false) { if(!discard&&hasUnsaved()){setPendingNavigation({route:id,customize:false});return}approvedHash.current=`#${id}`;setLauncher(false);setEditing(false);setRoute(id);window.location.hash=id }
  function startLayoutEdit(discard=false) {if(!discard&&hasUnsaved()){setPendingNavigation({route:'home',customize:true});return}setLayoutVersion(core.preferenceVersions.layout);approvedHash.current='#customize';setLauncher(false);setRoute('home');setEditing(true);window.location.hash='customize' }
  async function toggleFullscreen() { try { if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen() } catch { setToast('このブラウザーの全画面表示機能をご利用ください（PCではF11）。') } }
  function newEvent(day=dateKey(today()),start='09:00') { const hour=Number(start.slice(0,2));setEditor({fresh:true,event:{id:'',title:'',color:'#53786c',visibility:'family',timezone:'Asia/Tokyo',recurrence:{...noRepeat},date:day,endDate:day,start,end:hour===23?'23:59':`${String(hour+1).padStart(2,'0')}:00`,allDay:false,member:'家族',location:'',note:''}}) }
  const background=settings.background==='custom'?settings.customBackground:`/backgrounds/${settings.background}.jpg`
  const themeStyle={'--background-image':`url("${background}")`,'--background-blur':`${settings.performance?0:settings.blur}px`,'--widget-alpha':settings.widgetOpacity/100} as CSSProperties
  const defaultLayout=!editing&&layoutRows(widgets)<=2
  return <div className={`app-shell ${route==='home'?'is-home':''} ${route==='calendar'?'is-calendar':''} ${editing?'is-customizing':''} ${defaultLayout?'default-layout':''} ${settings.theme} ${settings.reduceMotion?'reduce-motion':''} ${settings.performance?'performance-mode':''}`} style={themeStyle}>
    <div className="wallpaper" aria-hidden="true"/><div className="wallpaper-wash" aria-hidden="true"/>
    <a className="skip-link" href="#main-content">メインコンテンツへ</a>
    <main id="main-content" className={`main-content ${route==='home'?'home-content':''}`}>
    {route==='home'?(editing?<><WidgetEditor initial={widgets} saving={saving} onCancel={()=>navigate('home',true)} onSave={async value=>{if(saving)return;setSaving(true);setLayoutError('');try{await core.savePreferences('layout',{widgets:positionedWidgets(value)},layoutVersion);navigate('home',true);setToast('ホームの配置を保存しました')}catch(e){setLayoutError(errorText(e))}finally{setSaving(false)}}}/>{saving&&<p role="status">配置を保存中…</p>}{layoutError&&<p role="alert" className="form-error">{layoutError}</p>}</>:<>
      <h1 className="sr-only">ホーム</h1>
      <section className="widget-grid" aria-label="ホームウィジェット">
        {layoutWidgets(widgets).map(widget=>{
          const info=widgetDefinitions[widget.id],Icon=widgetIcons[widget.id]
          return <article key={widget.id} data-widget={widget.id} className={`widget surface widget-${widget.id} size-${widget.size}`} style={{'--widget-x':widget.x,'--widget-y':widget.y,'--widget-w':widget.w,'--widget-h':widget.h,'--widget-order':(widget.y-1)*12+widget.x} as CSSProperties}>
            <button className="widget-open" aria-label={`${info.title}を開く`} onClick={()=>navigate(info.app)}/>
            <div className="widget-heading"><h2><Icon size={19}/>{info.title}</h2></div>
            <div className="widget-body">
              {widget.id==='clock'&&<div className="clock-display"><div className="clock-date">{jaDate(now,{month:'long',day:'numeric'})}<span>{jaDate(now,{weekday:'long'})}</span></div><div className="clock-time">{jaDate(now,{hour:'2-digit',minute:'2-digit',hour12:false})}</div></div>}
              {widget.id==='schedule'&&<><div className="schedule-summary"><strong>{eventsFor(events,dateKey(now)).length}<small>件の予定</small></strong></div><div className="schedule-list">{eventsFor(events,dateKey(now)).slice(0,3).map(e=><div className={`schedule-row event-${memberClass[e.member]}`} key={`${e.id}:${e.occurrenceDate||e.date}`}><time>{e.allDay?'終日':e.start}</time><span><strong>{e.title}</strong><small>{e.location||e.member}</small></span><span className={`tiny-avatar ${memberClass[e.member]}`}>{e.member.slice(0,1)}</span></div>)}{eventsFor(events,dateKey(now)).length===0&&<div className="empty-compact">今日は予定がありません。<button className="text-button" onClick={()=>newEvent()}>予定を追加する</button></div>}</div></>}
              {widget.id==='forecast'&&<ForecastWidget now={now}/>}
              {widget.id==='weather'&&<><div className="weather-location"><MapPin size={15}/>神戸市<span className="mock-text">サンプル</span></div><div className="weather-current"><div><strong>18<span>°</span></strong><p>晴れ、ときどきくもり</p></div><CloudSun className="weather-art" size={96} strokeWidth={1.2}/></div><div className="weather-highlow"><div><span>最高</span><b>20°</b></div><div><span>最低</span><b>12°</b></div></div><div className="weather-facts"><span><Droplets size={16}/>降水 10%</span><span><Wind size={16}/>北東 2m/s</span></div></>}
              {widget.id==='tasks'&&<><div className="task-summary"><span>今日のやること</span><span>{tasks.filter(t=>t.done).length} / {tasks.length} 完了</span></div><div className="task-list">{tasks.slice(0,4).map(t=><div key={t.id} className={`task-row ${t.done?'completed':''}`}><button className="task-toggle" aria-label={`${t.title}を${t.done?'未完了に戻す':'完了にする'}`} aria-pressed={t.done} disabled={saving} onClick={async()=>{setSaving(true);try{await core.save('tasks',{...t,done:!t.done});setToast(t.recurrence?.frequency!=='none'?'完了を記録し、次の期限に更新しました':'タスクを更新しました')}catch(e){setToast(errorText(e))}finally{setSaving(false)}}}><span className="task-checkbox">{t.done&&<Check size={17}/>}</span></button><span>{t.title}</span><span className={`tiny-avatar ${memberClass[t.member]}`}>{t.member.slice(0,1)}</span></div>)}</div></>}
              {widget.id==='memo'&&<><div className="memo-paper"><span className="memo-author"><span className="tiny-avatar rose">{(core.state.members.find(u=>u.id===latestMemo?.createdBy)?.name||'共有').slice(0,1)}</span><strong>{core.state.members.find(u=>u.id===latestMemo?.createdBy)?.name||'家族'}</strong><span>から、みんなへ</span></span><p>{memo||'家族へのメッセージを残そう。'}</p></div><button className="widget-footer-link" onClick={()=>setMemoOpen(true)}><Pencil size={16}/>メモを書きかえる<ArrowRight size={17}/></button></>}
              {widget.id==='transit'&&<><div className="transit-line"><span className="train-line blue-line">JR</span><div><strong>JR神戸線</strong><small>大阪・三ノ宮方面</small></div><TransitStatus status="normal"/></div><div className="transit-line"><span className="train-line brown-line">HK</span><div><strong>阪急神戸線</strong><small>大阪梅田方面</small></div><TransitStatus status="normal"/></div><p className="transit-caption">サンプル情報・実際の運行状況ではありません</p></>}
            </div>
          </article>
        })}
        {!widgets.length&&<div className="home-empty surface"><strong>ウィジェットを追加しよう</strong><button className="button primary" onClick={()=>startLayoutEdit()}><Plus size={21}/>ウィジェットを選ぶ</button></div>}
      </section>
    </>):route==='calendar'?<CalendarPage events={events} onAdd={newEvent} onEdit={e=>setEditor({event:e,fresh:false})}/>:route==='tasks'?<TasksPage/>:route==='board'?<BoardPage/>:route==='settings'?<SettingsDraft render={(draft,onChange)=><SettingsPage settings={draft} onChange={onChange} notify={setToast} onLayoutEdit={()=>startLayoutEdit()}/>}/>:<PrototypePage id={route} navigate={navigate} tasks={tasks} memo={memo}/>}
    </main>
    <nav className="floating-dock surface" aria-label="メインナビゲーション"><button className={`dock-item launcher-button ${launcher?'active':''}`} onClick={()=>setLauncher(true)} aria-label="メニューを開く"><LayoutGrid size={24}/><span>メニュー</span></button><span className="dock-divider"/>{(['home','calendar','tasks','board','photos'] as AppId[]).map(id=>{const app=apps.find(a=>a.id===id)!,Icon=app.icon;return <button key={id} className={`dock-item ${route===id?'active':''}`} aria-current={route===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={24}/><span>{app.title}</span></button>})}<span className="dock-divider"/><button className={`dock-item ${route==='assistant'?'active':''}`} onClick={()=>navigate('assistant')}><Mic size={24}/><span>音声</span></button></nav>
    <Modal open={launcher} onClose={()=>setLauncher(false)} title="アプリとメニュー" wide><div className="launcher-grid">{apps.map(a=><button className="launcher-app" onClick={()=>navigate(a.id)} key={a.id}><span className={`app-icon ${a.color}`}><a.icon size={30}/></span><strong>{a.title}</strong>{!['home','calendar','tasks','board','settings'].includes(a.id)&&<span className="prototype-tag">プレビュー</span>}</button>)}</div><p className="connection-text">{core.state.user.name} · {core.connection}{core.state.user.role==='admin'?' · 管理者解除中':''}</p><div className="launcher-actions"><button className="button subtle" onClick={()=>startLayoutEdit()}><LayoutGrid size={20}/>ウィジェットを配置</button><button className="button subtle" onClick={()=>{setLauncher(false);void toggleFullscreen()}}>{fullscreen?<Minimize2 size={20}/>:<Maximize2 size={20}/>}{fullscreen?'全画面表示を終了':'全画面にする'}</button></div></Modal>
    {editor&&<EventEditor key={editor.event.id} initial={editor.event} fresh={editor.fresh} onClose={()=>setEditor(null)} onSave={async(value,scope)=>{if(scope==='occurrence')await core.saveOccurrence(value);else await core.save('events',value,editor.fresh);setEditor(null);setToast('予定を保存しました')}} onDelete={async(id,scope)=>{if(scope==='occurrence')await core.saveOccurrence(editor.event,true);else await core.remove('events',id,editor.event.version!);setEditor(null);setToast('予定を削除しました')}}/>}
    {memoOpen&&<MemoPanel initial={latestMemo||newMemo()} close={()=>setMemoOpen(false)}/>}
    {pendingNavigation&&<Modal open title="未保存の変更" onClose={()=>setPendingNavigation(null)}><div className="event-form"><p>変更を保存せずに移動しますか？</p><div className="form-actions"><button className="button subtle" onClick={()=>setPendingNavigation(null)}>編集を続ける</button><button className="button danger" onClick={()=>{const target=pendingNavigation;setPendingNavigation(null);if(target.customize)startLayoutEdit(true);else navigate(target.route,true)}}>破棄して移動</button></div></div></Modal>}
    {toast&&<div className="toast surface" role="status"><Check size={19}/>{toast}</div>}
  </div>
}
function routeFromHash():AppId {const hash=window.location.hash.slice(1);return apps.some(a=>a.id===hash)?hash as AppId:'home'}

type TextField = 'title'|'location'|'note'
function EventEditor({initial,fresh,onClose,onSave,onDelete}:{initial:CalendarEvent;fresh:boolean;onClose:()=>void;onSave:(e:CalendarEvent,scope:'series'|'occurrence')=>Promise<void>;onDelete:(id:string,scope:'series'|'occurrence')=>Promise<void>}) {
  const core=useCore()
  const [scope,setScope]=useState<'series'|'occurrence'>(initial.occurrenceDate?'occurrence':'series')
  const [busy,setBusy]=useState(false)
  const [value,setValue]=useState({...initial})
  const [error,setError]=useState('')
  const [discard,setDiscard]=useState(false)
  const [deleteConfirm,setDeleteConfirm]=useState(false)
  const [keyboard,setKeyboard]=useState(false)
  const [field,setField]=useState<TextField>('title')
  const inputRefs=useRef<Partial<Record<TextField,HTMLInputElement|HTMLTextAreaElement|null>>>({})
  const dirty=JSON.stringify(initial)!==JSON.stringify(value)
  useUnsaved(dirty)
  function close() {if(busy)return;if(dirty)setDiscard(true);else onClose()}
  function change<K extends keyof CalendarEvent>(key:K,v:CalendarEvent[K]) {setValue(p=>({...p,[key]:v}));setDiscard(false);setError('')}
  function typeKey(key:string) {const el=inputRefs.current[field]; const start=el?.selectionStart??value[field].length,end=el?.selectionEnd??start;const result=editText(value[field],start,end,key);const text=field==='note'?result.text:result.text.replace(/[\r\n]/g,' ');change(field,text.slice(0,field==='title'?80:field==='location'?120:1000));requestAnimationFrame(()=>{el?.focus({preventScroll:true});el?.setSelectionRange(result.cursor,result.cursor)})}
  async function save() {if(busy)return;if(!value.title.trim()){setError('予定のタイトルを入力してください。');inputRefs.current.title?.focus();return}if(!value.date||!value.endDate||value.endDate<value.date){setError('終了日は開始日以降を選んでください。');return}if(!value.allDay&&(!value.start||!value.end||`${value.date}T${value.start}`>=`${value.endDate}T${value.end}`)){setError('終了日時は開始日時より後を選んでください。');return}setBusy(true);setError('');try{await onSave({...value,title:value.title.trim()},scope)}catch(e){setError(errorText(e))}finally{setBusy(false)}}
  return <Modal open onClose={close} title={fresh?'新しい予定':'予定を編集'} description="家族のカレンダーに、予定を残しましょう。" wide>
    <form className="event-form" onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="core-fields">
      {discard&&<div className="confirmation"><strong>変更内容を破棄して閉じますか？</strong><div><button type="button" className="button subtle" onClick={()=>setDiscard(false)}>編集を続ける</button><button type="button" className="button danger" onClick={onClose}>破棄して閉じる</button></div></div>}
      <label className="field-label">予定のタイトル<input ref={el=>{inputRefs.current.title=el}} value={value.title} onFocus={()=>setField('title')} onChange={e=>change('title',e.target.value)} placeholder="どんな予定ですか？" maxLength={80}/></label>
      <MemberSelect value={value.member} onChange={v=>change('member',v)}/>
      {initial.occurrenceDate&&<div className="scope-options"><label className="field-label">変更する範囲<select value={scope} onChange={e=>{const next=e.target.value as 'series'|'occurrence';setScope(next);const master=core.state.events.find(v=>v.id===initial.id)!;setValue(next==='series'?{...master,version:initial.version}:{...initial})}}><option value="occurrence">この回だけ</option><option value="series">シリーズ全体</option></select></label>{scope==='series'&&<p>シリーズ全体の更新では、過去の回も含めて変更し、個別に変更・取消した内容をリセットします。</p>}</div>}
      <Visibility/>
      <label className="field-label">予定の色<input type="color" value={value.color||'#53786c'} onChange={e=>change('color',e.target.value)}/></label>
      <RepeatFields value={value.recurrence||noRepeat} onChange={v=>change('recurrence',v)} disabled={scope==='occurrence'}/>
      <p className="muted">時刻は日本時間（Asia/Tokyo）です。</p>
      <label className="toggle-row"><span>終日の予定</span><input type="checkbox" className="switch-input" checked={value.allDay} onChange={e=>change('allDay',e.target.checked)}/></label>
      <div className="date-time-grid"><label className="field-label">開始日<input aria-label="開始日" type="date" value={value.date} onChange={e=>{const d=e.target.value;setValue(p=>({...p,date:d,endDate:p.endDate<d?d:p.endDate}))}} required/></label><label className="field-label">終了日<input aria-label="終了日" type="date" value={value.endDate} min={value.date} onChange={e=>change('endDate',e.target.value)} required/></label>{!value.allDay&&<><TimeSelect label="開始時刻" value={value.start} onChange={v=>change('start',v)}/><TimeSelect label="終了時刻" value={value.end} onChange={v=>change('end',v)}/></>}</div>
      <label className="field-label">場所<span className="optional">任意</span><input ref={el=>{inputRefs.current.location=el}} value={value.location} onFocus={()=>setField('location')} onChange={e=>change('location',e.target.value)} placeholder="場所を追加" maxLength={120}/></label>
      <label className="field-label">メモ<span className="optional">任意</span><textarea ref={el=>{inputRefs.current.note=el}} value={value.note} onFocus={()=>setField('note')} onChange={e=>change('note',e.target.value)} placeholder="持ちものや、家族へのひとこと" rows={2} maxLength={1000}/></label>
      <button type="button" className="button keyboard-toggle subtle" aria-expanded={keyboard} onClick={()=>setKeyboard(p=>!p)}><Keyboard size={20}/>{keyboard?'画面キーボードを閉じる':'画面キーボードを開く'}<span>{ {title:'タイトル',location:'場所',note:'メモ'}[field]}に入力</span></button>
      {keyboard&&<TouchKeyboard onKey={typeKey}/>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {deleteConfirm&&<div className="confirmation"><strong>「{value.title}」を削除しますか？</strong><div><button className="button subtle" type="button" onClick={()=>setDeleteConfirm(false)}>戻る</button><button className="button danger" type="button" onClick={async()=>{setBusy(true);setError('');try{await onDelete(value.id,scope)}catch(e){setError(errorText(e))}finally{setBusy(false)}}}>削除する</button></div></div>}
      <div className="form-actions">{!fresh&&<button type="button" className="button danger-subtle" onClick={()=>setDeleteConfirm(true)}><Trash2 size={18}/>削除</button>}<span className="flex-1"/><button type="button" className="button subtle" onClick={close}>キャンセル</button><button type="submit" className="button primary"><Check size={20}/>{busy?'保存中…':'保存する'}</button></div>
    </fieldset></form></Modal>
}
function TimeSelect({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {return <fieldset className="time-select"><legend>{label}</legend><div><select aria-label={`${label} 時`} value={value.slice(0,2)} onChange={e=>onChange(`${e.target.value}:${value.slice(3)}`)}>{Array.from({length:24},(_,i)=><option key={i}>{String(i).padStart(2,'0')}</option>)}</select><span>:</span><select aria-label={`${label} 分`} value={value.slice(3)} onChange={e=>onChange(`${value.slice(0,2)}:${e.target.value}`)}>{Array.from({length:60},(_,i)=><option key={i}>{String(i).padStart(2,'0')}</option>)}</select></div></fieldset>}
function SettingsPage({settings,onChange,notify,onLayoutEdit}:{settings:Settings;onChange:(s:Settings)=>void;notify:(s:string)=>void;onLayoutEdit:()=>void}) {
  const [uploading,setUploading]=useState(false)
  async function upload(file:File|undefined) {if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notify('JPEG・PNG・WebPの写真を選んでください。');return}if(file.size>12*1024*1024){notify('12MB以下の写真を選んでください。');return}setUploading(true);try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,1920/bitmap.width);const canvas=document.createElement('canvas');canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();onChange({...settings,background:'custom',customBackground:canvas.toDataURL('image/jpeg',0.78)});notify('背景写真を変更しました')}catch{notify('この画像を読み込めませんでした。別の画像をお試しください。')}finally{setUploading(false)}}
  return <section className="settings-page"><div className="page-heading"><div><p className="date-line">あなたらしい、心地よさに。</p><h1>ホームの設定</h1></div><span className="settings-version">Kagiroi v1</span></div><div className="settings-grid"><section className="surface settings-section"><h2><Image size={22}/>背景の写真</h2><p>暮らしに馴染む、好きな景色を。</p><div className="background-options">{([['lake','山と湖'],['forest','深い森'],['coast','海辺']] as const).map(([key,title])=><button className={`background-option ${settings.background===key?'selected':''}`} key={key} onClick={()=>onChange({...settings,background:key})} aria-pressed={settings.background===key}><img src={`/backgrounds/${key}.jpg`} alt={title}/><span>{title}{settings.background===key&&<Check size={18}/>}</span></button>)}</div><label className="button subtle upload-button"><Plus size={18}/>{uploading?'写真を読み込み中…':'自分の写真を使う'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}} disabled={uploading}/></label>{settings.customBackground&&<button className="button subtle" onClick={()=>onChange({...settings,background:'custom'})}>保存した写真に切替</button>}<label className="slider-label">背景のぼかし <strong>{settings.blur}px</strong><input aria-label="背景のぼかし" type="range" min={0} max={20} value={settings.blur} onChange={e=>onChange({...settings,blur:Number(e.target.value)})}/></label><small className="muted">写真は端末内で縮小し、外観の保存時に家族のサーバーへ保存します。</small></section><div className="settings-column"><section className="surface settings-section"><h2><LayoutGrid size={22}/>ホームの配置</h2><button className="button subtle" onClick={onLayoutEdit}><LayoutGrid size={19}/>ウィジェットを選んで配置</button></section><section className="surface settings-section"><h2><Sun size={22}/>外観</h2><p>時間や気分に合わせて、見やすく。</p><div className="theme-options"><button className={settings.theme==='light'?'selected':''} aria-pressed={settings.theme==='light'} onClick={()=>onChange({...settings,theme:'light'})}><Sun size={26}/>ライト{settings.theme==='light'&&<Check size={18}/>}</button><button className={settings.theme==='dark'?'selected':''} aria-pressed={settings.theme==='dark'} onClick={()=>onChange({...settings,theme:'dark'})}><Moon size={26}/>ダーク{settings.theme==='dark'&&<Check size={18}/>}</button></div></section><section className="surface settings-section"><h2><PanelTop size={22}/>ウィジェットの透明感</h2><label className="slider-label">透明度<strong>{100-settings.widgetOpacity}%</strong><input aria-label="ウィジェットの透明度" type="range" min={0} max={60} value={100-settings.widgetOpacity} onChange={e=>onChange({...settings,widgetOpacity:100-Number(e.target.value)})}/></label><div className="opacity-scale"><span>不透明</span><span>よく透ける</span></div><div className="opacity-preview" style={{backgroundImage:`url("${settings.background==='custom'?settings.customBackground:`/backgrounds/${settings.background}.jpg`}")`}}><div style={{backgroundColor:`rgb(${settings.theme==='dark'?'32 48 42':'249 252 249'} / ${settings.widgetOpacity/100})`}}><strong>家族のメモ</strong><span>プレビュー</span></div></div></section><section className="surface settings-section"><h2><SlidersHorizontal size={22}/>動きとパフォーマンス</h2><label className="toggle-row"><span><strong>アニメーションを控える</strong><small>端末のモーション軽減設定も反映します。</small></span><input type="checkbox" className="switch-input" checked={settings.reduceMotion} onChange={e=>onChange({...settings,reduceMotion:e.target.checked})}/></label><label className="toggle-row"><span><strong>軽量モード</strong><small>背景とガラスのぼかしを止め、描画負荷を抑えます。</small></span><input type="checkbox" className="switch-input" checked={settings.performance} onChange={e=>onChange({...settings,performance:e.target.checked})}/></label><button className="button subtle" onClick={()=>{onChange({...initialSettings});notify('外観設定を初期値に戻しました')}}><RotateCcw size={18}/>外観をリセット</button></section></div></div><p className="settings-note">予定・タスク・メモは家族のサーバーに保存されます。外観は上の保存ボタンで保存してください。</p></section>
}
function PrototypePage({id,navigate,tasks,memo}:{id:AppId;navigate:(id:AppId)=>void;tasks:Task[];memo:string}) {
  const app=apps.find(a=>a.id===id)!,Icon=app.icon
  const messages:Partial<Record<AppId,string>>={tasks:'家族ごとの担当や期限をまとめる画面を予定しています。いまはホームでタスクの完了を切り替えられます。',board:'連絡やお買いものメモを、家族で共有する画面を予定しています。ホームのメモは編集・保存できます。',weather:'時間別予報などを表示する予定です。ホームの現在の天気・5日間予報はサンプルデータです。',transit:'登録した路線の運行状況を確認する画面を予定しています。ホームの交通情報はモックです。',photos:'家族のアルバムやスライドショーを楽しむ画面を予定しています。',family:'本人の明示的な許可を得たメンバーだけが、現在地を共有できる設計を予定しています。現在は位置情報を取得していません。',assistant:'予定の登録や家族への連絡を、声で操作する機能を予定しています。現在はマイクを使用していません。'}
  return <section className="prototype-page"><div className="page-heading"><div><p className="date-line">わが家のアプリ</p><h1>{app.title}</h1></div><button className="button subtle" onClick={()=>navigate('home')}><ArrowLeft size={19}/>ホームへ</button></div><div className="surface prototype-content"><span className={`app-icon large ${app.color}`}><Icon size={42}/></span><span className="prototype-label">専用画面のプロトタイプ</span><h2>これから、もっと便利に。</h2><p>{messages[id]}</p>{id==='tasks'&&<div className="preview-task-list">{tasks.map(t=><div key={t.id}><span>{t.done?<Check size={19}/>:<Clock3 size={19}/>}</span><strong>{t.title}</strong><MemberBadge member={t.member}/></div>)}</div>}{id==='board'&&<blockquote className="preview-memo">{memo}</blockquote>}{id==='photos'&&<div className="photo-preview">{['lake','forest','coast'].map(p=><img src={`/backgrounds/${p}.jpg`} alt="サンプルの風景写真" key={p}/>)}</div>}<button className="button primary" onClick={()=>navigate('home')}><House size={19}/>ホームに戻る</button><small>この画面の専用機能・外部サービス連携は未実装です。</small></div></section>
}
export default App
