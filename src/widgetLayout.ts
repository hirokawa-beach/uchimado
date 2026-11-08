import { forecastWidgets, initialSettings, initialWidgets, readStored, validSettings, validWidgets, widgetDefinitions } from './model'
import type { Widget } from './model'

export type PlacedWidget = Widget & { x:number; y:number; w:number; h:number }
export function widgetDimensions(widget:Widget) {
  const definition=widgetDefinitions[widget.id]
  return { w:widget.size==='wide'?definition.wideColumns:definition.columns, h:widget.size==='tall'?2:1 }
}
export function layoutWidgets(widgets:Widget[], priority?:string):PlacedWidget[] {
  const placed:PlacedWidget[]=[]
  const fixed=(widget:Widget)=>{const {w}=widgetDimensions(widget);return !!widget.x&&!!widget.y&&widget.x+w<=13}
  const free=(x:number,y:number,w:number,h:number)=>x>=1&&x+w<=13&&y>=1&&!placed.some(p=>x<p.x+p.w&&x+w>p.x&&y<p.y+p.h&&y+h>p.y)
  const place=(widget:Widget)=>{
    const {w,h}=widgetDimensions(widget)
    let x=fixed(widget)?widget.x!:0,y=fixed(widget)?widget.y!:0
    if(!free(x,y,w,h)) {
      search:for(y=1;y<=30;y++)for(x=1;x<=13-w;x++)if(free(x,y,w,h))break search
    }
    placed.push({...widget,x,y,w,h})
  }
  // Reserve deliberate positions first. Unpositioned cards fill the remaining cells.
  const ordered=[...widgets].sort((a,b)=>Number(b.id===priority)-Number(a.id===priority)||Number(fixed(b))-Number(fixed(a)))
  ordered.forEach(place)
  return widgets.map(w=>placed.find(p=>p.id===w.id)!)
}
export function layoutRows(widgets:Widget[]) { return Math.max(2,...layoutWidgets(widgets).map(w=>w.y+w.h-1)) }
export function positionedWidgets(widgets:Widget[], priority?:string):Widget[] {return layoutWidgets(widgets,priority).map(({id,size,x,y})=>({id,size,x,y}))}
export function reflowWidgets(widgets:Widget[],priority?:string):Widget[] {
  return positionedWidgets(widgets.map(w=>w.id!==priority&&w.y&&w.y+widgetDimensions(w).h>3?{id:w.id,size:w.size}:w),priority)
}
export function moveWidget(widgets:Widget[],id:string,x:number,y:number):Widget[] {
  return reflowWidgets(widgets.map(w=>w.id===id?{...w,x:Math.max(1,Math.min(x,13-widgetDimensions(w).w)),y:Math.max(1,Math.min(y,3-widgetDimensions(w).h))}:w),id)
}
export function loadHomeWidgets():Widget[] {
  const saved=readStored<Widget[]|null>('widgets',null,validWidgets)
  if(saved!==null)return saved
  const oldSettings=readStored<Partial<typeof initialSettings>&{homeLayout?:string}>('settings',initialSettings,validSettings)
  // Read-only migration: retain both former preset keys as a recovery source.
  return oldSettings.homeLayout==='standard'
    ?readStored('layout',initialWidgets,validWidgets)
    :readStored('forecastLayout',forecastWidgets,validWidgets)
}
