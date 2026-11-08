export const PROFILE_KEY='uchimado.profile'
export function selectedProfile(){try{return localStorage.getItem(PROFILE_KEY)||''}catch{return ''}}
export class ApiError extends Error { constructor(public status:number,message:string){super(message)} }
export async function api<T=unknown>(url:string,method='GET',body?:unknown):Promise<T> {
  let response:Response
  const profile=selectedProfile()
  try {response=await fetch(`/api${url}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Uchimado':'1',...(profile?{'X-Uchimado-Profile':profile}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)})}
  catch {throw new ApiError(0,'サーバーに接続できません。接続を確認して再試行してください。入力内容はこの画面に残っています。')}
  const data=await response.json().catch(()=>({detail:'サーバーの応答を確認できません。'}))
  if(!response.ok)throw new ApiError(response.status,typeof data.detail==='string'?data.detail:'入力内容を確認してください。')
  return data as T
}
export const errorText=(e:unknown)=>e instanceof Error?e.message:'保存できませんでした。再試行してください。'
