import {cssNames} from './cssNames'
import touchTextStyles from './TouchText.module.css'
import {createContext,useContext,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {Keyboard,X} from 'lucide-react'
import {editText,TouchKeyboard} from './TouchKeyboard'

type Target={element:HTMLInputElement|HTMLTextAreaElement;label:string;onChange:(s:string)=>void;maxLength:number;multiline:boolean}
const Context=createContext<{open:(t:Target)=>void;close:()=>void;active:HTMLElement|null}|null>(null)
const localStyles = {...touchTextStyles}

export function keepKeyboardInteraction(event:{detail:{originalEvent:PointerEvent};preventDefault:()=>void}){if((event.detail.originalEvent.target as Element)?.closest('[data-touch-keyboard]'))event.preventDefault()}

export function TouchKeyboardProvider({children}:{children:ReactNode}){
  const [target,setTarget]=useState<Target|null>(null),[position,setPosition]=useState({left:12,top:12,width:600,maxHeight:360}),box=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!target)return
    const place=()=>{
      if(!target.element.isConnected||target.element.matches(':disabled')){setTarget(null);return}
      const vv=window.visualViewport,w=vv?.width||innerWidth,h=vv?.height||innerHeight,x=vv?.offsetLeft||0,y=vv?.offsetTop||0,r=target.element.getBoundingClientRect(),height=Math.min(360,h-24),width=Math.min(640,w-24)
      if(r.bottom<y||r.top>y+h){setTarget(null);return}
      const below=y+h-r.bottom-12,above=r.top-y-12
      const top=below>=height||below>=above?r.bottom+8:r.top-height-8
      setPosition({left:Math.max(x+12,Math.min(r.left,x+w-width-12)),top:Math.max(y+12,Math.min(top,y+h-height-12)),width,maxHeight:height})
    }
    const dismiss=(e:PointerEvent)=>{if(e.target!==target.element&&!box.current?.contains(e.target as Node))setTarget(null)}
    const focus=(e:FocusEvent)=>{if(e.target!==target.element&&!box.current?.contains(e.target as Node))setTarget(null)}
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setTarget(null)}}
    place();window.addEventListener('resize',place);document.addEventListener('scroll',place,true);document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',escape,true);document.addEventListener('focusin',focus,true);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place)
    const observer=new MutationObserver(()=>{if(!target.element.isConnected||target.element.matches(':disabled'))setTarget(null)})
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']})
    return()=>{observer.disconnect();window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',escape,true);document.removeEventListener('focusin',focus,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place)}
  },[target])
  const portal=document.querySelector('[data-app-shell]')
  return <Context.Provider value={{open:setTarget,close:()=>setTarget(null),active:target?.element||null}}>{children}{target&&portal&&createPortal(<div className={cssNames(localStyles, "floating-keyboard")} data-touch-keyboard ref={box} style={position} role="region" aria-label={`${target.label}の画面キーボード`}><div className={cssNames(localStyles, "floating-keyboard-heading")}><strong>{target.label}に入力</strong><button type="button" className="button subtle" onPointerDown={e=>e.preventDefault()} onClick={()=>{target.element.inputMode='text';setTarget(null);target.element.focus({preventScroll:true})}}>端末のキーボード</button><button type="button" className="icon-button" aria-label="画面キーボードを閉じる" onPointerDown={e=>e.preventDefault()} onClick={()=>setTarget(null)}><X/></button></div><TouchKeyboard onKey={key=>{const el=target.element,result=editText(el.value,el.selectionStart??el.value.length,el.selectionEnd??el.value.length,key),text=target.multiline?result.text:result.text.replace(/[\r\n]/g,' ');target.onChange(text.slice(0,target.maxLength));requestAnimationFrame(()=>{el.setSelectionRange(Math.min(result.cursor,target.maxLength),Math.min(result.cursor,target.maxLength))})}}/></div>,portal)}</Context.Provider>
}

export default function TouchText({label,value,onChange,maxLength,multiline=false,required=false,disabled=false}:{label:string;value:string;onChange:(s:string)=>void;maxLength:number;multiline?:boolean;required?:boolean;disabled?:boolean}){
  const ref=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null),keyboard=useContext(Context),changeRef=useRef(onChange);changeRef.current=onChange
  const activate=()=>{const el=ref.current;if(el&&el.inputMode!=='text'&&!el.matches(':disabled'))keyboard?.open({element:el,label,onChange:s=>changeRef.current(s),maxLength,multiline})}
  const common={value,required,maxLength,disabled,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange(e.target.value),onFocus:activate,onClick:activate,inputMode:'none' as const}
  const open=()=>{const el=ref.current;if(el){el.inputMode='none';el.focus({preventScroll:true});activate()}}
  return <div className={cssNames(localStyles, "touch-text-field")}><label className="field-label">{label}{multiline?<textarea {...common} rows={4} ref={el=>{ref.current=el}}/>:<input {...common} ref={el=>{ref.current=el}}/>}</label><button type="button" className={cssNames(localStyles, "keyboard-field-button")} disabled={disabled} aria-label={`${label}の画面キーボードを開く`} onClick={open}><Keyboard size={19}/><span>画面キーボード</span></button></div>
}
