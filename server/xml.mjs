/** Small bounded XML reader for PGEarth's documented XML feed. No DTD, external entities or executable markup. */
export function decodeXml(s){
  return String(s??'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>{
    if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e.toLowerCase()]??'';
  });
}
export function parseXml(xml){
  if(typeof xml!=='string'||xml.length>8_000_000)throw new Error('XML size limit.');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD and entities are not allowed.');
  const root={name:'$root',children:[],text:''},stack=[root];
  const tokens=xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g)||[];
  let nodes=0;
  for(const token of tokens){
    if(token.startsWith('<!--')||token.startsWith('<?'))continue;
    const top=stack.at(-1);
    if(token.startsWith('<![CDATA[')){top.text+=token.slice(9,-3);continue;}
    if(token.startsWith('</')){const name=token.slice(2,-1).trim();if(stack.length<=1||top.name!==name)throw new Error('Malformed XML closing tag.');stack.pop();continue;}
    if(token.startsWith('<')){
      const m=token.match(/^<([\w:.-]+)(?:\s[^<>]*)?\s*\/?>$/);if(!m)throw new Error('Malformed XML tag.');
      if(++nodes>100000||stack.length>40)throw new Error('XML complexity limit.');
      const node={name:m[1],children:[],text:''};top.children.push(node);if(!token.endsWith('/>'))stack.push(node);
    }else top.text+=decodeXml(token);
  }
  if(stack.length!==1)throw new Error('Unclosed XML tags.');return root;
}
export const children=(node,name)=>(node?.children||[]).filter(n=>n.name===name);
export const child=(node,name)=>children(node,name)[0];
export const value=(node,name)=>child(node,name)?.text.trim()??'';
export function descendants(node,name){return (node?.children||[]).flatMap(n=>[...(n.name===name?[n]:[]),...descendants(n,name)]);}
export const plain=s=>decodeXml(String(s??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p\s*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/\r/g,'').trim().slice(0,20000);
