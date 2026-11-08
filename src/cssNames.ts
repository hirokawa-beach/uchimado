/** Resolve component-local names while retaining explicitly shared Kagiroi classes. */
export function cssNames(styles:Record<string,string>,value:string){return value.split(/\s+/).filter(Boolean).map(name=>styles[name]||name).join(' ')}
