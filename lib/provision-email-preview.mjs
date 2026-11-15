import msgreader from '@kenjiuno/msgreader';

const MsgReader = msgreader.default;
const bounded = (value,limit=500) => typeof value === 'string' ? value.slice(0,limit) : '';
function address(person) {
  const name=bounded(person.name);
  const email=bounded(person.email);
  return name && email && name!==email ? name+' <'+email+'>' : name||email;
}

export function readMessagePreview(bytes) {
  const message=new MsgReader(bytes).getFileData();
  if (message.error || (message.messageClass && !/^IPM\.Note(?:\.|$)/i.test(message.messageClass))) {
    throw Error('Unsupported message');
  }
  const recipients=kind=>(message.recipients||[]).filter(person=>person.recipType===kind).slice(0,100)
    .map(person=>address({name:person.name,email:person.smtpAddress||person.email})).filter(Boolean).join('; ');
  const body=bounded(message.body,100000);
  return {
    subject:bounded(message.subject),from:address({name:message.senderName,email:message.senderSmtpAddress||message.senderEmail}),
    to:recipients('to'),cc:recipients('cc'),date:bounded(message.clientSubmitTime||message.messageDeliveryTime||message.creationTime),
    body,html:body?'':bounded(message.bodyHtml||(message.html?new TextDecoder().decode(message.html):''),200000)
  };
}
