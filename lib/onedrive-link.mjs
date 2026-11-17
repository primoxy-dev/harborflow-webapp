export function oneDriveFolderLink(value) {
  if(typeof value!=='string'||value.length>2048)return '';
  try{
    const url=new URL(value);
    const microsoft=url.hostname==='1drv.ms'||url.hostname==='onedrive.live.com'||url.hostname.endsWith('.sharepoint.com');
    return microsoft&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:'';
  }catch{return '';}
}
