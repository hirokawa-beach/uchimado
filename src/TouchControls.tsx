import {useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {Check, ChevronDown, X} from 'lucide-react'

export const memberLabel=(name:string)=>name==='家族'?'共通':name

export function TouchChoice({label,value,options,onChange,compact=false}:{label:string;value:string;options:readonly (readonly [string,string])[];onChange:(value:string)=>void;compact?:boolean}){
  const [open,setOpen]=useState(false)
  const choices=<div className="touch-choices" role="group" aria-label={label}>{options.map(([id,name])=><button type="button" key={id} aria-pressed={id===value} onClick={()=>{onChange(id);setOpen(false)}}>{name}{id===value&&<Check size={18}/>}</button>)}</div>
  return <div className="touch-choice"><span className="field-label">{label}</span>{options.length<=6&&!compact?choices:<><button type="button" className="choice-trigger" aria-haspopup="dialog" aria-label={`${label}：${options.find(([id])=>id===value)?.[1]||'選択'}`} onClick={()=>setOpen(true)}>{options.find(([id])=>id===value)?.[1]||'選択'}<ChevronDown size={20}/></button><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal container={document.querySelector('.app-shell')}><Dialog.Overlay className="choice-overlay"/><Dialog.Content className="choice-dialog" aria-describedby={undefined}><div className="window-heading"><Dialog.Title>{label}を選択</Dialog.Title><Dialog.Close className="icon-button" aria-label="選択を閉じる"><X/></Dialog.Close></div>{choices}</Dialog.Content></Dialog.Portal></Dialog.Root></>}</div>
}

export function ConfirmDialog({open,title='変更を破棄しますか？',description='保存していない変更は失われます。',confirm='破棄して閉じる',cancel='編集を続ける',onConfirm,onCancel,busy=false}:{open:boolean;title?:string;description?:string;confirm?:string;cancel?:string;onConfirm:()=>void;onCancel:()=>void;busy?:boolean}){
  return <Dialog.Root open={open} onOpenChange={v=>{if(!v&&!busy)onCancel()}}><Dialog.Portal container={document.querySelector('.app-shell')}><Dialog.Overlay className="confirm-overlay"/><Dialog.Content className="confirm-dialog" onOpenAutoFocus={e=>{e.preventDefault();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.confirm-dialog .confirm-cancel')?.focus())}} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}} onPointerDownOutside={e=>e.preventDefault()}><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description><div className="form-actions"><button type="button" className="button subtle confirm-cancel" disabled={busy} onClick={onCancel}>{cancel}</button><button type="button" className="button danger" disabled={busy} onClick={onConfirm}>{busy?'処理中…':confirm}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
}

const colors=[['#53786c','緑'],['#397eaa','青'],['#6655a1','紫'],['#ac526e','ピンク'],['#ad4941','赤'],['#ad7136','オレンジ'],['#89752b','黄'],['#377b82','青緑'],['#626b72','グレー'],['#785d49','茶']] as const
export function ColorPalette({value,onChange}:{value:string;onChange:(color:string)=>void}){
  const all=colors.some(([c])=>c===value)?colors:[...colors,[value,'現在の色'] as const]
  return <fieldset className="color-palette"><legend>予定の色</legend><div>{all.map(([color,name])=><button type="button" key={color} style={{backgroundColor:color}} aria-label={name} aria-pressed={color===value} onClick={()=>onChange(color)}>{color===value&&<Check/>}</button>)}</div></fieldset>
}
