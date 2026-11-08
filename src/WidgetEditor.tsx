import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, CheckCheck, Clock3, CloudSun, Grip, Plus, StickyNote, Sun, TrainFront, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { jaDate, today, widgetDefinitions } from './model'
import type { Widget, WidgetId } from './model'
import { layoutRows, layoutWidgets, moveWidget, positionedWidgets, reflowWidgets } from './widgetLayout'
import './WidgetEditor.css'
import {useUnsaved} from './CorePages'
import {ConfirmDialog} from './TouchControls'
import TouchText from './TouchText'

export const widgetIcons:Record<WidgetId,LucideIcon>={clock:Clock3,schedule:CalendarDays,weather:CloudSun,forecast:CloudSun,tasks:CheckCheck,memo:StickyNote,transit:TrainFront}

export function WidgetPreview({id}:{id:WidgetId}) {
  return <div className={`widget-mini preview-${id}`} aria-hidden="true">
    {id==='clock'&&<><span>{jaDate(today(),{month:'long',day:'numeric',weekday:'short'})}</span><strong className="mini-clock">12:45</strong></>}
    {id==='schedule'&&<><div className="mini-agenda"><time>08:00</time><b>みんなで朝ごはん</b></div><div className="mini-agenda"><time>14:00</time><b>ピアノ教室</b></div><div className="mini-agenda"><time>16:30</time><b>週末の買い出し</b></div></>}
    {id==='weather'&&<><div className="mini-weather"><strong>18°</strong><CloudSun size={43}/></div><span>晴れ時々くもり</span><span>最高 20°　最低 12°</span></>}
    {id==='forecast'&&<div className="mini-forecast"><div><strong>18°</strong><CloudSun size={34}/><span>いま</span></div><div className="mini-forecast-days">{['今日','明日','月','火','水'].map((label,i)=><div key={label}><span>{label}</span>{i===1?<Sun size={23}/>:<CloudSun size={23}/>}<b>{20-i%3}°</b></div>)}</div></div>}
    {id==='tasks'&&<>{['観葉植物に水やり','牛乳とたまごを買う','明日の持ちもの'].map(t=><div className="mini-task" key={t}><span/>{t}</div>)}</>}
    {id==='memo'&&<><b>あや <small>から、みんなへ</small></b><strong className="mini-note">日曜日は公園で<br/>ピクニックしよう。</strong></>}
    {id==='transit'&&<><div className="mini-transit"><b>JR神戸線</b><strong>○</strong></div><div className="mini-transit"><b>阪急神戸線</b><strong>○</strong></div></>}
  </div>
}

