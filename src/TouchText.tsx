import {useRef,useState} from 'react'
import {Keyboard} from 'lucide-react'
import {editText,TouchKeyboard} from './TouchKeyboard'

export default function TouchText({label,value,onChange,maxLength,multiline=false,required=false}:{label:string;value:string;onChange:(s:string)=>void;maxLength:number;multiline?:boolean;required?:boolean}){
  const [open,setOpen]=useState(false),ref=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null)
  const common={value,required,maxLength,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange(e.target.value)}
  return <div className="touch-text-field"><label className="field-label">{label}{multiline?<textarea {...common} rows={5} ref={el=>{ref.current=el}}/>:<input {...common} ref={el=>{ref.current=el}}/>}</label><button type="button" className="button subtle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Keyboard size={20}/>{label}の画面キーボード</button>{open&&<TouchKeyboard onKey={key=>{const el=ref.current,result=editText(value,el?.selectionStart??value.length,el?.selectionEnd??value.length,key);onChange((multiline?result.text:result.text.replace(/[\r\n]/g,' ')).slice(0,maxLength));requestAnimationFrame(()=>{el?.focus({preventScroll:true});el?.setSelectionRange(result.cursor,result.cursor)})}}/>}</div>
}
