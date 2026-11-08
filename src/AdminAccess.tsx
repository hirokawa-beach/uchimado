import {useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {X} from 'lucide-react'
import {api,errorText} from './api'
import PatternLock from './PatternLock'

export type SessionInfo={setupRequired:boolean;canSetup:boolean;familyName:string}
export default function AdminAccess({session,onDone,onClose,change=false}:{session:SessionInfo;onDone:()=>Promise<void>;onClose:()=>void;change?:boolean}){
  const [mode,setMode]=useState<'unlock'|'setup'|'recover'|'change'>(change?'change':session.setupRequired?'setup':'unlock')
  const [pattern,setPattern]=useState<number[]>([]),[confirmation,setConfirmation]=useState<number[]>([]),[current,setCurrent]=useState<number[]>([])
  const [stage,setStage]=useState<'current'|'new'|'confirm'>(change?'current':'new')
  const [family,setFamily]=useState(session.familyName),[recovery,setRecovery]=useState(''),[code,setCode]=useState('')
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[stored,setStored]=useState(false),[discard,setDiscard]=useState(false)
  const resets=(next:typeof mode)=>{setMode(next);setPattern([]);setConfirmation([]);setStage('new');setRecovery('');setError('')}
  const closes=()=>{if(busy)return;if(code&&!stored){setDiscard(true);return}onClose()}
  async function submit(){
    if(mode!=='unlock'&&stage!=='confirm'){if(stage==='current'){setStage('new');return}setStage('confirm');return}
    if(mode!=='unlock'&&JSON.stringify(pattern)!==JSON.stringify(confirmation)){setError('確認用パターンが一致しません。');return}
    setBusy(true);setError('')
    try{
      const url={unlock:'/admin/unlock',setup:'/admin/setup',recover:'/admin/recover',change:'/admin/pattern'}[mode]
      const result=await api<{recoveryCode?:string}>(url,'POST',{pattern,...(mode==='unlock'?{}:{confirmation}),...(mode==='setup'?{family_name:family}:{}),...(mode==='recover'?{recovery_code:recovery}:{}),...(mode==='change'?{current_pattern:current}:{})})
      setPattern([]);setConfirmation([]);setCurrent([]);setRecovery('')
      if(result.recoveryCode){setCode(result.recoveryCode);await onDone()}else{await onDone();onClose()}
    }catch(e){setError(errorText(e));if(mode==='unlock')setPattern([])}finally{setBusy(false)}
  }
  const value=stage==='current'?current:stage==='confirm'?confirmation:pattern
  const setter=stage==='current'?setCurrent:stage==='confirm'?setConfirmation:setPattern
  return <Dialog.Root open onOpenChange={v=>{if(!v)closes()}}><Dialog.Portal container={document.querySelector('.app-shell')||document.body}><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="floating-window admin-access" aria-describedby="admin-access-description"><div className="window-heading"><Dialog.Title>{code?'回復コードを保管':mode==='unlock'?'管理者の解除':mode==='recover'?'管理者の復旧':mode==='change'?'パターンの変更':'管理者の初期設定'}</Dialog.Title><button className="icon-button" type="button" onClick={closes} aria-label="閉じる"><X/></button></div><Dialog.Description id="admin-access-description">{code?'このコードは再表示できません。端末とは別の安全な場所へ保管してください。':'プロフィール管理・家族名・バックアップなどの管理操作を解除します。解除は15分間有効です。'}</Dialog.Description>
    {code?<div className="core-fields"><output className="recovery-code">{code.match(/.{1,8}/g)?.join('-')}</output><p>使用すると無効になり、新しい回復コードに入れ替わります。復旧・パターン変更後は新しいパターンで解除してください。</p><button className="button subtle" onClick={()=>{const blob=new Blob([`uchimado administrator recovery code\n${code}\nKeep this offline. Anyone with this code can reset the administrator pattern.\n`],{type:'text/plain'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='uchimado-recovery-code.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}}>回復コードをファイルに保存</button><label className="toggle-row"><span>回復コードを保管しました</span><input type="checkbox" checked={stored} onChange={e=>setStored(e.target.checked)}/></label>{discard&&<p role="alert">保管を確認してから閉じてください。</p>}<button className="button primary" disabled={!stored} onClick={onClose}>完了</button></div>:mode==='setup'&&!session.canSetup?<p>初期設定はサーバーPCでlocalhostから開いて行ってください。通常の家族利用はそのまま使えます。</p>:<form className="core-fields" onSubmit={e=>{e.preventDefault();void submit()}}>
      {mode==='setup'&&<label className="field-label">家族の名前<input required maxLength={80} value={family} onChange={e=>setFamily(e.target.value)} disabled={busy}/></label>}
      {mode==='recover'&&<label className="field-label">回復コード<input required type="password" value={recovery} onChange={e=>setRecovery(e.target.value)} autoComplete="off" maxLength={100} disabled={busy}/></label>}
      <p className="pattern-prompt">{mode==='unlock'?'管理者パターンを入力':stage==='current'?'現在のパターンを入力':stage==='confirm'?'同じパターンをもう一度入力':'新しいパターンを入力'}</p>
      <PatternLock value={value} onChange={setter} disabled={busy}/>{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">{stage==='confirm'&&<button type="button" className="button subtle" disabled={busy} onClick={()=>{setStage('new');setConfirmation([])}}>戻る</button>}<button className="button primary" disabled={busy||value.length<4}>{busy?'確認中…':mode==='unlock'?'管理者として解除':stage==='confirm'?'設定する':'次へ'}</button></div>
      {mode==='unlock'&&<button className="button subtle" type="button" disabled={busy} onClick={()=>resets('recover')}>パターンを忘れた</button>}{mode==='recover'&&<><p className="muted">回復コードもない場合は、サーバーの管理者がローカル保守コマンドを実行してください。</p><button className="button subtle" type="button" disabled={busy} onClick={()=>resets('unlock')}>解除画面に戻る</button></>}
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
