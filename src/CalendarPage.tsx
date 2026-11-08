import {cssNames} from './cssNames'
import calendarPageStyles from './CalendarPage.module.css'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react'
import { addDays, dateKey, eventsFor, jaDate, memberClass, startWeek, today } from './model'
import type { CalendarEvent, Member } from './model'
import { useCore } from './core'
import {memberLabel} from './TouchControls'

type Mode = 'month' | 'week' | 'day'

const localStyles = {...calendarPageStyles}

export default function CalendarPage({events,onAdd,onEdit}:{events:CalendarEvent[];onAdd:(day?:string,time?:string)=>void;onEdit:(event:CalendarEvent)=>void}) {
  const core=useCore()
  const members=[...new Set(['家族',...core.state.members.map(u=>u.name),...events.map(e=>e.member)])]
  const [cursor,setCursor] = useState(today)
  const [mode,setMode] = useState<Mode>('month')
  const [filters,setFilters] = useState<Member[]>([...members])
  const [page,setPage] = useState(0)
  const [pageSize,setPageSize] = useState(5)
  const agendaRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const element=agendaRef.current
    if(!element)return
    const measure=()=>{
      const reserved=mode==='week'?150:36
      const row=mode==='week'?98:106
      const gap=mode==='week'?6:10
      setPageSize(Math.max(1,Math.min(5,Math.floor((element.clientHeight-reserved+gap)/row))))
    }
    const observer=new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return()=>observer.disconnect()
  },[mode])
  const monthStart = new Date(cursor.getFullYear(),cursor.getMonth(),1)
  const weekCount = Math.ceil((monthStart.getDay()+new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate())/7)
  const dates = Array.from({length:weekCount*7},(_,i)=>addDays(startWeek(monthStart),i))
  const visible = events.filter(e=>filters.includes(e.member))
  const days = mode==='day' ? [cursor] : Array.from({length:7},(_,i)=>addDays(startWeek(cursor),i))
  const lists = days.map(d=>eventsFor(visible,dateKey(d)))
  const pages = Math.max(1,...lists.map(list=>Math.ceil(list.length/pageSize)))
  const currentPage = Math.min(page,pages-1)
  function selectMode(value:Mode) {setMode(value);setPage(0)}
  function selectDay(day:Date) {setCursor(day);setMode('day');setPage(0)}
  function move(n:number) {setCursor(d=>mode==='month'?new Date(d.getFullYear(),d.getMonth()+n,1):addDays(d,n*(mode==='week'?7:1)));setPage(0)}
  function eventTime(e:CalendarEvent) {return e.allDay?'終日':`${e.start}〜${e.end}`}
  const period = mode==='day' ? jaDate(cursor,{year:'numeric',month:'long',day:'numeric',weekday:'short'}) : mode==='week' ? `${jaDate(days[0],{year:'numeric',month:'long',day:'numeric'})}〜${jaDate(days[6],{month:'long',day:'numeric'})}` : jaDate(cursor,{year:'numeric',month:'long'})

  return <section className={cssNames(localStyles, "calendar-screen")}>
    <div className={cssNames(localStyles, "calendar-screen-heading")}><h1><CalendarDays size={27}/>カレンダー</h1><button className="button primary" onClick={()=>onAdd(dateKey(cursor))}><Plus size={21}/>予定を追加</button></div>
    <div className={cssNames(localStyles, "calendar-board surface")}>
      <div className={cssNames(localStyles, "cal-toolbar")}><div className={cssNames(localStyles, "cal-period")}><button className="icon-button" aria-label="前の期間" onClick={()=>move(-1)}><ChevronLeft size={23}/></button><h2>{period}</h2><button className="icon-button" aria-label="次の期間" onClick={()=>move(1)}><ChevronRight size={23}/></button><button className="button subtle" onClick={()=>{setCursor(today());setPage(0)}}>今日</button></div><div className="segmented" aria-label="カレンダー表示">{(['month','week','day'] as const).map((value,i)=><button key={value} aria-pressed={mode===value} className={mode===value?'selected':''} onClick={()=>selectMode(value)}>{['月','週','日'][i]}</button>)}</div></div>
      <div className={cssNames(localStyles, "cal-members")} role="group" aria-label="表示するメンバー"><span>メンバー</span>{members.map(member=><button className={cssNames(localStyles, `cal-member ${memberClass[member]}`)} key={member} aria-pressed={filters.includes(member)} onClick={()=>{setFilters(p=>p.includes(member)?p.filter(v=>v!==member):[...p,member]);setPage(0)}}><span className={cssNames(localStyles, "cal-member-check")}>{filters.includes(member)&&<Check size={15}/>}</span>{memberLabel(member)}</button>)}{filters.length===0&&<p role="status">表示するメンバーを選んでください</p>}</div>
      {mode==='month' ? <div className={cssNames(localStyles, "cal-month-view")}><div className={cssNames(localStyles, "cal-weekdays")}>{'日月火水木金土'.split('').map((d,i)=><span key={d} className={cssNames(localStyles, i===0?'sunday':i===6?'saturday':'')}>{d}</span>)}</div><div className={cssNames(localStyles, "cal-month-grid")} data-weeks={weekCount} style={{gridTemplateRows:`repeat(${weekCount},minmax(0,1fr))`}}>{dates.map(day=>{
        const key=dateKey(day),list=eventsFor(visible,key),isToday=key===dateKey(today())
        return <div key={key} className={cssNames(localStyles, `cal-day ${day.getMonth()!==cursor.getMonth()?'outside-month':''}`)}><button className={cssNames(localStyles, "cal-day-open")} aria-label={`${jaDate(day,{month:'long',day:'numeric'})}の予定${list.length}件を表示`} onClick={()=>selectDay(day)}><span className={cssNames(localStyles, "cal-day-heading")}><span className={cssNames(localStyles, `cal-date ${isToday?'is-today':''}`)}>{day.getDate()}{isToday&&<small>今日</small>}</span>{list.length>1&&<span className={cssNames(localStyles, "cal-more")}>+{list.length-1}</span>}</span>{list.slice(0,1).map(event=><span key={`${event.id}:${event.occurrenceDate||event.date}`} className={cssNames(localStyles, `cal-event event-${memberClass[event.member]}`)}><time>{event.allDay?'終日':event.start}</time><strong><span className="event-color" style={{backgroundColor:event.color||'#53786c'}} aria-hidden="true"/>{event.title}</strong></span>)}</button></div>
      })}</div></div> : mode==='week' ? <div className={cssNames(localStyles, "cal-week-agenda")} ref={agendaRef}>{days.map((day,index)=><section className={cssNames(localStyles, "cal-agenda-day")} key={dateKey(day)}><button className={cssNames(localStyles, `cal-agenda-date ${dateKey(day)===dateKey(today())?'is-today':''}`)} onClick={()=>selectDay(day)}><span>{jaDate(day,{weekday:'short'})}</span><strong>{day.getDate()}</strong><small>{lists[index].length}件</small></button><div className={cssNames(localStyles, "cal-agenda-items")}>{lists[index].slice(currentPage*pageSize,(currentPage+1)*pageSize).map(event=><button key={`${event.id}:${event.occurrenceDate||event.date}`} className={cssNames(localStyles, `cal-week-event event-${memberClass[event.member]}`)} onClick={()=>onEdit(event)}><time>{eventTime(event)}</time><strong><span className="event-color" style={{backgroundColor:event.color||'#53786c'}} aria-hidden="true"/>{event.title}</strong><span>{memberLabel(event.member)}</span></button>)}{lists[index].length===0&&<p className={cssNames(localStyles, "cal-empty")}>予定なし</p>}</div><button className={cssNames(localStyles, "cal-day-add")} aria-label={`${jaDate(day,{month:'long',day:'numeric'})}の予定を追加`} onClick={()=>{setCursor(day);onAdd(dateKey(day))}}><Plus size={19}/><span>追加</span></button></section>)}</div> : <div className={cssNames(localStyles, "cal-day-agenda")} ref={agendaRef}>{lists[0].length===0 ? <div className={cssNames(localStyles, "cal-day-empty")}><CalendarDays size={42}/><p>この日の予定はありません</p><button className="button subtle" onClick={()=>onAdd(dateKey(cursor))}><Plus size={20}/>予定を追加</button></div> : lists[0].slice(currentPage*pageSize,(currentPage+1)*pageSize).map(event=><button className={cssNames(localStyles, `cal-day-event event-${memberClass[event.member]}`)} key={`${event.id}:${event.occurrenceDate||event.date}`} onClick={()=>onEdit(event)}><time>{eventTime(event)}</time><div><strong><span className="event-color" style={{backgroundColor:event.color||'#53786c'}} aria-hidden="true"/>{event.title}</strong>{event.location&&<span><MapPin size={15}/>{event.location}</span>}</div><span className={cssNames(localStyles, `cal-event-member ${memberClass[event.member]}`)}>{memberLabel(event.member)}</span></button>)}</div>}
      {mode!=='month'&&<div className={cssNames(localStyles, "cal-footer")}><span className={cssNames(localStyles, "cal-page-count")}>{currentPage+1} / {pages}ページ</span><div className={cssNames(localStyles, "cal-page-buttons")}><button className="button subtle" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={19}/>前の予定</button><button className="button subtle" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>次の予定<ChevronRight size={19}/></button></div></div>}
    </div>
  </section>
}
