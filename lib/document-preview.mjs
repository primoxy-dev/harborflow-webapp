const TYPES = Object.freeze({ oktb: 'OKTB', permit: 'Terminal Permit', loi: 'LOI' });
const clean = value => String(value ?? '').trim();
const CATEGORIES = new Set(['On-signers','Off-signers','Medical visitors','SIRE Inspectors','Surveyors','Service Engineers','Other']);

export function documentTypes() { return TYPES; }

// Pilot previews deliberately omit person identifiers, free text and detailed routes.
// The source records stay in Operations; no copy is saved by this module.
export function buildDocumentPreview(type, job, people = [], trips = []) {
  if (!Object.hasOwn(TYPES, type)) throw Error('Unknown document type');
  if (!job?.id || !job?.data) throw Error('Job is required');
  const crew = people.filter(person => person.kind === 'crew');
  const visitors = people.filter(person => person.kind === 'visitor');
  const personSummary = people.map((person, index) => ({
    label: `${person.kind === 'crew' ? 'Crew' : 'Visitor'} ${index + 1}`,
    category: CATEGORIES.has(person.data?.category) ? person.data.category : 'Not set',
    name: 'WITHHELD IN TRIAL',
    passport: 'WITHHELD IN TRIAL',
    hasPassport: Boolean(clean(person.data?.passport)),
    hasSeamanBook: Boolean(clean(person.data?.seamanBook)),
    flightCount: Array.isArray(person.data?.flights) ? person.data.flights.length : 0
  }));
  const travel = trips.map((trip, index) => ({
    label: `Journey ${index + 1}`,
    kind: trip.data?.kind === 'boat' ? 'Boat' : 'Car',
    passengerCount: Array.isArray(trip.data?.personIds) ? trip.data.personIds.length : 0,
    route: 'WITHHELD IN TRIAL'
  }));
  return {
    type, title: TYPES[type], state: 'DRAFT PREVIEW — NOT APPROVED',
    notice: 'ข้อมูลบุคคลและเส้นทางถูกปกปิดในระบบทดลอง ห้ามใช้ฉบับนี้ยื่นต่อหน่วยงาน',
    job: { id: job.id, jobNo: clean(job.data.jobNo), vessel: clean(job.data.vessel), port: clean(job.data.port), eta: clean(job.data.eta), principal: clean(job.data.principal) },
    counts: { crew: crew.length, visitors: visitors.length, car: travel.filter(item => item.kind === 'Car').length, boat: travel.filter(item => item.kind === 'Boat').length },
    people: type === 'loi' ? [] : personSummary,
    travel: type === 'oktb' ? travel : [],
    requirements: type === 'oktb' ? ['Crew / Visitor roster', 'Passport verification', 'Flight and transport review'] : type === 'permit' ? ['Terminal confirmation', 'Visitor / crew access conditions', 'Document validity'] : ['Purpose and addressee', 'Principal authorization', 'Owner approval'],
    downloadAllowed: false
  };
}

