import {useRef} from 'react'
import type {PointerEvent} from 'react'
import {appendPoint,crossedPoints} from './pattern'

export default function PatternLock({value,onChange,disabled=false,label='管理者パターン'}:{value:number[];onChange:(p:number[])=>void;disabled?:boolean;label?:string}){
  const dragging=useRef<number|null>(null),last=useRef<{x:number;y:number}|null>(null),path=useRef(value)
  path.current=value
  const update=(nodes:number[])=>{let next=path.current;for(const node of nodes)next=appendPoint(next,node);path.current=next;onChange(next)}
  function coordinates(e:PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-r.left)*300/r.width,y:(e.clientY-r.top)*300/r.height}}
  function release(e:PointerEvent<HTMLDivElement>){if(dragging.current!==e.pointerId)return;dragging.current=null;last.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
  return <div className="pattern-input"><div className="pattern-board" role="group" aria-label={label} onPointerDown={e=>{
    if(disabled||e.button!==0||dragging.current!==null)return
    const point=coordinates(e),nodes=crossedPoints(point,point)
    if(!nodes.length)return
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);dragging.current=e.pointerId;last.current=point;update(nodes)
  }} onPointerMove={e=>{if(disabled||dragging.current!==e.pointerId||!last.current)return;const point=coordinates(e);update(crossedPoints(last.current,point));last.current=point}} onPointerUp={release} onPointerCancel={e=>{release(e);path.current=[];onChange([])}}>
    <svg viewBox="0 0 300 300" aria-hidden="true"><polyline points={value.map(n=>`${n%3*100+50},${Math.floor(n/3)*100+50}`).join(' ')}/></svg>
    {Array.from({length:9},(_,node)=><button key={node} type="button" aria-label={`点${node+1}`} aria-pressed={value.includes(node)} disabled={disabled} className={value.includes(node)?'chosen':''} onClick={e=>{if(e.detail===0&&!disabled)update([node])}}><span/></button>)}
  </div><div className="pattern-status"><span role="status">{value.length?`${value.length}個の点を選択`:'4個以上の点を結んでください'}</span><button type="button" className="button subtle" disabled={disabled||!value.length} onClick={()=>{path.current=[];onChange([])}}>やり直す</button></div><small>ドラッグ、点の順次選択、キーボードで入力できます。</small></div>
}
