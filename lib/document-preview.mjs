const TYPES = Object.freeze({ oktb: 'OKTB', permit: 'Terminal Permit', loi: 'LOI' });
const clean = value => String(value ?? '').trim();
const CATEGORIES = new Set(['On-signers','Off-signers','Medical visitors','SIRE Inspectors','Surveyors','Service Engineers','Other']);

export function documentTypes() { return TYPES; }

// Default previews omit identifiers and routes. Detailed crew output is enabled
// only by the permission-checked documents API; Operations remains the source.
export function buildDocumentPreview(type, job, people = [], trips = [], options = {}) {
  if (!Object.hasOwn(TYPES, type)) throw Error('Unknown document type');
  if (!job?.id || !job?.data) throw Error('Job is required');
  const crew = people.filter(person => person.kind === 'crew');
  const visitors = people.filter(person => person.kind === 'visitor');
  const detailed = type === 'oktb' && options.crewDetails === true;
  if (detailed) people = people.filter(person => person.kind === 'crew');
  const personSummary = people.map((person, index) => ({
    label: `${person.kind === 'crew' ? 'Crew' : 'Visitor'} ${index + 1}`,
    category: CATEGORIES.has(person.data?.category) ? person.data.category : 'Not set',
    name: 'WITHHELD IN TRIAL',
    passport: 'WITHHELD IN TRIAL',
    hasPassport: Boolean(clean(person.data?.passport)),
    hasSeamanBook: Boolean(clean(person.data?.seamanBook)),
    flightCount: Array.isArray(person.data?.flights) ? person.data.flights.length : 0,
    ...(detailed ? {
      id: person.id, kind: 'crew', name: clean(person.data.name),
      nationality: clean(person.data.nationality), rank: clean(person.data.rank), dob: clean(person.data.dob),
      seamanBook: clean(person.data.seamanBook), passport: clean(person.data.passport), passportExpiry: clean(person.data.passportExpiry),
      flights: (Array.isArray(person.data.flights) ? person.data.flights : []).map(flight => Object.fromEntries(['airline','number','date','from','to','departure','arrival','booking'].map(key => [key, clean(flight[key]).toUpperCase()])))
    } : {})
  }));
  const travel = trips.map((trip, index) => ({
    label: `Journey ${index + 1}`,
    kind: trip.data?.kind === 'boat' ? 'Boat' : 'Car',
    passengerCount: Array.isArray(trip.data?.personIds) ? trip.data.personIds.length : 0,
    route: 'WITHHELD IN TRIAL'
  }));
  return {
    type, title: TYPES[type], state: 'DRAFT PREVIEW — NOT APPROVED',
    notice: detailed ? 'ร่างจากข้อมูลลูกเรือสมมติที่ได้รับสิทธิ์ดู · ยังไม่อนุมัติ ห้ามใช้ยื่นต่อหน่วยงาน' : 'ข้อมูลบุคคลและเส้นทางถูกปกปิดในระบบทดลอง ห้ามใช้ฉบับนี้ยื่นต่อหน่วยงาน',
    job: { id: job.id, jobNo: clean(job.data.jobNo), vessel: clean(job.data.vessel), port: clean(job.data.port), eta: clean(job.data.eta), principal: clean(job.data.principal) },
    counts: { crew: crew.length, visitors: visitors.length, car: travel.filter(item => item.kind === 'Car').length, boat: travel.filter(item => item.kind === 'Boat').length },
    people: type === 'loi' ? [] : personSummary,
    travel: type === 'oktb' ? travel : [],
    requirements: type === 'oktb' ? ['Crew / Visitor roster', 'Passport verification', 'Flight and transport review'] : type === 'permit' ? ['Terminal confirmation', 'Visitor / crew access conditions', 'Document validity'] : ['Purpose and addressee', 'Principal authorization', 'Owner approval'],
    downloadAllowed: false
  };
}