export default function WidgetEditor({initial,onSave,onCancel,saving=false}:{initial:Widget[];saving?:boolean;onSave:(widgets:Widget[])=>void;onCancel:()=>void}) {
  const [widgets,setWidgets]=useState(()=>positionedWidgets(initial))
  const [selected,setSelected]=useState<WidgetId|null>(initial[0]?.id??null)
  const [query,setQuery]=useState('')
  const [pane,setPane]=useState<'catalog'|'layout'>('layout')
  const [dragging,setDragging]=useState<WidgetId|null>(null)
  const [hover,setHover]=useState<{x:number;y:number}|null>(null)
  const [notice,setNotice]=useState('')
  const canvas=useRef<HTMLDivElement>(null)
  const placed=layoutWidgets(widgets),rows=layoutRows(widgets),fits=rows<=2
  const active=placed.find(w=>w.id===selected)
  const dirty=JSON.stringify(positionedWidgets(initial))!==JSON.stringify(widgets)
  useUnsaved(dirty)
  const [discard,setDiscard]=useState(false)
  const shown=(Object.keys(widgetDefinitions) as WidgetId[]).filter(id=>`${widgetDefinitions[id].title} ${id==='clock'?'時計':''}`.includes(query.trim()))

  function add(id:WidgetId) {
    if(!widgets.some(w=>w.id===id)) {setWidgets(p=>reflowWidgets([...p,{id,size:'standard'}]));setNotice(`${widgetDefinitions[id].title}を追加しました`)}
    setSelected(id);setPane('layout')
  }
  function remove() {
    if(!selected)return
    const next=widgets.filter(w=>w.id!==selected)
    setWidgets(reflowWidgets(next));setSelected(null);setNotice(`${widgetDefinitions[selected].title}を外しました`)
  }
  function move(x:number,y:number) {if(selected){setWidgets(p=>moveWidget(p,selected,x,y));setNotice('配置を変更しました')}}
  function changeSize(size:Widget['size']) {if(selected)setWidgets(p=>reflowWidgets(p.map(w=>w.id===selected?{...w,size,y:size==='tall'?1:w.y}:w),selected))}
  function cellAt(clientX:number,clientY:number) {
    const rect=canvas.current?.getBoundingClientRect()
    if(!rect||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null
    return {x:Math.max(1,Math.min(12,Math.floor((clientX-rect.left)/rect.width*12)+1)),y:Math.max(1,Math.min(rows,Math.floor((clientY-rect.top)/rect.height*rows)+1))}
  }
  function drag(event:PointerEvent<HTMLButtonElement>,id:WidgetId) {
    if(event.button!==0)return
    const target=event.currentTarget, startX=event.clientX,startY=event.clientY
    const item=placed.find(w=>w.id===id)!,startCell=cellAt(startX,startY)
    const offsetX=(startCell?.x??item.x)-item.x,offsetY=(startCell?.y??item.y)-item.y
    const destination=(x:number,y:number)=>{const cell=cellAt(x,y);return cell?{x:Math.max(1,Math.min(cell.x-offsetX,13-item.w)),y:Math.max(1,Math.min(cell.y-offsetY,3-item.h))}:null}
    target.setPointerCapture(event.pointerId);setSelected(id)
    let moved=false
    const update=(e:globalThis.PointerEvent)=>{
      if(Math.abs(e.clientX-startX)+Math.abs(e.clientY-startY)>12)moved=true
      if(moved){setDragging(id);setHover(destination(e.clientX,e.clientY))}
    }
    const end=(e:globalThis.PointerEvent)=>{
      const cell=destination(e.clientX,e.clientY)
      if(e.type==='pointerup'&&moved&&cell){setWidgets(p=>moveWidget(p,id,cell.x,cell.y));setNotice('配置を変更しました')}
      setDragging(null);setHover(null)
      target.removeEventListener('pointermove',update);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',end)
    }
    target.addEventListener('pointermove',update);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end)
  }

  return <fieldset disabled={saving} className="widget-editor-boundary"><section className="widget-designer" aria-label="ウィジェットの選択と配置">
    <header className="designer-header"><div><h1>ウィジェットを配置</h1><span>{widgets.length}個を使用中</span></div><div className="designer-actions"><button className="button subtle" onClick={()=>dirty?setDiscard(true):onCancel()}>キャンセル</button><button className="button primary" disabled={!fits||saving} onClick={()=>onSave(positionedWidgets(widgets))}><Check size={20}/>{saving?'保存中…':'配置を保存'}</button></div></header>
    <ConfirmDialog open={discard} title="配置の変更を破棄しますか？" onConfirm={onCancel} onCancel={()=>setDiscard(false)}/>
    <div className="designer-tabs" role="group" aria-label="編集パネル"><button aria-pressed={pane==='catalog'} onClick={()=>setPane('catalog')}><Plus size={19}/>ウィジェット一覧</button><button aria-pressed={pane==='layout'} onClick={()=>setPane('layout')}><Grip size={19}/>配置</button></div>
    <div className={`designer-workspace show-${pane}`}>
      <aside className="widget-library surface" aria-label="ウィジェット一覧"><div className="library-heading"><h2>ウィジェット</h2><TouchText label="ウィジェットを検索" value={query} onChange={setQuery} maxLength={60}/></div><div className="widget-catalog">{shown.map(id=>{const def=widgetDefinitions[id],Icon=widgetIcons[id],added=widgets.some(w=>w.id===id);return <button key={id} className={`catalog-widget ${id===selected?'selected':''}`} aria-label={`${def.title}${added?'を選択':'を追加'}`} aria-pressed={added} onClick={()=>add(id)}><WidgetPreview id={id}/><span className="catalog-widget-label"><Icon size={18}/><strong>{def.title}</strong>{added?<Check size={19}/>:<Plus size={19}/>}</span></button>})}{!shown.length&&<p className="library-empty">該当するウィジェットがありません</p>}</div></aside>
      <div className="layout-workspace"><div className="layout-heading"><h2>ホームのプレビュー</h2></div><div className="layout-scroll"><div className="layout-canvas" ref={canvas} style={{'--layout-rows':rows} as CSSProperties} aria-label="配置図">
        {Array.from({length:rows*12},(_,i)=>{const x=i%12+1,y=Math.floor(i/12)+1,covered=placed.some(p=>x>=p.x&&x<p.x+p.w&&y>=p.y&&y<p.y+p.h);return <button key={i} className={`layout-cell ${covered?'covered-cell':''} ${y>2?'overflow-cell':''} ${hover?.x===x&&hover?.y===y?'drop-target':''}`} style={{gridColumn:x,gridRow:y}} aria-label={`${y}段目の${x}列目に配置`} aria-hidden={covered||undefined} disabled={!selected||covered} onClick={()=>move(x,y)}/>})}
        {placed.map(widget=>{const def=widgetDefinitions[widget.id],Icon=widgetIcons[widget.id];return <button key={widget.id} data-layout-widget={widget.id} className={`layout-widget ${selected===widget.id?'selected':''} ${dragging===widget.id?'dragging':''} ${widget.y+widget.h>3?'outside-screen':''}`} style={{gridColumn:`${widget.x} / span ${widget.w}`,gridRow:`${widget.y} / span ${widget.h}`}} aria-label={`${def.title}を配置図で選択`} aria-pressed={selected===widget.id} onPointerDown={e=>drag(e,widget.id)} onClick={()=>setSelected(widget.id)}><span className="layout-widget-heading"><Icon size={19}/><strong>{def.title}</strong><Grip size={18}/></span><WidgetPreview id={widget.id}/></button>})}
        {dragging&&hover&&active&&<div className="layout-drop-preview" aria-hidden="true" style={{gridColumn:`${hover.x} / span ${active.w}`,gridRow:`${hover.y} / span ${active.h}`}}/>}
        {!widgets.length&&<div className="layout-empty"><Plus size={30}/><strong>ウィジェットを追加</strong><button className="button subtle" onClick={()=>setPane('catalog')}>一覧から選ぶ</button></div>}
      </div></div>
      <div className="layout-status" role="status">{!fits?<span className="layout-error">2段に収まりません。ウィジェットを外すか、サイズ・位置を調整してください。</span>:<span>1920 × 1080・スクロールなし</span>}<span className="sr-only">{notice}</span></div>
      <section className="widget-inspector surface" aria-label="選択したウィジェットの操作">{active?<><strong className="inspector-title">{widgetDefinitions[active.id].title}</strong><div className="inspector-controls"><div className="inspector-sizes" role="group" aria-label="ウィジェットのサイズ">{(['standard','wide','tall'] as const).map(size=><button key={size} aria-pressed={active.size===size} onClick={()=>changeSize(size)}>{{standard:'標準',wide:'横長',tall:'縦長'}[size]}</button>)}</div><div className="inspector-move" role="group" aria-label="ウィジェットの移動"><button aria-label="左へ移動" disabled={active.x===1} onClick={()=>move(active.x-1,active.y)}><ArrowLeft size={20}/></button><button aria-label="上へ移動" disabled={active.y===1} onClick={()=>move(active.x,active.y-1)}><ArrowUp size={20}/></button><button aria-label="下へ移動" disabled={active.y>=2||active.h===2} onClick={()=>move(active.x,active.y+1)}><ArrowDown size={20}/></button><button aria-label="右へ移動" disabled={active.x+active.w===13} onClick={()=>move(active.x+1,active.y)}><ArrowRight size={20}/></button></div><button className="button remove-widget" onClick={remove}><Trash2 size={19}/>ホームから外す</button></div></>:<span className="inspector-placeholder">配置図のウィジェットを選択</span>}</section>
      </div>
    </div>
  </section></fieldset>
}
