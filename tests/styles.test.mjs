import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import ts from 'typescript'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const files=readdirSync(new URL('../src/',import.meta.url))
const globals=new Set(['reset.css','tokens.css','themes.css','global.css'])
const modules=files.filter(f=>f.endsWith('.module.css'))
const localClasses=new Set(modules.flatMap(f=>[...read('src/'+f).replace(/:global\([^)]*\)/g,'').matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m=>m[1])))

function sourceFiles(visit){for(const file of files.filter(f=>f.endsWith('.tsx'))){const source=ts.createSourceFile(file,read('src/'+file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const walk=node=>{visit(node,source,file);ts.forEachChild(node,walk)};walk(source)}}

test('styling dependencies and source contain no framework utilities or directives',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'))
 for(const name of [...Object.keys(pkg.dependencies||{}),...Object.keys(pkg.devDependencies||{}),...Object.keys(lock.packages||{})])assert.doesNotMatch(name,/tailwind/i)
 assert.doesNotMatch(read('vite.config.ts'),/tailwind/i)
 for(const file of files.filter(f=>f.endsWith('.tsx')))assert.doesNotMatch(read('src/'+file),/\b(?:sr-only|flex-1)\b/)
 for(const file of [...modules,...[...globals].map(f=>'styles/'+f)])assert.doesNotMatch(read('src/'+file),/@(?:tailwind|apply|theme|utility|variant|source|reference|config|plugin)\b|--tw-|@import\s+['"]tailwindcss/)
})

test('global CSS is limited to foundations and component CSS is imported as modules',()=>{
 assert.ok(modules.length>0)
 assert.deepEqual(files.filter(f=>f.endsWith('.css')&&!f.endsWith('.module.css')),[])
 assert.deepEqual(new Set(readdirSync(new URL('../src/styles/',import.meta.url))),globals)
 sourceFiles((node,source,file)=>{
  if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text.endsWith('.css')){
   const path=node.moduleSpecifier.text
   if(path.endsWith('.module.css'))assert.ok(node.importClause?.name, file+': module needs an export binding')
   else assert.ok(file==='main.tsx'&&path.startsWith('./styles/')&&globals.has(path.split('/').pop()),file+': unexpected global CSS import '+path)
  }
  if(ts.isJsxAttribute(node)&&node.name.getText(source)==='className'&&node.initializer&&ts.isStringLiteral(node.initializer)){
   for(const name of node.initializer.text.split(/\s+/))assert.ok(!localClasses.has(name),file+': local class bypasses CSS Modules: '+name)
  }
 })
})

test('portal and focus hooks do not query generated class names',()=>{
 sourceFiles((node,source,file)=>{
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['querySelector','querySelectorAll','closest'].includes(node.expression.name.text)){
   const selector=node.arguments[0]
   if(selector&&ts.isStringLiteral(selector))assert.doesNotMatch(selector.text,/\.[A-Za-z_-]/,file+': DOM hook must use a data attribute, ID or ref')
  }
 })
 assert.match(read('src/App.tsx'),/data-app-shell/)
 assert.match(read('src/TouchControls.tsx'),/data-confirm-dialog/)
 assert.match(read('src/TouchControls.tsx'),/data-confirm-cancel/)
})


test('dynamic widget previews retain variants also styled by other screens',()=>{
 const source=ts.createSourceFile('model.ts',read('src/model.ts'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 let ids=[]
 const walk=node=>{
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='widgetDefinitions'){
   let value=node.initializer
   while(value&&(ts.isAsExpression(value)||ts.isSatisfiesExpression(value)))value=value.expression
   assert.ok(value&&ts.isObjectLiteralExpression(value))
   ids=value.properties.map(p=>p.name.getText(source).replace(/['"]/g,''))
  }
  ts.forEachChild(node,walk)
 }
 walk(source)
 assert.ok(ids.length)
 const editor=new Set([...read('src/WidgetEditor.module.css').replace(/:global\([^)]*\)/g,'').matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m=>m[1]))
 for(const id of ids){const name='preview-'+id;if(localClasses.has(name))assert.ok(editor.has(name),'Widget preview variant would lose its style: '+name)}
})
